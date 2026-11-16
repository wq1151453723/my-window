import { chat, extractJson as extractJsonText } from './providers.js';
import { repairPayloadStrings } from './text.js';
import type { PromptSpec } from '../../shared/types.js';

export interface LlmRunResult<TPayload> {
  payload: TPayload;
  provider: string;
  model: string;
  latencyMs: number;
  attempts: number;
}

function braceScan(text: string): unknown {
  const start = text.indexOf("{");
  if (start < 0) throw new Error("模型输出里找不到 JSON 对象");
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return JSON.parse(text.slice(start, i + 1));
    }
  }
  throw new Error("模型输出的 JSON 不完整");
}

export function extractJson(text: string): unknown {
  try {
    return JSON.parse(extractJsonText(text));
  } catch {
    return braceScan(text);
  }
}

export async function runPrompt<TInput, TPayload>(
  spec: PromptSpec<TInput, TPayload>,
  input: TInput,
  opts: { attempts?: number; extraInstruction?: string } = {}
): Promise<LlmRunResult<TPayload>> {
  const maxAttempts = opts.attempts ?? 3;
  const userContent =
    spec.buildUser(input) + (opts.extraInstruction ? `\n\n${opts.extraInstruction}` : "");
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: spec.system },
    { role: "user", content: userContent },
  ];
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await chat(messages, {
        temperature: spec.temperature,
        maxTokens: spec.maxTokens,
      });
      const payload = spec.schema.parse(repairPayloadStrings(extractJson(res.text)));
      return {
        payload,
        provider: res.provider,
        model: res.model,
        latencyMs: res.latencyMs,
        attempts: attempt,
      };
    } catch (err) {
      lastError = err;
      messages.push({ role: "assistant", content: "(上一次输出不合规)" });
      messages.push({
        role: "user",
        content:
          "上一次输出没有通过校验或不是合法 JSON。请只输出一个 JSON 对象，不要任何解释文字，不要代码块包裹，字段必须与要求完全一致。",
      });
    }
  }
  throw new Error(
    `提示词 ${spec.id} 连续 ${maxAttempts} 次未通过校验：` +
      (lastError instanceof Error ? lastError.message : String(lastError))
  );
}