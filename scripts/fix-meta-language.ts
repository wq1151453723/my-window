import { db } from '../src/server/db.js';

const rows = db.prepare("SELECT id, meta FROM articles WHERE section = ?").all("ai-tools") as unknown as Array<{ id: string; meta: string }>;
let fixed = 0;
for (const r of rows) {
  const meta = JSON.parse(r.meta) as Record<string, unknown>;
  const lang = String(meta.language ?? "");
  if (lang === "undefined" || lang === "null") {
    meta.language = "";
    db.prepare("UPDATE articles SET meta = ? WHERE id = ?").run(JSON.stringify(meta), r.id);
    fixed++;
    console.log(`修正 ${r.id} 的 language`);
  }
}
console.log(`修正 ${fixed} 条`);
