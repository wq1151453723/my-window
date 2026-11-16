// Edge 在线神经语音合成服务。
//
// 主路径：已安装的 msedge-tts（无需 API key）。
// 兜底：msedge-tts 因上游端点变更而失效时，改用 Node 24 内置全局 WebSocket 自实现 Edge 协议。
//
// 对外只暴露 synthesize / listVoices / estimateDurationSeconds / DEFAULT_VOICE 四个入口。

import fs from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import {
  MsEdgeTTS,
  MetadataOptions,
  OUTPUT_FORMAT,
  ProsodyOptions,
  RATE,
  VOLUME,
  PITCH,
} from 'msedge-tts';
import { buildSilentMp3, parseMp3 } from './mp3.js';
import { describeError, escapeXml, fetchEdgeVoices, synthesizeViaProtocol } from './protocol.js';

/** 合成参数；rate / volume / pitch 既接受枚举值也接受 SSML 相对写法（如 +10%） */
export interface TtsOptions {
  voice?: string;
  rate?: string;
  volume?: string;
  pitch?: string;
}

export interface TtsResult {
  /** 落盘的 MP3 绝对路径 */
  filePath: string;
  /** MP3 字节数 */
  bytes: number;
  /** 实际使用的音色 */
  voice: string;
  /** 由 MP3 帧头实测得到的时长（秒） */
  estimatedSeconds: number;
}

/** 默认音色：中文女声，讲解感强，适合长文连读 */
export const DEFAULT_VOICE: string = 'zh-CN-XiaoxiaoNeural';

/** 单次送入 Edge 的最大字符数，超过会被上游截断，所以要分段 */
const MAX_SEGMENT_CHARS = 2000;

/** 段落之间的静音时长（秒） */
const SEGMENT_GAP_SECONDS = 1;

/** 语速标定：实测 zh-CN-XiaoxiaoNeural 约 0.216 秒/字，即约 4.6 字/秒 */
const CJK_CHARS_PER_SECOND = 4.6;

/** 英文按词计速，约 2.2 词/秒 */
const LATIN_WORDS_PER_SECOND = 2.2;

/** 标点带来的额外停顿（秒） */
const PUNCTUATION_PAUSE_SECONDS = 0.12;

/** 起播前的固定开销（秒） */
const LEAD_IN_SECONDS = 0.3;

/** prosody 默认值（与 msedge-tts 的 ProsodyOptions 运行时默认值一致） */
const DEFAULT_PITCH = '+0Hz';
const DEFAULT_RATE = '1';
const DEFAULT_VOLUME = '100';

const RATE_VALUES: readonly string[] = Object.values(RATE);
const VOLUME_VALUES: readonly string[] = Object.values(VOLUME);
const PITCH_VALUES: readonly string[] = Object.values(PITCH);

/**
 * 估算朗读时长（秒）。
 * 用于合成前的预估（例如填充 reading_minutes）；合成完成后以 MP3 帧头实测值为准。
 */
export function estimateDurationSeconds(text: string): number {
  if (typeof text !== 'string' || text.length === 0) return 0;

  const cjkChars = (text.match(/[\u3400-\u9fff\uf900-\ufaff]/g) ?? []).length;
  const latinWords = (text.match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*/g) ?? []).length;
  const pauses = (text.match(/[。！？!?；;，,、…]/g) ?? []).length;

  const seconds =
    cjkChars / CJK_CHARS_PER_SECOND +
    latinWords / LATIN_WORDS_PER_SECOND +
    pauses * PUNCTUATION_PAUSE_SECONDS +
    LEAD_IN_SECONDS;

  return Math.round(seconds * 100) / 100;
}

/** 从音色名里推断语言标签，例如 zh-CN-liaoning-XiaobeiNeural -> zh-CN */
function inferLocale(voice: string): string {
  const matched = /\b[a-z]{2,3}-[A-Z]{2}\b/.exec(voice);
  return matched ? matched[0] : 'zh-CN';
}

