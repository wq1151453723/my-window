/**
 * 模型有时会把正文里的换行写成字面量反斜杠加 n（JSON 里就是两个字符 \ + n），
 * 解析后仍是字面量，页面就会显示成 "\n\n"。这里做一次归一：
 * 1) 先把双反斜杠折成单反斜杠；2) 再把 \n / \t 转成真实换行与制表符。
 * 只有在「整段几乎没有真实换行、却存在字面量转义」时才动手，避免误伤正文里
 * 故意讲解 \n 写法的段落。
 */
export function repairEscapedNewlines(text: string): string {
  if (!text) return text;
  const realNewlines = (text.match(/\n/g) ?? []).length;
  const literalEscapes = (text.match(/\\n/g) ?? []).length;
  if (realNewlines > 0) return text;

  let out = text;
  for (let i = 0; i < 3; i++) {
    const next = out.replace(/\\\\/g, "\\").replace(/\\n/g, "\n").replace(/\\t/g, "\t");
    if (next === out) break;
    out = next;
  }
  return out;
}

function repairValue(value: unknown): unknown {
  if (typeof value === "string") return repairEscapedNewlines(value);
  if (Array.isArray(value)) return value.map(repairValue);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = repairValue(v);
    return out;
  }
  return value;
}

export function repairPayloadStrings<T>(payload: T): T {
  return repairValue(payload) as T;
}