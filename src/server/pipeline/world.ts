import type { Article } from '../../shared/types.js';
import { PROMPTS } from '../llm/prompts/index.js';
import { runPrompt } from '../llm/client.js';
import { saveArticle, startRun, finishRun } from '../db.js';
import { attachAudio } from './common.js';
import { FEEDS, fetchFeed, type FeedSource } from '../sources/rss.js';
import {
  buildEventNoRepeatInstruction,
  buildNoRepeatInstruction,
  checkDuplicate,
  collectRecent,
  collectRecentWorldEvents,
  findDuplicateEvents,
  levelRank,
  type DedupVerdict,
} from './dedupe.js';

export async function generateWorld(date: string): Promise<Article> {
  const runId = startRun("world", date);
  try {
    const headlines: Array<{ title: string; url: string; source: string; publishedAt?: string }> = [];
    const feeds = FEEDS.filter((f: FeedSource) => f.category === "global-world" || f.category === "cn-finance");
    for (const feed of feeds) {
      try {
        const items = await fetchFeed(feed, 8);
        for (const it of items) {
          headlines.push({ title: it.title, url: it.url, source: it.source || feed.name, publishedAt: it.publishedAt });
        }
      } catch {
        /* 单个源失败不影响整体 */
      }
    }
    const recent = collectRecent("world", 21);
    const pastEvents = collectRecentWorldEvents(10);

    let best: { payload: any; verdict: DedupVerdict; dupEvents: number; score: number } | null = null;
    let extra: string | undefined;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const res = await runPrompt(PROMPTS.world, { date, headlines }, { extraInstruction: extra });
      const payload = res.payload;
      const verdict = checkDuplicate(
        "world",
        { title: payload.title, summary: payload.summary, takeaways: payload.takeaways, body: payload.body },
        recent
      );
      const dupEvents = findDuplicateEvents({ meta: payload.meta as Record<string, unknown> }, pastEvents);
      const score = levelRank(verdict.level) * 10 + dupEvents.count;
      if (!best || score < best.score) best = { payload, verdict, dupEvents: dupEvents.count, score };
      if (verdict.level === "none" && dupEvents.count === 0) break;
      extra = [
        buildNoRepeatInstruction(verdict, "全球局势"),
        dupEvents.count > 0 ? buildEventNoRepeatInstruction(pastEvents) : "",
      ]
        .filter(Boolean)
        .join("\n\n");
      console.log(
        `[world] 第 ${attempt} 次命中重复（文章 ${verdict.level} ${verdict.score.toFixed(2)}，重复事件 ${dupEvents.count} 条），换事件重写`
      );
    }
    if (!best) throw new Error("全球局势生成失败");
    const p = best.payload;
    let article: Article = {
      id: `${date}-world`,
      section: "world",
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
      sources: headlines.slice(0, 15),
      generatedAt: new Date().toISOString(),
    };
    article = await attachAudio(article);
    saveArticle(article);
    finishRun(runId, "ok", null, article.id);
    console.log(`[world] ${article.id} 生成完成（重复等级 ${best.verdict.level}，重复事件 ${best.dupEvents} 条）`);
    return article;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    finishRun(runId, "error", msg, null);
    throw err;
  }
}