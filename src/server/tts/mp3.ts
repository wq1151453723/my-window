// MP3 帧解析与静音帧生成。
// Edge 在线语音返回的是 MPEG-2 Layer III / 24000 Hz / 48 kbps / 单声道 的 MP3，
// 这里用帧头逐帧扫描来验证音频是否有效并估算时长，同时生成同样规格的静音帧用于段间停顿。

/** MPEG-1 Layer III 比特率表（kbps），索引即帧头里的比特率索引 */
const MPEG1_L3_BITRATE_KBPS = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];

/** MPEG-2 / MPEG-2.5 Layer III 比特率表（kbps） */
const MPEG2_L3_BITRATE_KBPS = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];

/** 采样率表：键为帧头版本位域（3=MPEG-1，2=MPEG-2，0=MPEG-2.5） */
const SAMPLE_RATES: Record<number, readonly number[]> = {
  3: [44100, 48000, 32000],
  2: [22050, 24000, 16000],
  0: [11025, 12000, 8000],
};

/** Edge 语音的 MP3 规格，用于生成同规格静音帧 */
export const EDGE_MP3 = {
  sampleRate: 24000,
  bitrateKbps: 48,
  channels: 1,
  /** MPEG-2 Layer III 单帧字节数：72 * 48000 / 24000 */
  frameLength: 144,
  /** MPEG-2 单声道 Layer III 侧信息字节数 */
  sideInfoLength: 9,
  /** MPEG-2 Layer III 每帧采样数 */
  samplesPerFrame: 576,
} as const;

export interface Mp3Info {
  /** 有效 MP3 帧数量 */
  frameCount: number;
  /** 按帧头累加得到的时长（秒） */
  durationSeconds: number;
  sampleRate: number;
  bitrateKbps: number;
  channels: number;
  /** MPEG-1 / MPEG-2 / MPEG-2.5 */
  version: string;
  /** Layer III */
  layer: string;
  /** 首个有效帧之前的字节数（ID3 标签等） */
  leadingBytes: number;
  /** 最后一个有效帧结束处的字节位置；等于文件长度说明全文件都是连续合法帧 */
  coveredBytes: number;
}

interface FrameHeader {
  versionBits: number;
  bitrateKbps: number;
  sampleRate: number;
  channelMode: number;
  frameLength: number;
  samplesPerFrame: number;
}

/** 读取一个 MPEG 帧头；不是合法 Layer III 帧头时返回 null */
function readFrameHeader(data: Buffer, offset: number): FrameHeader | null {
  if (offset + 4 > data.length) return null;
  if (data[offset] !== 0xff || (data[offset + 1] & 0xe0) !== 0xe0) return null;

  const versionBits = (data[offset + 1] >> 3) & 0x03;
  const layerBits = (data[offset + 1] >> 1) & 0x03;
  const bitrateIndex = (data[offset + 2] >> 4) & 0x0f;
  const sampleRateIndex = (data[offset + 2] >> 2) & 0x03;
  const padding = (data[offset + 2] >> 1) & 0x01;
  const channelMode = (data[offset + 3] >> 6) & 0x03;

  if (versionBits === 1) return null; // 保留版本
  if (layerBits !== 1) return null; // 只支持 Layer III
  if (bitrateIndex === 0 || bitrateIndex === 15) return null;
  if (sampleRateIndex === 3) return null;

  const version = versionBits === 3 ? 1 : versionBits === 2 ? 2 : 2.5;
  const bitrateTable = version === 1 ? MPEG1_L3_BITRATE_KBPS : MPEG2_L3_BITRATE_KBPS;
  const bitrateKbps = bitrateTable[bitrateIndex];
  const sampleRate = SAMPLE_RATES[versionBits][sampleRateIndex];
  if (!bitrateKbps || !sampleRate) return null;

  const samplesPerFrame = version === 1 ? 1152 : EDGE_MP3.samplesPerFrame;
  const frameLength =
    version === 1
      ? Math.floor((144 * bitrateKbps * 1000) / sampleRate) + padding
      : Math.floor((72 * bitrateKbps * 1000) / sampleRate) + padding;
  if (frameLength < 4) return null;

  return { versionBits, bitrateKbps, sampleRate, channelMode, frameLength, samplesPerFrame };
}

