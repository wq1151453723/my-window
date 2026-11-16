import { DISCIPLINES, type Article } from '../../shared/types.js';
import { PROMPTS } from '../llm/prompts/index.js';
import { runPrompt } from '../llm/client.js';
import { saveArticle, startRun, finishRun } from '../db.js';
import { attachAudio, dayIndex } from './common.js';
import { BOOK_SEEDS } from './seeds.js';

export async function generateBooks(date: string): Promise<Article> {
  const runId = startRun("books", date);
  try {
    const discipline = DISCIPLINES[dayIndex(date) % DISCIPLINES.length];
    const res = await runPrompt(PROMPTS.books, {
      discipline,
      date,
      seedIdeas: BOOK_SEEDS[discipline],
    });
    const p = res.payload;
    let article: Article = {
      id: `${date}-books`,
      section: "books",
      date,
      title: p.title,
      subtitle: p.subtitle,
      summary: p.summary,
      takeaways: p.takeaways,
      body: p.body,
      script: p.script,
      readingMinutes: 0,
      audioPath: null,
      meta: { ...p.meta, discipline },
      sources: [],
      generatedAt: new Date().toISOString(),
    };
    article = await attachAudio(article);
    saveArticle(article);
    finishRun(runId, "ok", null, article.id);
    console.log(`[books] ${article.id} 生成完成（${res.provider}/${res.model}）`);
    return article;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    finishRun(runId, "error", msg, null);
    throw err;
  }
}