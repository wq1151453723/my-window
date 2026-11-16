import { listArticles, markTopicUsed, clearTopicUsage } from '../src/server/db.js';
import { BOOK_SEEDS } from '../src/server/pipeline/seeds.js';

function norm(s: string): string {
  return (s ?? "").replace(/[《》\s（）()·—\-:：,，。、]/g, "");
}

function seedBookName(seed: string): string {
  const m = /《([^》]+)》/.exec(seed);
  if (m) return m[1];
  const cut = seed.split("（")[0];
  return cut || seed;
}

function matchSeed(pool: string[], book: string): string | undefined {
  const nb = norm(book);
  if (!nb) return undefined;
  return pool.find((s) => {
    const ns = norm(seedBookName(s));
    return ns.length >= 2 && (ns.includes(nb) || nb.includes(ns));
  });
}

clearTopicUsage("book-seed");
let books = 0;
for (const a of listArticles("books", 500)) {
  const meta = a.meta as Record<string, unknown>;
  const book = String(meta.book ?? "").trim();
  const discipline = String(meta.discipline ?? "").trim();
  if (!book || !discipline) continue;
  const pool = BOOK_SEEDS[discipline as keyof typeof BOOK_SEEDS] ?? [];
  const seed = matchSeed(pool, book);
  if (seed) {
    markTopicUsed("book-seed", `${discipline}::${seed}`);
    books++;
    console.log(`  标记：${discipline} · ${book} → ${seed.slice(0, 28)}`);
  } else {
    console.log(`  未匹配：${discipline} · ${book}`);
  }
}

let repos = 0;
for (const a of listArticles("ai-tools", 500)) {
  const meta = a.meta as Record<string, unknown>;
  const full = String(meta.repoFullName ?? meta.fullName ?? "").trim();
  if (full) {
    markTopicUsed("repo", full);
    repos++;
  }
}

console.log(`账本回填：书籍种子 ${books} 条，仓库 ${repos} 条`);