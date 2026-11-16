// Edge 在线语音（Read Aloud）协议的最小实现。
//
// 用途：当已安装的 msedge-tts 因上游端点变更而失效时，用 Node 24 内置的全局 WebSocket
// 直接实现同一套协议（Sec-MS-GEC 校验 + speech.config + ssml + 音频帧），不引入任何新依赖。

import { randomUUID } from 'node:crypto';

/** Edge 端点的公开协议常量，不是密钥 */
export const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';

/** Sec-MS-GEC 版本号，需与 Sec-MS-GEC 的算法版本配套 */
export const SEC_MS_GEC_VERSION = '2-143.0.3650.96';

/** 音色列表接口 */
export const VOICES_URL = 'https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list';

/** 语音合成 WebSocket 接口 */
export const WSS_URL = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1';

/** Edge 客户端 UA 与 Origin，缺一个都会握手失败 */
export const EDGE_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0';
export const EDGE_ORIGIN = 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold';

/** 合成输出格式：24 kHz / 48 kbps / 单声道 MP3 */
export const OUTPUT_FORMAT_MP3 = 'audio-24khz-48kbitrate-mono-mp3';

/** Sec-MS-GEC 算法里的版权声明行，参与 SHA-256 计算 */
const EDGE_COPYRIGHT = 'Copyright (C) Microsoft Corporation. All rights reserved.';

/** 1601-01-01 到 1970-01-01 的秒数差，用于把 Unix 时间换成 Windows FILETIME */
const WINDOWS_EPOCH_OFFSET_SECONDS = 11644473600;

/** Windows FILETIME 每秒 10000000 个 100ns 刻度 */
const TICKS_PER_SECOND = 10000000n;

const SWAP_FIRST_WORD = { swappedWord: 0xef0569fb, swappedSum: 0x76f50f34, swappedProduct: 0xc3efea97 };
const SWAP_SECOND_WORD = { swappedWord: 0xc31713db, swappedSum: 0x1881ce3c, swappedProduct: 0x35bd1ec9 };
const MIX_FIRST_WORD = [0xcf98b111, 0x87085b9f, 0x12ceb96d, 0x257e1d83];
const MIX_SECOND_WORD = [0xa27416f5, 0xd38396ff, 0x7c932b89, 0xbfa49f69];

/** 原生协议单次合成的最大尝试次数 */
const MAX_ATTEMPTS = 4;

/**
 * 重试退避表（毫秒）。
 * 上游偶尔会在握手成功后直接掐掉 TLS 连接（code=1006），
 * 且这种「硬中断」会让同一 IP 在几秒内的后续连接被拒，所以退避要拉得开。
 */
const RETRY_BACKOFF_MS = [1200, 3000, 6000];

/** 本机与服务端的时钟偏差（毫秒），握手 403 时用服务端 Date 修正 */
let clockOffsetMs = 0;

/** 等待若干毫秒 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 把任意错误转成一句可读的中文说明（兼容 Error / ErrorEvent / 带 code 的错误） */
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    const status = (error as { status?: number }).status;
    const statusCode = (error as { statusCode?: number }).statusCode;
    const code = status ?? statusCode;
    const errorCode = (error as { code?: unknown }).code;
    const parts: string[] = [];
    parts.push(error.message && error.message.length > 0 ? error.message : error.name);
    if (code) parts.push('HTTP ' + code);
    if (typeof errorCode === 'string' && errorCode.length > 0) parts.push('code=' + errorCode);
    const cause = (error as { cause?: unknown }).cause;
    if (cause && cause !== error) parts.push('cause=' + describeError(cause));
    return parts.join('，');
  }
  if (typeof error === 'object' && error !== null) {
    const record = error as { message?: unknown; error?: unknown; code?: unknown; type?: unknown };
    if (record.error instanceof Error) return describeError(record.error);
    if (typeof record.message === 'string' && record.message.length > 0) return record.message;
    if (typeof record.error === 'string' && record.error.length > 0) return record.error;
    if (typeof record.type === 'string' && record.type.length > 0) return record.type;
    if (typeof record.code === 'string' && record.code.length > 0) return record.code;
    try {
      return JSON.stringify(error).slice(0, 200);
    } catch {
      return '未知错误';
    }
  }
  if (typeof error === 'string' && error.length > 0) return error;
  return '未知错误';
}

