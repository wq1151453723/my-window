/**
 * 多家大模型端点 + 多级兜底 chat 调用。
 *
 * 约定：
 * - 端点地址与模型名全部来自本机实测（见 docs/LLM-PROVIDERS.md），不靠记忆写死。
 * - 统一走 OpenAI 兼容的 /chat/completions 协议，用 Node 24 自带的全局 fetch。
 * - 不发送 response_format=json_object（部分国产端点不支持）；返回内容若被 ```json 围栏
 *   或 <think> 思考块包裹，会在返回前清洗掉，便于下游 zod 校验。
 * - 任何日志与异常信息都不含密钥原文（异常统一走 redact() 脱敏）。
 */

import fs from 'node:fs';
import path from 'node:path';
import { readSecret } from '../secrets.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface ChatResult {
  text: string;
  provider: string;
  model: string;
  latencyMs: number;
  usage?: { promptTokens?: number; completionTokens?: number };
}

/** callProvider 的返回类型：比 ChatResult 多一个 finish_reason，便于判断输出是否被截断。 */
export interface DetailedChatResult extends ChatResult {
  finishReason?: string;
}

/** 单个候选端点的静态描述。 */
export interface ProviderSpec {
  /** 稳定标识，chat() 结果里用它标识「谁接管了这次请求」 */
  id: string;
  /** OpenAI 兼容的 chat/completions 完整地址 */
  baseUrl: string;
  /** 实测可用的模型名 */
  model: string;
  /** 密钥名（由 readSecret 读取） */
  secretName: string;
  /** 厂商 */
  vendor: string;
  /** 实测备注 */
  note: string;
}

/** 兜底顺序：按本机实测可用性排序（见 docs/LLM-PROVIDERS.md 的实测表）。 */
export const PROVIDERS: readonly ProviderSpec[] = [
  {
    id: 'deepseek-chat',
    baseUrl: 'https://api.deepseek.com/chat/completions',
    model: 'deepseek-chat',
    secretName: 'DEEPSEEK_API_KEY',
    vendor: 'DeepSeek',
    note: '实测最快最干净，无 <think> 包裹，支持 response_format=json_object',
  },
  {
    id: 'minimax-cn-m3',
    baseUrl: 'https://api.minimax.cn/v1/chat/completions',
    model: 'MiniMax-M3',
    secretName: 'MINIMAX_CN_API_KEY',
    vendor: 'MiniMax',
    note: '国内域，实测稳定；M2.5 已被官方下线（404），M1 亦不可用',
  },
  {
    id: 'deepseek-reasoner',
    baseUrl: 'https://api.deepseek.com/chat/completions',
    model: 'deepseek-reasoner',
    secretName: 'DEEPSEEK_API_KEY',
    vendor: 'DeepSeek',
    note: '推理模型，长文质量更好；token 预算需留足（reasoning_content 占用 max_tokens）',
  },
  {
    id: 'mimo-v2.6-pro',
    baseUrl: 'https://token-plan-cn.xiaomimimo.com/v1/chat/completions',
    model: 'mimo-v2.6-pro',
    secretName: 'XIAOMI_TOKEN_PLAN_CN_API_KEY',
    vendor: '小米 MiMo',
    note: '第三家厂商；实测返回 429 quota exhausted，待 token plan 额度恢复',
  },
  {
    id: 'minimax-cn-m25',
    baseUrl: 'https://api.minimax.cn/v1/chat/completions',
    model: 'MiniMax-M2.5',
    secretName: 'MINIMAX_CN_API_KEY',
    vendor: 'MiniMax',
    note: '同域备模型；输出带 <think> 前缀，已在清洗阶段剥离',
  },
  {
    id: 'minimax-intl-m3',
    baseUrl: 'https://api.minimaxi.com/v1/chat/completions',
    model: 'MiniMax-M3',
    secretName: 'MINIMAX_CN_API_KEY',
    vendor: 'MiniMax',
    note: '国际域，同一把 key 实测可用，延迟约为国内域的 1.5~2 倍',
  },
  {
    id: 'mimo-v2.6-flash',
    baseUrl: 'https://token-plan-cn.xiaomimimo.com/v1/chat/completions',
    model: 'mimo-v2.6-flash',
    secretName: 'XIAOMI_TOKEN_PLAN_CN_API_KEY',
    vendor: '小米 MiMo',
    note: '第三家厂商的轻量模型',
  },
];

