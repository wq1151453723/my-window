import type { Article } from '../../shared/types.js';
import { PROMPTS } from '../llm/prompts/index.js';
import { runPrompt } from '../llm/client.js';
import { saveArticle, startRun, finishRun, markTopicUsed, listUsedTopics } from '../db.js';
import { attachAudio } from './common.js';
import { fetchWeeklyHotRepos } from '../sources/github.js';
import { buildNoRepeatInstruction, checkDuplicate, collectRecent, levelRank, type DedupVerdict } from './dedupe.js';

export async function generateAiTools(date: string, weekKey: string): Promise<Article[]> {
  const runId = startRun("ai-tools", date);
  try {
    const since = new Date(Date.now() - 7 * 86400000);
    const repos = await fetchWeeklyHotRepos(since, 10);
    if (!repos.length) throw new Error("GitHub 本周高星仓库抓取为空");

    // 同一个仓库不重复讲：优先挑没讲过的
    const used = new Set(listUsedTopics("repo").map((t) => t.key));
    const fresh = repos.filter((r) => !used.has(r.fullName));
    const chosen = (fresh.length ? fresh : repos).slice(0, 5);

    const recent = collectRecent("ai-tools", 21);
    const articles: Article[] = [];
    for (const [i, repo] of chosen.entries()) {
      let best: { payload: any; verdict: DedupVerdict } | null = null;
      let extra: string | undefined;
      for (let attempt = 1; attempt <= 3; attempt++) {
        const res = await runPrompt(PROMPTS["ai-tools"], { repo }, { extraInstruction: extra });
        const payload = res.payload;
        const verdict = checkDuplicate(
          "ai-tools",
          { title: payload.title, summary: payload.summary, takeaways: payload.takeaways, body: payload.body },
          recent
        );
        if (!best || levelRank(verdict.level) < levelRank(best.verdict.level)) best = { payload, verdict };
        if (verdict.level === "none") break;
        extra = buildNoRepeatInstruction(verdict, "前沿 AI 应用");
        console.log(`[ai-tools] ${repo.fullName} 第 ${attempt} 次命中重复（${verdict.level}），换角度重写`);
      }
      if (!best) continue;
      const p = best.payload;
      let article: Article = {
        id: `${weekKey}-ai-${i + 1}`,
        section: "ai-tools",
        date,
        title: p.title,
        subtitle: p.subtitle,
        summary: p.summary,
        takeaways: p.takeaways,
        body: p.body,
        script: p.script,
        readingMinutes: 0,
        audioPath: null,
        meta: { ...p.meta, ...repo, stars: repo.stars, language: repo.language ?? "" },
        sources: [{ title: `${repo.fullName} (GitHub)`, url: repo.url, source: "GitHub" }],
        generatedAt: new Date().toISOString(),
      };
      article = await attachAudio(article);
      saveArticle(article);
      markTopicUsed("repo", repo.fullName);
      articles.push(article);
      console.log(`[ai-tools] ${article.id} 生成完成（重复等级 ${best.verdict.level}）`);
    }
    finishRun(runId, "ok", null, articles[0]?.id ?? null);
    return articles;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    finishRun(runId, "error", msg, null);
    throw err;
  }
}