/** 校验并归一化 prosody 取值：枚举值或 +10% / -2st / +50Hz / 0.5 形式的相对写法 */
function resolveProsodyValue(
  value: string | undefined,
  enumValues: readonly string[],
  fallback: string,
): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  if (enumValues.includes(trimmed)) return trimmed;
  if (/^[+-]?\d+(\.\d+)?(%|st|Hz)?$/.test(trimmed)) return trimmed;
  return fallback;
}

/** 组装 msedge-tts 的 prosody 参数 */
function buildProsody(options: TtsOptions): ProsodyOptions {
  const prosody = new ProsodyOptions();
  prosody.pitch = resolveProsodyValue(options.pitch, PITCH_VALUES, DEFAULT_PITCH);
  prosody.rate = resolveProsodyValue(options.rate, RATE_VALUES, DEFAULT_RATE);
  prosody.volume = resolveProsodyValue(options.volume, VOLUME_VALUES, DEFAULT_VOLUME);
  return prosody;
}

/** 把朗读稿切成不超过 maxChars 的段落，优先在句末标点处断开 */
export function splitIntoSegments(text: string, maxChars: number = MAX_SEGMENT_CHARS): string[] {
  const normalized = (typeof text === 'string' ? text : '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const sentences = normalized.split(/(?<=[。！？!?；;\n])/).filter((item) => item.trim().length > 0);
  const segments: string[] = [];
  let current = '';

  const push = (piece: string): void => {
    if (!piece) return;
    if (current.length + piece.length <= maxChars) {
      current += piece;
      return;
    }
    if (current) segments.push(current);
    current = piece;
  };

  for (const sentence of sentences) {
    let rest = sentence;
    while (rest.length > maxChars) {
      const head = rest.slice(0, maxChars);
      const comma = Math.max(head.lastIndexOf('，'), head.lastIndexOf('、'), head.lastIndexOf(','));
      const cut = comma > maxChars * 0.5 ? comma + 1 : maxChars;
      if (current) {
        segments.push(current);
        current = '';
      }
      segments.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    push(rest);
  }
  if (current) segments.push(current);

  return segments.filter((item) => item.trim().length > 0);
}

/** 收集 msedge-tts 的音频流 */
function collectStream(stream: Readable): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let settled = false;
    const finish = (error: Error | null, result?: Buffer): void => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve(result as Buffer);
    };
    stream.on('data', (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.once('end', () => finish(null, Buffer.concat(chunks)));
    stream.once('error', (error: Error) => finish(error));
  });
}

/** msedge-tts 后端：同一个连接连续合成多段，减少握手次数 */
class MsEdgeBackend {
  private tts: MsEdgeTTS | null = null;
  private voice = '';

  private async ensure(voice: string): Promise<MsEdgeTTS> {
    if (this.tts && this.voice === voice) return this.tts;
    this.close();
    const tts = new MsEdgeTTS({ connectionTimeoutMs: 20000, synthesisTimeoutMs: 30000 });
    const metadata = new MetadataOptions();
    metadata.voiceLocale = inferLocale(voice);
    metadata.sentenceBoundaryEnabled = false;
    metadata.wordBoundaryEnabled = false;
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3, metadata);
    this.tts = tts;
    this.voice = voice;
    return tts;
  }

  async synthesize(text: string, voice: string, options: TtsOptions): Promise<Buffer> {
    const tts = await this.ensure(voice);
    const { audioStream } = tts.toStream(escapeXml(text), buildProsody(options));
    return await collectStream(audioStream);
  }

  close(): void {
    try {
      this.tts?.close();
    } catch {
      // 关闭失败不影响结果
    }
    this.tts = null;
    this.voice = '';
  }
}

const msEdgeBackend = new MsEdgeBackend();

