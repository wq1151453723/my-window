import type { Article } from '../../shared/types.js';
import { aiWeeklyPrompt, type AiWeeklyInput, type WeeklyPayload } from '../llm/prompts/ai-weekly.js';
import { runPrompt } from '../llm/client.js';
import { saveArticle, startRun, finishRun } from '../db.js';
import { attachAudio } from './common.js';
import { collectAiContext, collectAiRepos } from './aiContext.js';

function periodOf(date: string): string {
  const end = new Date(`${date}T00:00:00+08:00`);
  const start = new Date(end.getTime() - 6 * 86400000);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return `${fmt(start)} ~ ${fmt(end)}`;
}

export async function generateAiWeekly(date: string, weekKey: string): Promise<Article> {
  const runId = startRun("ai-weekly", date);
  try {
    const headlines = await collectAiContext(20);
    const repos = await collectAiRepos(8);
    const repoBriefs = repos.map((r) => ({
      fullName: r.fullName,
      url: r.url,
      description: r.description,
      stars: r.stars,
      language: r.language ?? "",
    }));
    const res = await runPrompt<AiWeeklyInput, WeeklyPayload>(aiWeeklyPrompt, {
      weekKey,
      period: periodOf(date),
      headlines,
      repos: repoBriefs,
    });
    const p = res.payload;
    const sources = [
      ...headlines.slice(0, 12).map((h) => ({
        title: h.title,
        url: h.url,
        source: h.source,
        publishedAt: h.publishedAt,
      })),
      ...repos.slice(0, 6).map((r) => ({
        title: `${r.fullName} (GitHub)`,
        url: r.url,
        source: "GitHub",
      })),
    ];
    let article: Article = {
      id: `${weekKey}-ai-weekly`,
      section: "ai-weekly",
      date,
      title: p.title,
      subtitle: p.subtitle,
      summary: p.summary,
      takeaways: p.takeaways,
      body: p.body,
      script: p.script,
      readingMinutes: 0,
      audioPath: null,
      meta: p.meta,
      sources,
      generatedAt: new Date().toISOString(),
    };
    article = await attachAudio(article);
    saveArticle(article);
    finishRun(runId, "ok", null, article.id);
    console.log(`[ai-weekly] ${article.id} 生成完成`);
    return article;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    finishRun(runId, "error", msg, null);
    throw err;
  }
}