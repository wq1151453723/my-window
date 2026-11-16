import { setTimeout as sleep } from 'node:timers/promises';

/**
 * 统一出网层：超时、重试、并发闸门、字符集解码。
 * 本机走 Clash 本地代理（127.0.0.1:7899），代理并发连接数很低，
 * 高并发会直接报 connect EADDRINUSE，所以这里做全局并发闸门。
 */

/** 部分站点对空 UA / 默认 UA 直接 403，必须带浏览器 UA */
export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export const DEFAULT_TIMEOUT_MS = 15000;
export const DEFAULT_RETRIES = 3;

/**
 * 代理端并发上限很低，这里保守取 2。
 * 本机上多个任务同时出网时，代理偶发 EADDRINUSE / 连接超时，
 * 靠「低并发 + 多次重试 + 退避」扛过去。
 */
const MAX_CONCURRENT = 2;
const RETRY_BASE_DELAY_MS = 800;
const RETRY_MAX_DELAY_MS = 5000;

let requestCount = 0;

/** 累计出网请求次数（含重试），自检脚本用它核对请求预算 */
export function getRequestCount(): number {
  return requestCount;
}

let active = 0;
const waiters: Array<() => void> = [];

async function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active += 1;
    return;
  }
  await new Promise<void>((resolve) => {
    waiters.push(resolve);
  });
  active += 1;
}

function release(): void {
  active -= 1;
  const next = waiters.shift();
  if (next) next();
}

export interface FetchOptions {
  timeoutMs?: number;
  /** 额外重试次数（总尝试次数 = retries + 1） */
  retries?: number;
  headers?: Record<string, string>;
  accept?: string;
}

export interface FetchOutcome {
  ok: boolean;
  status: number;
  body: string;
  contentType: string;
  error?: string;
}

const CHARSET_ALIAS: Record<string, string> = {
  utf8: 'utf-8',
  'utf-8': 'utf-8',
  gbk: 'gb18030',
  gb2312: 'gb18030',
  gb18030: 'gb18030',
  big5: 'big5',
  'iso-8859-1': 'windows-1252',
  latin1: 'windows-1252',
  'us-ascii': 'utf-8',
};

function normalizeCharset(name: string): string {
  const key = name.toLowerCase().trim();
  return CHARSET_ALIAS[key] ?? key;
}

function detectCharset(buf: Buffer, contentType: string): string {
  const fromCt = /charset\s*=\s*["']?([\w-]+)/i.exec(contentType);
  if (fromCt) return normalizeCharset(fromCt[1]);
  const head = buf.toString('latin1', 0, 1024);
  const fromXml = /<\?xml[^>]*encoding\s*=\s*["']([\w-]+)["']/i.exec(head);
  if (fromXml) return normalizeCharset(fromXml[1]);
  const fromMeta = /charset\s*=\s*["']?([\w-]+)/i.exec(head);
  if (fromMeta) return normalizeCharset(fromMeta[1]);
  return 'utf-8';
}

/**
 * 按 BOM / HTTP 头 / XML 声明 / HTML meta 依次判断编码。
 * 国内不少站点「声明 utf-8 实际 GBK」，出现大量替换字符时改用 gb18030 重解。
 */
export function decodeBuffer(buf: Buffer, contentType: string): string {
  if (buf.length === 0) return '';
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    buf = buf.subarray(3);
  } else if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(buf);
  } else if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(buf);
  }
  const charset = detectCharset(buf, contentType);
  let text: string;
  try {
    text = new TextDecoder(charset, { fatal: false }).decode(buf);
  } catch {
    text = new TextDecoder('utf-8', { fatal: false }).decode(buf);
  }
  if (charset === 'utf-8') {
    const bad = (text.match(/\uFFFD/g) ?? []).length;
    if (bad > 4) {
      try {
        const alt = new TextDecoder('gb18030', { fatal: false }).decode(buf);
        if ((alt.match(/\uFFFD/g) ?? []).length < bad) text = alt;
      } catch {
        /* 保留原解码结果 */
      }
    }
  }
  return text;
}

function describeError(err: unknown): string {
  const e = err as { name?: string; message?: string; cause?: { code?: string; message?: string } };
  const cause = e?.cause;
  const code = cause?.code ? String(cause.code) : '';
  const msg = cause?.message ?? e?.message ?? String(err);
  return `${e?.name ?? 'Error'}${code ? '(' + code + ')' : ''}: ${String(msg).slice(0, 140)}`;
}

/** 带超时 / 重试 / 并发闸门的 GET，返回文本。失败不抛异常，只标记 ok=false */
export async function fetchText(url: string, opts: FetchOptions = {}): Promise<FetchOutcome> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = opts.retries ?? DEFAULT_RETRIES;
  let lastError = 'unknown error';
  let lastStatus = 0;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    await acquire();
    let timer: NodeJS.Timeout | undefined;
    try {
      requestCount += 1;
      const controller = new AbortController();
      timer = setTimeout(() => controller.abort(), timeoutMs);
      const headers: Record<string, string> = {
        'User-Agent': USER_AGENT,
        Accept:
          opts.accept ??
          'application/rss+xml, application/atom+xml, application/xml, text/xml, application/json, text/html;q=0.9, */*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
      };
      if (opts.headers) Object.assign(headers, opts.headers);
      const res = await fetch(url, { headers, redirect: 'follow', signal: controller.signal });
      const buf = Buffer.from(await res.arrayBuffer());
      const contentType = res.headers.get('content-type') ?? '';
      const body = decodeBuffer(buf, contentType);
      if (res.ok) return { ok: true, status: res.status, body, contentType };
      lastStatus = res.status;
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      lastError = describeError(err);
    } finally {
      if (timer) clearTimeout(timer);
      release();
    }
    if (attempt < retries) {
      // 本地代理连接耗尽（EADDRINUSE）退避更久一点，避免立刻再撞上
      const busy = lastError.includes('EADDRINUSE');
      const base = Math.min(RETRY_BASE_DELAY_MS * 2 ** attempt, RETRY_MAX_DELAY_MS);
      await sleep(base + (busy ? 1200 : 0) + Math.floor(Math.random() * 250));
    }
  }
  return { ok: false, status: lastStatus, body: '', contentType: '', error: lastError };
}

/** fetchText + JSON 解析；解析失败同样不抛异常 */
export async function fetchJson<T = unknown>(
  url: string,
  opts: FetchOptions = {},
): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
  const res = await fetchText(url, {
    accept: 'application/json',
    ...opts,
    headers: { Accept: 'application/json', ...(opts.headers ?? {}) },
  });
  if (!res.ok) return { ok: false, status: res.status, data: null, error: res.error };
  try {
    return { ok: true, status: res.status, data: JSON.parse(res.body) as T };
  } catch (err) {
    return { ok: false, status: res.status, data: null, error: describeError(err) };
  }
}
