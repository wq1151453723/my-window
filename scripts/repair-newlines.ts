import { db } from '../src/server/db.js';
import { repairEscapedNewlines } from '../src/server/llm/text.js';

function repairJson(text: string): string {
  try {
    const parsed = JSON.parse(text) as unknown;
    const walk = (v: unknown): unknown => {
      if (typeof v === "string") return repairEscapedNewlines(v);
      if (Array.isArray(v)) return v.map(walk);
      if (v && typeof v === "object") {
        const o: Record<string, unknown> = {};
        for (const [k, val] of Object.entries(v as Record<string, unknown>)) o[k] = walk(val);
        return o;
      }
      return v;
    };
    return JSON.stringify(walk(parsed));
  } catch {
    return text;
  }
}

interface Row {
  id: string;
  title: string;
  subtitle: string;
  summary: string;
  takeaways: string;
  body: string;
  script: string;
  meta: string;
  sources: string;
}

const rows = db.prepare("SELECT id, title, subtitle, summary, takeaways, body, script, meta, sources FROM articles").all() as unknown as Row[];
const upd = db.prepare(
  "UPDATE articles SET title=?, subtitle=?, summary=?, takeaways=?, body=?, script=?, meta=?, sources=? WHERE id=?"
);

let fixed = 0;
for (const r of rows) {
  const next = {
    title: repairEscapedNewlines(r.title),
    subtitle: repairEscapedNewlines(r.subtitle),
    summary: repairEscapedNewlines(r.summary),
    takeaways: repairJson(r.takeaways),
    body: repairEscapedNewlines(r.body),
    script: repairEscapedNewlines(r.script),
    meta: repairJson(r.meta),
    sources: repairJson(r.sources),
  };
  const changed =
    next.title !== r.title ||
    next.subtitle !== r.subtitle ||
    next.summary !== r.summary ||
    next.takeaways !== r.takeaways ||
    next.body !== r.body ||
    next.script !== r.script ||
    next.meta !== r.meta ||
    next.sources !== r.sources;
  if (!changed) continue;
  upd.run(
    next.title,
    next.subtitle,
    next.summary,
    next.takeaways,
    next.body,
    next.script,
    next.meta,
    next.sources,
    r.id
  );
  fixed++;
  console.log(`  修复 ${r.id}`);
}

console.log(`存量修复：处理 ${rows.length} 篇，实际改动 ${fixed} 篇`);