const USER_AGENT = 'personal-learning-window/0.1 (llm-providers)';
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_TOKENS = 2048;
const DEFAULT_TEMPERATURE = 0.6;
/** 整条兜底链的总时长上限 */
const CHAIN_BUDGET_MS = 150_000;
/** 一次 chat() 最多尝试的 provider 家数（任务书硬性要求） */
const MAX_PROVIDERS = 3;
/** 网络类瞬时故障（Windows EADDRINUSE 等）允许同一家重试的次数 */
const MAX_NETWORK_RETRIES = 1;
/** 连续两次请求之间的间隔，避开 Windows 本机端口耗尽 */
const REQUEST_SPACING_MS = 250;
/** 网络类重试前的等待 */
const NETWORK_RETRY_DELAY_MS = 900;

/** 供自检脚本使用的错误类型：带 HTTP 状态码与失败分类。 */
export class ProviderCallError extends Error {
  readonly kind: 'network' | 'http' | 'empty' | 'parse' | 'config';
  readonly status?: number;

  constructor(message: string, kind: ProviderCallError['kind'], status?: number) {
    super(message);
    this.name = 'ProviderCallError';
    this.kind = kind;
    this.status = status;
  }
}

/* ------------------------------------------------------------------ *
 * 密钥读取
 * ------------------------------------------------------------------ */

const CREDENTIAL_FILE_CANDIDATES: string[] = [
  process.env.DSH_CREDENTIALS_PATH ?? '',
  path.join(process.env.DSH_HOME ?? 'E:\\dsh-home', '.credentials.yaml'),
  'E:\\dsh-home\\.credentials.yaml',
].filter(Boolean);

/**
 * DSH 凭据仓把密钥放在 refs: 缩进块里，项目自带的 readSecret() 只认顶层键，
 * 因此这里再兜一层「任意缩进的同名键」读取（同样不打印、不落盘）。
 */