/**
 * 解析 MP3 缓冲：逐帧扫描并累加时长。
 * 解析不出任何有效帧时抛错，避免把空文件当成正常音频返回。
 */
export function parseMp3(data: Buffer): Mp3Info {
  if (!data || data.length === 0) {
    throw new Error('MP3 解析失败：音频数据为空');
  }

  let offset = 0;
  // 跳过 ID3v2 标签
  if (data.length >= 10 && data.toString('latin1', 0, 3) === 'ID3') {
    const size =
      (data[6] & 0x7f) << 21 | (data[7] & 0x7f) << 14 | (data[8] & 0x7f) << 7 | (data[9] & 0x7f);
    offset = 10 + size;
  }

  // 定位第一个有效帧
  const leadingBytes = offset;
  while (offset < data.length) {
    const header = readFrameHeader(data, offset);
    if (header && offset + header.frameLength <= data.length) break;
    offset += 1;
  }
  if (offset >= data.length) {
    throw new Error('MP3 解析失败：未找到有效帧头（数据长度 ' + data.length + ' 字节）');
  }

  let frameCount = 0;
  let durationMs = 0;
  let sampleRate = 0;
  let bitrateKbps = 0;
  let channels = 0;
  let version = '';
  let cursor = offset;

  while (cursor < data.length) {
    const header = readFrameHeader(data, cursor);
    if (!header) break;
    if (cursor + header.frameLength > data.length) break;
    frameCount += 1;
    durationMs += (header.samplesPerFrame * 1000) / header.sampleRate;
    sampleRate = header.sampleRate;
    bitrateKbps = header.bitrateKbps;
    channels = header.channelMode === 3 ? 1 : 2;
    version =
      header.versionBits === 3 ? 'MPEG-1' : header.versionBits === 2 ? 'MPEG-2' : 'MPEG-2.5';
    cursor += header.frameLength;
  }

  if (frameCount === 0) {
    throw new Error('MP3 解析失败：帧头扫描到 0 个完整帧');
  }

  return {
    frameCount,
    durationSeconds: durationMs / 1000,
    sampleRate,
    bitrateKbps,
    channels,
    version,
    layer: 'Layer III',
    leadingBytes,
    coveredBytes: cursor,
  };
}

/** 判断缓冲是否为可解析的 MP3 */
export function isMp3(data: Buffer): boolean {
  try {
    parseMp3(data);
    return true;
  } catch {
    return false;
  }
}

/**
 * 生成指定秒数的静音 MP3 帧。
 *
 * Edge 免费端点不接受 SSML 的 break 标签（会返回 SSML is invalid），
 * 因此段间静音改用同规格的静音帧拼接：
 * 帧头 4 字节 + 侧信息 9 字节 + 主数据 131 字节 = 144 字节，
 * 侧信息与主数据全 0 时 part2_3_length 为 0，解码结果为静音。
 */
export function buildSilentMp3(seconds: number): Buffer {
  const frameCount = Math.max(0, Math.round((seconds * EDGE_MP3.sampleRate) / EDGE_MP3.samplesPerFrame));
  if (frameCount === 0) return Buffer.alloc(0);

  const frame = Buffer.alloc(EDGE_MP3.frameLength);
  frame[0] = 0xff; // 帧同步
  frame[1] = 0xf3; // MPEG-2 / Layer III / 无 CRC
  frame[2] = 0x64; // 48 kbps / 24 kHz / 无填充
  frame[3] = 0xc4; // 单声道

  const frames = Buffer.alloc(frameCount * EDGE_MP3.frameLength);
  for (let i = 0; i < frameCount; i += 1) {
    frame.copy(frames, i * EDGE_MP3.frameLength);
  }
  return frames;
}

/**
 * 统计缓冲区里的静音帧数量（帧头合法、其余字节全 0）。
 * 段间插入的 1 秒静音就是用这种帧拼出来的。
 */
export function countSilentFrames(data: Buffer): number {
  let offset = 0;
  let count = 0;
  while (offset < data.length) {
    const header = readFrameHeader(data, offset);
    if (!header) {
      offset += 1;
      continue;
    }
    if (offset + header.frameLength > data.length) break;
    let silent = true;
    for (let i = offset + 4; i < offset + header.frameLength; i += 1) {
      if (data[i] !== 0) {
        silent = false;
        break;
      }
    }
    if (silent) count += 1;
    offset += header.frameLength;
  }
  return count;
}