function swapHalves(value: number): number {
  return ((value << 16) | (value >>> 16)) >>> 0;
}

function swapTerm(word: number, key: number, multipliers: typeof SWAP_FIRST_WORD): number {
  const sum = Math.imul(word, key) + Math.imul(swapHalves(word), multipliers.swappedWord);
  const product = Math.imul(swapHalves(sum), multipliers.swappedSum) >>> 0;
  return (Math.imul(swapHalves(product), multipliers.swappedProduct) + product) >>> 0;
}

function swapAndMultiply(value: number, multipliers: readonly number[]): number {
  let current = value >>> 0;
  for (const multiplier of multipliers) {
    current = Math.imul(swapHalves(current), multiplier) >>> 0;
  }
  return current;
}

/** 微软公开算法的 64 位校验和 */
function computeChecksum(message: Uint8Array, digest: Uint8Array): Uint8Array {
  const digestView = new DataView(digest.buffer, digest.byteOffset, digest.byteLength);
  const firstKey = (digestView.getUint32(0, true) | 1) >>> 0;
  const secondKey = (digestView.getUint32(4, true) | 1) >>> 0;

  const padded = new Uint8Array(Math.ceil(message.length / 8) * 8);
  padded.set(message);
  const words = new DataView(padded.buffer);

  let swapSum = 0;
  let lastSwap = 0;
  let mix = 0;
  let mixSum = 0;
  for (let offset = 0; offset < padded.length; offset += 8) {
    const firstWord = words.getUint32(offset, true);
    const secondWord = words.getUint32(offset + 4, true);
    const firstSwap = swapTerm(firstWord, firstKey, SWAP_FIRST_WORD);
    lastSwap = swapTerm(secondWord, secondKey, SWAP_SECOND_WORD);
    swapSum = (swapSum + firstSwap + lastSwap) >>> 0;
    mix = swapAndMultiply(Math.imul(mix + firstWord, firstKey), MIX_FIRST_WORD);
    mixSum = (mixSum + mix) >>> 0;
    mix = swapAndMultiply(Math.imul(mix + secondWord, secondKey), MIX_SECOND_WORD);
    mixSum = (mixSum + mix) >>> 0;
  }

  const checksum = new Uint8Array(8);
  const checksumView = new DataView(checksum.buffer);
  checksumView.setUint32(0, lastSwap ^ mix, true);
  checksumView.setUint32(4, swapSum ^ mixSum, true);
  return checksum;
}

function toUpperHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/**
 * 计算 Sec-MS-GEC 请求头值（微软公开算法 v2）。
 * 组成：SHA-256(版权行 + Windows 刻度 + 客户端令牌) 的校验和 + 摘要。
 */
export async function computeSecMsGec(token: string = TRUSTED_CLIENT_TOKEN): Promise<string> {
  const ticks = Math.floor((Date.now() + clockOffsetMs) / 1000) + WINDOWS_EPOCH_OFFSET_SECONDS;
  const rounded = ticks - (ticks % 300);
  const windowsTicks = (BigInt(rounded) * TICKS_PER_SECOND).toString();

  const message = new TextEncoder().encode(EDGE_COPYRIGHT + windowsTicks + token);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', message));
  return toUpperHex(computeChecksum(message, digest)) + '-' + toUpperHex(digest);
}

/** Edge 音色列表的原始结构 */
export interface EdgeVoice {
  Name?: string;
  ShortName?: string;
  Gender?: string;
  Locale?: string;
  FriendlyName?: string;
  Status?: string;
}

/**
 * 拉取 Edge 音色列表。
 * 端点必须带 trustedclienttoken 查询参数，否则返回 HTTP 401（已实测）。
 */
