import { listArticles } from '../src/server/db.js';
import type { SectionId } from '../src/shared/types.js';

const sections: SectionId[] = ["books", "ai-tools", "markets", "world", "ai-course", "ai-weekly"];
let broken = 0;
for (const sec of sections) {
  for (const a of listArticles(sec, 20)) {
    for (const f of ["summary", "body", "script"] as const) {
      const v = String((a as any)[f] ?? "");
      const literal = v.split("\\n").length - 1;
      const real = v.split("\n").length - 1;
      if (literal > 0) {
        broken++;
        console.log(`[BROKEN] ${a.id}.${f} 字面量=${literal} 真实换行=${real}`);
      }
    }
  }
}
console.log(broken === 0 ? "所有文章：无字面量转义，全部为真实换行" : `仍有 ${broken} 处字面量转义`);
console.log("--- 抽样（正文前 120 字的转义视图）---");
for (const sec of sections) {
  const a = listArticles(sec, 1)[0];
  if (!a) continue;
  const lines = a.body.split("\n").length;
  console.log(`  ${sec}: 正文段落行数=${lines} 字面量\\n 计数=${a.body.split("\\n").length - 1}`);
}
