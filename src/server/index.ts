import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import cron from 'node-cron';
import fs from 'node:fs';
import path from 'node:path';
import { API_PORT, API_HOST, DATA_DIR, WEB_DIST } from './config.js';
import { getArticle, listArticles, getLatest, listRuns, countArticles, getCourseState, listCourseLessons, getCourseArticle, listAiWeeklyByWeek } from './db.js';
import { TOTAL_LESSONS, STAGES, LESSON_TITLES } from './course/types.js';
import { buildWechatPreview, buildWechatAudioFor, publishWechatDraft, ensureWechatImages } from './publishers/wechat/index.js';
import { generateDaily } from './pipeline/daily.js';
import { fetchHistory } from './sources/market.js';
import { todayStr, isoWeekKey } from './pipeline/common.js';
import { listAiToolsByWeek } from './db.js';
import { providerStatus } from './llm/providers.js';
import type { SectionId } from '../shared/types.js';

const app = new Hono();

const relData = path.relative(process.cwd(), DATA_DIR);
const relWeb = path.relative(process.cwd(), WEB_DIST);

app.get("/api/health", (c) => {
  return c.json({
    ok: true,
    now: new Date().toISOString(),
    today: todayStr(),
    articles: countArticles(),
    providers: providerStatus(),
  });
});

app.get("/api/today", (c) => {
  const date = c.req.query("date") ?? todayStr();
  const weekKey = isoWeekKey(new Date(`${date}T12:00:00+08:00`));
  const weekly = listAiWeeklyByWeek(weekKey);
  return c.json({
    date,
    weekKey,
    books: getLatest("books") ?? null,
    "ai-course": getLatest("ai-course") ?? null,
    "ai-tools": listAiToolsByWeek(weekKey).length ? listAiToolsByWeek(weekKey) : listArticles("ai-tools", 5),
    "ai-weekly": weekly.length ? weekly[0] : (getLatest("ai-weekly") ?? null),
    markets: getLatest("markets") ?? null,
    world: getLatest("world") ?? null,
  });
});

app.get("/api/course", (c) => {
  const state = getCourseState();
  const done = listCourseLessons();
  const latestNo = done.length ? done[done.length - 1].lessonNo : 0;
  return c.json({
    currentLesson: state.currentLesson,
    latestLessonNo: latestNo,
    totalLessons: TOTAL_LESSONS,
    stages: STAGES,
    titles: LESSON_TITLES,
    done: done.map((d) => ({ lessonNo: d.lessonNo, date: d.date, articleId: d.articleId })),
    latest: latestNo ? (getCourseArticle(latestNo) ?? null) : null,
  });
});

app.get("/api/course/lesson/:no", (c) => {
  const no = Number(c.req.param("no"));
  const article = getCourseArticle(no);
  if (!article) return c.json({ error: "这一讲还没生成" }, 404);
  return c.json(article);
});

app.get("/api/articles/:section", (c) => {
  const section = c.req.param("section") as SectionId;
  const limit = Number(c.req.query("limit") ?? 30);
  if (!["books", "ai-tools", "markets", "world"].includes(section))
    return c.json({ error: "未知板块" }, 400);
  return c.json({ section, articles: listArticles(section, limit) });
});

app.get("/api/article/:id", (c) => {
  const article = getArticle(c.req.param("id"));
  if (!article) return c.json({ error: "没有这篇文章" }, 404);
  return c.json(article);
});

app.get("/api/runs", (c) => c.json({ runs: listRuns(20) }));

app.get("/api/wechat/preview", async (c) => {
  const date = c.req.query("date") ?? todayStr();
  return c.json(await buildWechatPreview(date));
});

app.post("/api/wechat/images", async (c) => {
  const date = c.req.query("date") ?? todayStr();
  const images = await ensureWechatImages(date, true);
  return c.json({ ok: true, images });
});

app.post("/api/wechat/audio", async (c) => {
  const date = c.req.query("date") ?? todayStr();
  const result = await buildWechatAudioFor(date);
  return c.json(result);
});

app.post("/api/wechat/publish", async (c) => {
  const date = c.req.query("date") ?? todayStr();
  try {
    const result = await publishWechatDraft(date);
    return c.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: msg }, 400);
  }
});

app.get("/api/history", async (c) => {
  const symbol = c.req.query("symbol") ?? "^GSPC";
  const days = Number(c.req.query("days") ?? 30);
  try {
    const series = await fetchHistory(symbol, days);
    return c.json({ symbol, t: series.t, c: series.c });
  } catch (err) {
    return c.json({ symbol, t: [], c: [], error: err instanceof Error ? err.message : String(err) });
  }
});

let running = false;

app.post("/api/generate", async (c) => {
  let body: { section?: string; date?: string; force?: boolean } = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const date = body.date ?? todayStr();
  const sections = body.section ? ([body.section] as SectionId[]) : undefined;
  if (running) return c.json({ started: false, reason: "已有生成任务在跑" }, 409);
  running = true;
  void generateDaily(date, { sections, force: body.force })
    .then((report) => console.log("[api] 生成完成", JSON.stringify(report)))
    .catch((err) => console.error("[api] 生成失败", err instanceof Error ? err.message : err))
    .finally(() => {
      running = false;
    });
  return c.json({ started: true, date, sections: sections ?? "all" });
});

app.use("/audio/*", serveStatic({ root: relData }));
app.use("/images/*", serveStatic({ root: relData }));

if (fs.existsSync(WEB_DIST)) {
  app.use("/*", serveStatic({ root: relWeb }));
  app.get("*", serveStatic({ path: "index.html", root: relWeb }));
} else {
  app.get("/", (c) =>
    c.html(
      "<h1>我的窗口 API 已启动</h1><p>前端开发服务器在 http://localhost:5173</p><p>生产模式请先执行 <code>pnpm build</code>。</p>",
      200
    )
  );
}

serve({ fetch: app.fetch, port: API_PORT, hostname: API_HOST }, (info) => {
  console.log(`[server] http://${API_HOST}:${info.port} 已启动`);
});

function shanghaiHour(): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Shanghai", hour: "2-digit", hour12: false }).format(new Date())
  );
}

cron.schedule("*/20 * * * *", () => {
  void (async () => {
    try {
      const date = todayStr();
      if (shanghaiHour() < 7) return;
      const needBooks = getLatest("books")?.date !== date;
      const needCourse = getLatest("ai-course")?.date !== date;
      const needMarkets = getLatest("markets")?.date !== date;
      const needWorld = getLatest("world")?.date !== date;
      if (!needBooks && !needCourse && !needMarkets && !needWorld) return;
      console.log("[cron] 检测到今日内容缺失，开始补齐");
      const report = await generateDaily(date);
      console.log("[cron] 补齐完成", JSON.stringify(report));
    } catch (err) {
      console.error("[cron] 补齐失败", err instanceof Error ? err.message : err);
    }
  })();
});

console.log("[server] 定时任务已注册（每 20 分钟检查一次北京时间 07:00 之后是否缺内容）");