export async function fetchEdgeVoices(): Promise<EdgeVoice[]> {
  const candidates = [
    VOICES_URL + '?trustedclienttoken=' + TRUSTED_CLIENT_TOKEN,
    VOICES_URL,
  ];

  let lastError = '';
  for (const url of candidates) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': EDGE_USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        lastError = 'HTTP ' + response.status;
        continue;
      }
      const payload = (await response.json()) as unknown;
      if (Array.isArray(payload)) return payload as EdgeVoice[];
      lastError = '返回体不是 JSON 数组';
    } catch (error) {
      lastError = describeError(error);
    }
  }
  throw new Error('Edge 音色列表获取失败：' + lastError);
}

/** 用服务端 Date 头修正本机时钟偏差 */
async function fetchServerClockOffset(): Promise<number | null> {
  try {
    const response = await fetch(VOICES_URL + '?trustedclienttoken=' + TRUSTED_CLIENT_TOKEN, {
      headers: { 'User-Agent': EDGE_USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    const date = response.headers.get('date');
    if (!date) return null;
    const serverMs = Date.parse(date);
    if (!Number.isFinite(serverMs)) return null;
    return serverMs - Date.now();
  } catch {
    return null;
  }
}

/** Node 24 内置全局 WebSocket 的最小接口声明（需要自定义请求头） */
interface EdgeWebSocket {
  binaryType: string;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event: { code: number; reason: string }) => void) | null;
  send(data: string): void;
  close(): void;
}

interface EdgeWebSocketCtor {
  new (url: string, options?: { headers?: Record<string, string> }): EdgeWebSocket;
}

const WebSocketCtor = (globalThis as unknown as { WebSocket?: EdgeWebSocketCtor }).WebSocket;

export interface ProtocolSynthesisOptions {
  voice: string;
  locale: string;
  rate: string;
  volume: string;
  pitch: string;
  /** 单次合成超时（毫秒） */
  timeoutMs?: number;
}

/** 转义 XML 特殊字符，朗读稿来自大模型，必须转义否则服务端会拒绝 SSML */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** 去掉 XML 1.0 不允许的控制字符 */
function stripInvalidXmlChars(text: string): string {
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

/** 组装 SSML 文档 */
export function buildSsml(text: string, options: ProtocolSynthesisOptions): string {
  const body = escapeXml(stripInvalidXmlChars(text));
  return (
    '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" ' +
    'xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="' +
    options.locale +
    '"><voice name="' +
    options.voice +
    '"><prosody pitch="' +
    options.pitch +
    '" rate="' +
    options.rate +
    '" volume="' +
    options.volume +
    '">' +
    body +
    '</prosody></voice></speak>'
  );
}

function buildSynthUrl(): Promise<string> {
  return computeSecMsGec().then((gec) => {
    return (
      WSS_URL +
      '?TrustedClientToken=' +
      TRUSTED_CLIENT_TOKEN +
      '&Sec-MS-GEC=' +
      gec +
      '&Sec-MS-GEC-Version=' +
      SEC_MS_GEC_VERSION +
      '&ConnectionId=' +
      randomUUID()
    );
  });
}

function buildSpeechConfigMessage(): string {
  const body = JSON.stringify({
    context: {
      synthesis: {
        audio: {
          metadataoptions: { sentenceBoundaryEnabled: 'false', wordBoundaryEnabled: 'false' },
          outputFormat: OUTPUT_FORMAT_MP3,
        },
      },
    },
  });
  return 'Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n' + body;
}

function buildSsmlMessage(ssml: string): string {
  const requestId = randomUUID().replace(/-/g, '');
  return (
    'X-RequestId:' +
    requestId +
    '\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n' +
    ssml.trim()
  );
}

/** 把 WebSocket 收到的二进制负载统一成 Buffer */
function toBuffer(message: ArrayBuffer | ArrayBufferView): Buffer {
  if (Buffer.isBuffer(message)) return message;
  if (message instanceof ArrayBuffer) return Buffer.from(new Uint8Array(message));
  return Buffer.from(new Uint8Array(message.buffer, message.byteOffset, message.byteLength));
}

/** 解析一条二进制消息：前 2 字节是头部长度（大端），其后是 ASCII 头 + 负载 */
function parseBinaryMessage(message: ArrayBuffer | ArrayBufferView): { header: string; payload: Buffer } | null {
  const buffer = toBuffer(message);
  if (buffer.length < 2) return null;
  const headerLength = buffer.readUInt16BE(0);
  if (headerLength + 2 > buffer.length) return null;
  return {
    header: buffer.subarray(2, 2 + headerLength).toString('latin1'),
    payload: buffer.subarray(2 + headerLength),
  };
}

function synthesizeOnce(ssml: string, options: ProtocolSynthesisOptions): Promise<Buffer> {
  const timeoutMs = options.timeoutMs ?? 30000;
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let settled = false;
    let socket: EdgeWebSocket | null = null;

    const finish = (error: Error | null, result?: Buffer): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket?.close();
      } catch {
        // 关闭失败不影响结果
      }
      if (error) reject(error);
      else resolve(result as Buffer);
    };

    const timer = setTimeout(() => {
      finish(new Error('WebSocket 合成超时（' + timeoutMs + ' 毫秒）'));
    }, timeoutMs);

    const start = async (): Promise<void> => {
      if (!WebSocketCtor) {
        finish(new Error('当前 Node 运行时没有内置 WebSocket，需要 Node 22 及以上'));
        return;
      }
      const url = await buildSynthUrl();
      socket = new WebSocketCtor(url, {
        headers: { 'User-Agent': EDGE_USER_AGENT, Origin: EDGE_ORIGIN },
      });
      socket.binaryType = 'arraybuffer';

      socket.onopen = () => {
        socket?.send(buildSpeechConfigMessage());
        socket?.send(buildSsmlMessage(ssml));
      };

      socket.onmessage = (event: { data: unknown }) => {
        const data = event.data;
        if (typeof data === 'string') {
          if (data.includes('Path:turn.end')) finish(null, Buffer.concat(chunks));
          return;
        }
        if (data instanceof ArrayBuffer) {
          const parsed = parseBinaryMessage(data);
          if (parsed && parsed.header.includes('Path:audio')) chunks.push(parsed.payload);
          return;
        }
        if (Buffer.isBuffer(data)) {
          const parsed = parseBinaryMessage(data);
          if (parsed && parsed.header.includes('Path:audio')) chunks.push(parsed.payload);
        }
      };

      let errorDetail = '';
      socket.onerror = (event: unknown) => {
        // 只记录错误，等随后的 close 事件补上 code/reason，诊断信息才完整
        errorDetail = describeError(event);
      };

      socket.onclose = (event: { code: number; reason: string }) => {
        const reason = event.reason && event.reason.length > 0 ? event.reason : '无';
        const prefix = errorDetail.length > 0 ? 'WebSocket 连接失败：' + errorDetail : 'WebSocket 提前关闭';
        finish(new Error(prefix + '（code=' + event.code + ', reason=' + reason + '）'));
      };
    };

    start().catch((error: unknown) => finish(new Error(describeError(error))));
  });
}

