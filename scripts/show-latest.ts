import { listArticles, listUsedTopics } from '../src/server/db.js';

for (const section of ['books', 'world'] as const) {
  for (const a of listArticles(section, 5)) {
    const meta = a.meta as Record<string, any>;
    console.log(`--- ${a.id} ---`);
    console.log(`标题：${a.title}`);
    console.log(`摘要：${a.summary.slice(0, 160)}`);
    if (meta.book) console.log(`书：《${meta.book}》 ${meta.author} | 核心：${String(meta.coreIdea).slice(0, 90)}`);
    if (meta.events) console.log(`事件：${meta.events.map((e: any) => e.title).join(" | ").slice(0, 300)}`);
  }
}
console.log("--- 选题账本 ---");
for (const t of listUsedTopics("book-seed")) console.log(`  书种子：${t.key}（${t.usedAt.slice(0, 10)}）`);
for (const t of listUsedTopics("repo")) console.log(`  仓库：${t.key}`);
