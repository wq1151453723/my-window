import type { Article } from '../../shared/types.js';
import { PROMPTS } from '../llm/prompts/index.js';
import { runPrompt } from '../llm/client.js';
import { saveArticle, startRun, finishRun } from '../db.js';
import { attachAudio } from './common.js';
import { FEEDS, fetchFeed, type FeedSource } from '../sources/rss.js';
import { fetchQuotes, type Quote } from '../sources/market.js';
import { buildNoRepeatInstruction, checkDuplicate, collectRecent, levelRank, type DedupVerdict } from './dedupe.js';

export const MARKET_SYMBOLS: Array<{ symbol: string; name: string }> = [
  { symbol: "^GSPC", name: "标普500" },
  { symbol: "^IXIC", name: "纳斯达克" },
  { symbol: "^DJI", name: "道琼斯" },
  { symbol: "^HSI", name: "恒生指数" },
  { symbol: "000001.SS", name: "上证指数" },
  { symbol: "399001.SZ", name: "深证成指" },
  { symbol: "399006.SZ", name: "创业板指" },
  { symbol: "^VIX", name: "恐慌指数" },
  { symbol: "GC=F", name: "黄金期货" },
  { symbol: "CL=F", name: "原油期货" },
  { symbol: "DX-Y.NYB", name: "美元指数" },
  { symbol: "BTC-USD", name: "比特币" },
];

export async function generateMarkets(date: string): Promise<Article> {
  const runId = startRun("markets", date);
  try {
    const names = new Map(MARKET_SYMBOLS.map((s) => [s.symbol, s.name]));
    const fetched = await fetchQuotes(MARKET_SYMBOLS.map((s) => s.symbol));
    const quotes = fetched.map((q: Quote) => ({
      ...q,
      name: names.get(q.symbol) ?? q.name ?? q.symbol,
    }));
    const indices = quotes.map((q) => ({ symbol: q.symbol, name: q.name, changePct: q.changePct }));
    const headlines: Array<{ title: string; url: string; source: string; publishedAt?: string }> = [];
    const feeds = FEEDS.filter((f: FeedSource) => f.category === "cn-finance" || f.category === "global-finance");
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
    const recent = collectRecent("markets", 21);

    let best: { payload: any; verdict: DedupVerdict } | null = null;
    let extra: string | undefined;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const res = await runPrompt(PROMPTS.markets, { date, quotes, indices, headlines }, { extraInstruction: extra });
      const payload = res.payload;
      const verdict = checkDuplicate(
        "markets",
        { title: payload.title, summary: payload.summary, takeaways: payload.takeaways, body: payload.body },
        recent
      );
      if (!best || levelRank(verdict.level) < levelRank(best.verdict.level)) best = { payload, verdict };
      if (verdict.level === "none") break;
      extra = buildNoRepeatInstruction(verdict, "全球与中国金融");
      console.log(`[markets] 第 ${attempt} 次命中重复（${verdict.level} ${verdict.score.toFixed(2)}），换角度重写`);
    }
    if (!best) throw new Error("市场分析生成失败");
    const p = best.payload;
    let article: Article = {
      id: `${date}-markets`,
      section: "markets",
      date,
      title: p.title,
      subtitle: p.subtitle,
      summary: p.summary,
      takeaways: p.takeaways,
      body: p.body,
      script: p.script,
      readingMinutes: 0,
      audioPath: null,
      meta: { ...p.meta, quotes, indices },
      sources: headlines.slice(0, 12),
      generatedAt: new Date().toISOString(),
    };
    article = await attachAudio(article);
    saveArticle(article);
    finishRun(runId, "ok", null, article.id);
    console.log(`[markets] ${article.id} 生成完成（重复等级 ${best.verdict.level}）`);
    return article;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    finishRun(runId, "error", msg, null);
    throw err;
  }
}