/**
 * 用原生 WebSocket 完成一次合成。
 * 首次握手失败时用服务端时间修正时钟偏差后再试一次。
 */
export async function synthesizeViaProtocol(text: string, options: ProtocolSynthesisOptions): Promise<Buffer> {
  const source = typeof text === 'string' ? text.trim() : '';
  if (!source) throw new Error('Edge 语音合成失败：待合成文本为空');

  const ssml = buildSsml(source, options);
  let lastError = '';
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      return await synthesizeOnce(ssml, options);
    } catch (error) {
      lastError = describeError(error);
      // SSML 被上游拒绝属于内容问题，重试没有意义
      if (lastError.includes('SSML is invalid')) break;
      // 首次失败先按服务端时间修正本机时钟偏差
      if (attempt === 0) {
        const offset = await fetchServerClockOffset();
        // HTTP Date 头只有秒级精度，5 秒以内的偏差属于噪声，写进去会让 GEC 落到错误的 5 分钟窗口
        if (offset !== null && Math.abs(offset) > 5000) clockOffsetMs = offset;
      }
      if (attempt < MAX_ATTEMPTS - 1) {
        await delay(RETRY_BACKOFF_MS[Math.min(attempt, RETRY_BACKOFF_MS.length - 1)]);
        continue;
      }
      break;
    }
  }
  throw new Error('Edge 语音合成失败（原生协议模式）：' + lastError);
}