/** 原生协议后端（msedge-tts 失效时的兜底） */
async function synthesizeViaNativeProtocol(
  text: string,
  voice: string,
  options: TtsOptions,
): Promise<Buffer> {
  const prosody = buildProsody(options);
  return await synthesizeViaProtocol(text, {
    voice,
    locale: inferLocale(voice),
    rate: String(prosody.rate),
    volume: String(prosody.volume),
    pitch: String(prosody.pitch),
    timeoutMs: 30000,
  });
}

/** 选择后端：默认 msedge-tts，可用环境变量 TTS_BACKEND=protocol 强制走原生协议 */
function preferredBackend(): 'msedge' | 'protocol' {
  return process.env.TTS_BACKEND?.toLowerCase() === 'protocol' ? 'protocol' : 'msedge';
}

/** 单段合成：主路径失败时自动切到原生协议兜底 */
async function synthesizeSegment(text: string, voice: string, options: TtsOptions): Promise<Buffer> {
  if (preferredBackend() === 'protocol') {
    return await synthesizeViaNativeProtocol(text, voice, options);
  }
  try {
    return await msEdgeBackend.synthesize(text, voice, options);
  } catch (primaryError) {
    try {
      return await synthesizeViaNativeProtocol(text, voice, options);
    } catch (fallbackError) {
      throw new Error(
        'Edge 语音合成失败：' +
        describeError(primaryError) +
        '；原生协议兜底同样失败：' +
        describeError(fallbackError),
      );
    }
  }
}

/**
 * 把中文讲解稿合成为 MP3 并落盘。
 *
 * 长文本会先按 2000 字符切段顺序合成，段间插入 1 秒静音，最后按字节拼接为一个 MP3。
 * 任何一步失败都会抛出带中文说明的 Error，不会静默返回空文件。
 */
export async function synthesize(
  text: string,
  outFile: string,
  options?: TtsOptions,
): Promise<TtsResult> {
  const source = typeof text === 'string' ? text : '';
  if (!source.trim()) {
    throw new Error('Edge 语音合成失败：待合成文本为空');
  }
  if (typeof outFile !== 'string' || !outFile.trim()) {
    throw new Error('Edge 语音合成失败：输出路径为空');
  }

  const settings: TtsOptions = options ?? {};
  const voice = (settings.voice ?? DEFAULT_VOICE).trim() || DEFAULT_VOICE;
  const segments = splitIntoSegments(source, MAX_SEGMENT_CHARS);
  if (segments.length === 0) {
    throw new Error('Edge 语音合成失败：切分后没有任何有效段落');
  }

  const pieces: Buffer[] = [];
  try {
    for (let index = 0; index < segments.length; index += 1) {
      const audio = await synthesizeSegment(segments[index], voice, settings);
      if (!audio || audio.length === 0) {
        throw new Error('第 ' + (index + 1) + ' 段返回空音频');
      }
      pieces.push(audio);
      if (index < segments.length - 1) {
        pieces.push(buildSilentMp3(SEGMENT_GAP_SECONDS));
      }
    }
  } finally {
    msEdgeBackend.close();
  }

  const merged = Buffer.concat(pieces);
  if (merged.length === 0) {
    throw new Error('Edge 语音合成失败：拼接后音频为空');
  }

  const info = parseMp3(merged);

  const filePath = path.resolve(outFile);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, merged);

  return {
    filePath,
    bytes: merged.length,
    voice,
    estimatedSeconds: Math.round(info.durationSeconds * 100) / 100,
  };
}

/**
 * 列出 Edge 提供的简体中文（zh-CN）音色。
 */
export async function listVoices(): Promise<Array<{ name: string; locale: string; gender: string; friendlyName?: string }>> {
  const voices = await fetchEdgeVoices();
  return voices
    .filter((voice) => (voice.Locale ?? '').toLowerCase().startsWith('zh-cn'))
    .map((voice) => ({
      name: voice.ShortName ?? voice.Name ?? '',
      locale: voice.Locale ?? '',
      gender: voice.Gender ?? '',
      friendlyName: voice.FriendlyName,
    }))
    .filter((voice) => voice.name.length > 0);
}