function readNestedSecret(name: string): string | undefined {
  for (const file of CREDENTIAL_FILE_CANDIDATES) {
    try {
      if (!fs.existsSync(file)) continue;
      const text = fs.readFileSync(file, 'utf8');
      for (const raw of text.split(/\r?\n/)) {
        const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+?)\s*$/.exec(raw);
        if (!m || m[1] !== name) continue;
        const value = m[2].trim().replace(/^["']|["']$/g, '');
        if (value) return value;
      }
    } catch {
      /* 读取失败就当没有，交由上层报「缺密钥」 */
    }
  }
  return undefined;
}

const keyCache = new Map<string, string>();

/** 读取密钥：优先项目自带的 readSecret()，读不到再走嵌套 refs 兜底。 */
function resolveKey(secretName: string): string | undefined {
  const cached = keyCache.get(secretName);
  if (cached) return cached;
  const direct = readSecret(secretName);
  const value = direct ?? readNestedSecret(secretName);
  if (value) keyCache.set(secretName, value);
  return value;
}

/** 判断一段文本里是否混进了密钥原文（自检脚本用，只返回布尔值）。 */
export function containsSecretValue(text: string): boolean {
  if (!text) return false;
  for (const name of ['DEEPSEEK_API_KEY', 'MINIMAX_CN_API_KEY', 'XIAOMI_TOKEN_PLAN_CN_API_KEY']) {
    const value = resolveKey(name);
    if (value && text.includes(value)) return true;
  }
  return false;
}

/** 把可能出现的密钥原文替换掉。 */
function redact(text: string): string {
  let out = text ?? '';
  for (const name of ['DEEPSEEK_API_KEY', 'MINIMAX_CN_API_KEY', 'XIAOMI_TOKEN_PLAN_CN_API_KEY']) {
    const value = resolveKey(name);
    if (value && out.includes(value)) out = out.split(value).join('***');
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 运行时可调项（自检脚本用）
 * ------------------------------------------------------------------ */

const baseUrlOverrides = new Map<string, string>();
let preferredProviderId: string | null = null;

/** 临时把某个 provider 的 baseUrl 指向别的地址；传 null 取消。 */
export function overrideProviderBaseUrl(id: string, baseUrl: string | null): void {
  if (baseUrl) baseUrlOverrides.set(id, baseUrl);
  else baseUrlOverrides.delete(id);
}

/** 清空所有运行时覆盖与健康记忆。 */
export function resetProviderState(): void {
  baseUrlOverrides.clear();
  preferredProviderId = null;
}

function effectiveBaseUrl(spec: ProviderSpec): string {
  return baseUrlOverrides.get(spec.id) ?? spec.baseUrl;
}

/* ------------------------------------------------------------------ *
 * 工具
 * ------------------------------------------------------------------ */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 清洗模型输出：剥离 <think> 思考块与 ```json 围栏。 */
export function cleanModelText(raw: string): string {
  let text = raw ?? '';
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  text = text.trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```[A-Za-z0-9_-]*\s*\n?/, '');
    text = text.replace(/\n?```\s*$/, '');
  }
  return text.trim();
}

/**
 * 从模型输出里抠出 JSON 对象，供 llm/client.ts 使用。
 * 容错：围栏包裹、前后有说明文字、尾随逗号。
 */
export function extractJson(raw: string): string {
  let text = cleanModelText(raw);
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first >= 0 && last > first) text = text.slice(first, last + 1);
  return text.replace(/,\s*([}\]])/g, '$1');
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '…' : text;
}

function summarizeBody(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    if (parsed?.error?.message) return truncate(parsed.error.message, 160);
  } catch {
    /* 不是 JSON 就直接截断原文 */
  }
  return truncate(body.replace(/\s+/g, ' ').trim(), 160);
}

function describeError(error: unknown): string {
  if (error instanceof ProviderCallError) {
    const status = error.status ? `HTTP ${error.status} ` : '';
    return redact(`${status}${error.message}`);
  }
  if (error instanceof Error) return redact(`${error.name}: ${error.message}`);
  return redact(String(error));
}

/* ------------------------------------------------------------------ *
 * 单端点调用
 * ------------------------------------------------------------------ */

interface CallContext {
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
}

/** 发起一次请求；网络类瞬时故障按 MAX_NETWORK_RETRIES 重试。 */
async function requestOnce(
  url: string,
  model: string,
  key: string,
  messages: ChatMessage[],
  ctx: CallContext,
): Promise<{ data: unknown; latencyMs: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ctx.timeoutMs);
  const started = Date.now();
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: ctx.temperature,
        max_tokens: ctx.maxTokens,
        stream: false,
      }),
      signal: controller.signal,
    });
    const body = await response.text();
    const latencyMs = Date.now() - started;
    if (!response.ok) {
      throw new ProviderCallError(summarizeBody(body), 'http', response.status);
    }
    try {
      return { data: JSON.parse(body), latencyMs };
    } catch {
      throw new ProviderCallError('响应不是合法 JSON', 'parse', response.status);
    }
  } catch (error) {
    if (error instanceof ProviderCallError) throw error;
    if ((error as { name?: string })?.name === 'AbortError') {
      throw new ProviderCallError(`请求超时（${ctx.timeoutMs}ms）`, 'network');
    }
    const cause = (error as { cause?: { code?: string; message?: string } })?.cause;
    const detail = cause?.code ?? cause?.message ?? (error as Error)?.message ?? '未知网络错误';
    throw new ProviderCallError(`网络错误：${redact(String(detail))}`, 'network');
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 调用指定 provider（不经兜底链），用于自检脚本逐个端点实测。
 */
export async function callProvider(
  providerId: string,
  messages: ChatMessage[],
  options: ChatOptions = {},
): Promise<DetailedChatResult> {
  const spec = PROVIDERS.find((p) => p.id === providerId);
  if (!spec) throw new ProviderCallError(`未知 provider：${providerId}`, 'config');
  const key = resolveKey(spec.secretName);
  if (!key) throw new ProviderCallError(`缺少密钥 ${spec.secretName}`, 'config');

  const ctx: CallContext = {
    temperature: options.temperature ?? DEFAULT_TEMPERATURE,
    maxTokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  };
  const url = effectiveBaseUrl(spec);

  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_NETWORK_RETRIES; attempt++) {
    if (attempt > 0) await sleep(NETWORK_RETRY_DELAY_MS);
    try {
      const { data, latencyMs } = await requestOnce(url, spec.model, key, messages, ctx);
      const payload = data as {
        choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const choice = payload?.choices?.[0];
      const rawContent = choice?.message?.content;
      const text = cleanModelText(typeof rawContent === 'string' ? rawContent : '');
      if (!text) {
        throw new ProviderCallError(
          `返回内容为空（finish_reason=${choice?.finish_reason ?? '-'}，可能 max_tokens 不足）`,
          'empty',
        );
      }
      const promptTokens =
        typeof payload?.usage?.prompt_tokens === 'number' ? payload.usage.prompt_tokens : undefined;
      const completionTokens =
        typeof payload?.usage?.completion_tokens === 'number'
          ? payload.usage.completion_tokens
          : undefined;
      return {
        text,
        provider: spec.id,
        model: spec.model,
        latencyMs,
        finishReason: choice?.finish_reason,
        usage:
          promptTokens !== undefined || completionTokens !== undefined
            ? { promptTokens, completionTokens }
            : undefined,
      };
    } catch (error) {
      lastError = error;
      const isNetwork = error instanceof ProviderCallError && error.kind === 'network';
      if (!isNetwork || attempt === MAX_NETWORK_RETRIES) throw error;
    }
  }
  throw lastError;
}

/* ------------------------------------------------------------------ *
 * 兜底链
 * ------------------------------------------------------------------ */

function orderedChain(): ProviderSpec[] {
  const list = [...PROVIDERS];
  if (!preferredProviderId) return list;
  const idx = list.findIndex((p) => p.id === preferredProviderId);
  if (idx <= 0) return list;
  const [head] = list.splice(idx, 1);
  return [head, ...list];
}

/**
 * 带多级兜底的 chat 调用。
 * - 首个 provider 失败（网络错 / 非 2xx / 超时 / 空响应）自动切下一个；
 * - 最多尝试 3 家；端点级故障（网络不可达、429 额度耗尽）会跳过同端点的其它模型；
 * - 整链总时长不超过 150 秒；全部失败抛错，错误信息不含密钥。
 */
export async function chat(
  messages: ChatMessage[],
  options: ChatOptions = {},
): Promise<ChatResult> {
  const deadline = Date.now() + CHAIN_BUDGET_MS;
  const deadEndpoints = new Set<string>();
  const failures: string[] = [];
  let tried = 0;

  for (const spec of orderedChain()) {
    if (tried >= MAX_PROVIDERS) break;

    const url = effectiveBaseUrl(spec);
    if (deadEndpoints.has(url)) continue;

    const key = resolveKey(spec.secretName);
    if (!key) {
      failures.push(`${spec.id}: 缺少密钥 ${spec.secretName}`);
      continue;
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      failures.push(`${spec.id}: 整链时间预算已耗尽`);
      break;
    }

    const ctx: CallContext = {
      temperature: options.temperature ?? DEFAULT_TEMPERATURE,
      maxTokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
      timeoutMs: Math.max(1_000, Math.min(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, remaining)),
    };

    tried += 1;
    try {
      const result = await callProvider(spec.id, messages, { ...options, timeoutMs: ctx.timeoutMs });
      preferredProviderId = spec.id;
      return result;
    } catch (error) {
      failures.push(`${spec.id}(${spec.model}): ${describeError(error)}`);
      const kind = error instanceof ProviderCallError ? error.kind : 'network';
      const status = error instanceof ProviderCallError ? error.status : undefined;
      // 端点级故障：网络不可达或 429 额度耗尽 → 同端点的其它模型直接跳过
      if (kind === 'network' || status === 429) deadEndpoints.add(url);
    }
    await sleep(REQUEST_SPACING_MS);
  }

  throw new ProviderCallError(
    `所有大模型端点均失败（尝试 ${tried} 家）：${failures.join('；')}`,
    'network',
  );
}

/**
 * 端点与密钥状态。hasKey 只给布尔值，不暴露密钥本身。
 */
export function providerStatus(): Array<{ id: string; baseUrl: string; model: string; hasKey: boolean }> {
  return PROVIDERS.map((spec) => ({
    id: spec.id,
    baseUrl: effectiveBaseUrl(spec),
    model: spec.model,
    hasKey: Boolean(resolveKey(spec.secretName)),
  }));
}
