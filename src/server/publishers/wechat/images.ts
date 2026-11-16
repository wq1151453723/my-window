import type { Article } from '../../../shared/types.js';

const PAPER = "#f5f1e9";
const SURFACE = "#fffdf8";
const INK = "#17130e";
const MUTED = "#6a6153";
const ACCENT = "#b0341f";
const LINE = "#ded5c3";
const JADE = "#2f5d4c";
const AZURE = "#2b5a7a";

const HEI = "Microsoft YaHei";
const SONG = "SimSun";
const SERIF = "Georgia";

export function esc(t: string): string {
  return (t ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cut(text: string, max: number): string {
  const s = (text ?? "").replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

export interface GeneratedImage {
  kind: string;
  label: string;
  width: number;
  height: number;
  svg: string;
}

export interface ImageInput {
  date: string;
  dateLine: string;
  books?: Article | null;
  course?: Article | null;
  tools?: Article[];
  markets?: Article | null;
  world?: Article | null;
  indexSeries?: { t: number[]; c: number[] } | null;
}

function frame(w: number, h: number, body: string): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    `<rect width="${w}" height="${h}" fill="${PAPER}"/>`,
    body,
    `</svg>`
  ].join("");
}

function kicker(x: number, y: number, text: string, color = ACCENT): string {
  return `<text x="${x}" y="${y}" font-family="${HEI}" font-size="22" font-weight="700" letter-spacing="4" fill="${color}">${esc(text)}</text>`;
}

function bigTitle(x: number, y: number, text: string, size: number, color = INK, family = HEI): string {
  return `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" font-weight="700" fill="${color}">${esc(text)}</text>`;
}

function bodyText(x: number, y: number, text: string, size: number, color = MUTED, family = HEI, weight = 400): string {
  return `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" fill="${color}" font-weight="${weight}">${esc(text)}</text>`;
}

function rule(x1: number, y1: number, x2: number, y2: number, color = LINE, width = 2): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}"/>`;
}

/** 长标题自动缩字号，避免截成半句话 */
function fitTitle(text: string, sizes: [number, number, number] = [72, 60, 50]): { text: string; size: number } {
  const t = cut(text, 18);
  const len = t.length;
  const size = len > 16 ? sizes[2] : len > 12 ? sizes[1] : sizes[0];
  return { text: t, size };
}

export function buildCover(input: ImageInput): GeneratedImage {
  const w = 900;
  const h = 383;
  const labels = ["书籍学习", "AI 学习", "前沿 AI", "全球金融", "全球局势"];
  const body = [
    `<rect width="${w}" height="${h}" fill="${SURFACE}"/>`,
    `<rect x="0" y="0" width="14" height="${h}" fill="${ACCENT}"/>`,
    kicker(60, 92, "我的窗口 · DAILY DIGEST"),
    bigTitle(60, 178, "今天五份", 78),
    bodyText(60, 228, input.dateLine, 24, MUTED),
    rule(60, 262, 840, 262),
    labels
      .map((l, i) => bodyText(60 + i * 160, 312, l, 26, INK, HEI, 700))
      .join(""),
    bodyText(60, 352, "每天一份 · 都能朗读 · 都能带图", 20, MUTED),
  ].join("");
  return { kind: "cover", label: "公众号封面", width: w, height: h, svg: frame(w, h, body) };
}

export function buildPoster(input: ImageInput): GeneratedImage {
  const w = 1080;
  const h = 1440;
  const rows: Array<[string, string]> = [];
  if (input.books) rows.push(["书籍学习", input.books.title]);
  if (input.course) rows.push([`AI 学习 · 第 ${String((input.course.meta as any)?.lessonNo ?? "")} 讲`, input.course.title]);
  if (input.world) rows.push(["全球局势 · 今日五件", input.world.title]);
  if (input.markets) rows.push(["全球与中国金融", input.markets.title]);
  if (input.tools?.length) rows.push([`前沿 AI · 本周 ${input.tools.length} 个工具`, input.tools.map((t) => t.title).join("、")]);
  const body = [
    `<rect width="${w}" height="${h}" fill="${PAPER}"/>`,
    `<rect x="0" y="0" width="${w}" height="18" fill="${ACCENT}"/>`,
    kicker(90, 150, "我的窗口 · 今日五份"),
    bigTitle(90, 268, "今天读什么", 96),
    bodyText(90, 330, input.dateLine, 30, MUTED),
    rule(90, 380, 990, 380),
    ...rows.flatMap(([label, title], i) => {
      const y = 470 + i * 180;
      return [
        bigTitle(90, y, String(i + 1).padStart(2, "0"), 46, ACCENT, SERIF),
        bodyText(190, y - 44, label, 24, MUTED),
        bodyText(190, y, cut(title, 26), 40, INK, HEI, 700),
        rule(190, y + 46, 990, y + 46),
      ];
    }),
    bodyText(90, h - 90, "每天早上自动生成 · 全部带来源 · 都能朗读", 26, MUTED),
  ].join("");
  return { kind: "poster", label: "今日五份 · 大图", width: w, height: h, svg: frame(w, h, body) };
}

export function buildBooksImage(article: Article): GeneratedImage {
  const w = 1080;
  const h = 1350;
  const meta = article.meta as Record<string, any>;
  const book = String(meta.book ?? article.title);
  const author = String(meta.author ?? "");
  const idea = String(meta.coreIdea ?? article.summary);
  const body = [
    `<rect width="${w}" height="${h}" fill="${SURFACE}"/>`,
    `<rect x="0" y="0" width="1080" height="12" fill="${ACCENT}"/>`,
    kicker(80, 120, "书籍学习 · 每日一读"),
    // 抽象书本图形：横线堆叠 + 朱红书签
    `<g transform="translate(80,190)">`,
    `<rect x="0" y="0" width="920" height="300" fill="none" stroke="${INK}" stroke-width="3"/>`,
    `<rect x="0" y="0" width="920" height="300" fill="${PAPER}"/>`,
    ...Array.from({ length: 9 }, (_, i) => `<line x1="40" y1="${52 + i * 26}" x2="${i === 4 ? 700 : 880}" y2="${52 + i * 26}" stroke="${i === 4 ? ACCENT : LINE}" stroke-width="${i === 4 ? 7 : 5}"/>`),
    `</g>`,
    bodyText(80, 580, String(meta.discipline ?? ""), 30, ACCENT, HEI, 700),
    bigTitle(80, 690, fitTitle(book, [84, 70, 58]).text, fitTitle(book, [84, 70, 58]).size),
    bodyText(80, 748, author, 30, MUTED),
    rule(80, 800, 1000, 800),
    kicker(80, 880, "核心观点", MUTED),
    ...wrapText(idea, 80, 950, 920, 62, 34, INK, SONG),
    bodyText(80, h - 80, "点击进入网页版可听完整朗读", 26, MUTED),
  ].join("");
  return { kind: "books", label: "书籍学习配图", width: w, height: h, svg: frame(w, h, body) };
}

function wrapText(
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  size: number,
  color: string,
  family: string,
  maxLines = 6
): string[] {
  const chars = Math.max(6, Math.floor(maxWidth / size));
  const lines: string[] = [];
  let cur = "";
  for (const ch of text ?? "") {
    cur += ch;
    if (cur.length >= chars) {
      lines.push(cur);
      cur = "";
      if (lines.length >= maxLines) break;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  return lines.map((l, i) => bodyText(x, y + i * lineHeight, l, size, color, family));
}

export function buildCourseImage(article: Article): GeneratedImage {
  const w = 1080;
  const h = 1350;
  const meta = article.meta as Record<string, any>;
  const steps = ["鉴权", "拼 token", "解码", "传输"];
  const body = [
    `<rect width="${w}" height="${h}" fill="${PAPER}"/>`,
    `<rect x="0" y="0" width="1080" height="12" fill="${AZURE}"/>`,
    kicker(80, 120, `AI 学习 · 第 ${String(meta.lessonNo ?? "")} 讲`, AZURE),
    bigTitle(80, 226, fitTitle(article.title, [72, 60, 50]).text, fitTitle(article.title, [72, 60, 50]).size),
    bodyText(80, 286, String(meta.stageTitle ?? ""), 28, MUTED),
    rule(80, 330, 1000, 330),
    ...steps.flatMap((s, i) => {
      const x = 80 + i * 240;
      const y = 420;
      return [
        `<rect x="${x}" y="${y}" width="190" height="190" fill="${SURFACE}" stroke="${INK}" stroke-width="3"/>`,
        bigTitle(x + 30, y + 86, String(i + 1).padStart(2, "0"), 44, ACCENT, SERIF),
        bodyText(x + 30, y + 140, s, 30, INK, HEI, 700),
        i < steps.length - 1 ? `<line x1="${x + 190}" y1="${y + 95}" x2="${x + 235}" y2="${y + 95}" stroke="${INK}" stroke-width="3"/>` : "",
      ];
    }),
    kicker(80, 720, "这一讲要弄懂", MUTED),
    ...wrapText(String(meta.goal ?? article.summary), 80, 790, 920, 60, 34, INK, SONG, 5),
    rule(80, 1120, 1000, 1120),
    bodyText(80, 1180, "从你天天在调的那个 API 出发，把底层讲明白", 26, MUTED),
  ].join("");
  return { kind: "course", label: "AI 学习配图", width: w, height: h, svg: frame(w, h, body) };
}

export function buildToolsImage(tools: Article[]): GeneratedImage {
  const w = 1080;
  const h = 1350;
  const maxStars = Math.max(1, ...tools.map((t) => Number((t.meta as any)?.stars ?? 0)));
  const rows = tools.flatMap((t, i) => {
    const meta = t.meta as Record<string, any>;
    const stars = Number(meta.stars ?? 0);
    const y = 410 + i * 172;
    const barW = Math.round((stars / maxStars) * 360);
    return [
      bigTitle(80, y, String(i + 1).padStart(2, "0"), 40, ACCENT, SERIF),
      bodyText(180, y - 34, fitTitle(t.title, [34, 30, 27]).text, fitTitle(t.title, [34, 30, 27]).size, INK, HEI, 700),
      bodyText(180, y + 16, cut(String(meta.repoFullName ?? meta.fullName ?? ""), 34), 24, MUTED),
      `<rect x="180" y="${y + 40}" width="360" height="10" fill="${LINE}"/>`,
      `<rect x="180" y="${y + 40}" width="${barW}" height="10" fill="${GOLD ?? ACCENT}"/>`,
      bodyText(580, y + 54, `${stars} 星`, 24, MUTED),
      bodyText(760, y + 54, String(meta.language ?? "").replace(/^(undefined|null|—?)$/i, "—"), 24, AZURE),
      rule(180, y + 84, 1000, y + 84),
    ];
  });
  const body = [
    `<rect width="${w}" height="${h}" fill="${SURFACE}"/>`,
    `<rect x="0" y="0" width="1080" height="12" fill="${ACCENT}"/>`,
    kicker(80, 120, "前沿 AI · 本周高星工具"),
    bigTitle(80, 226, "五个能用的开源项目", 72),
    bodyText(80, 292, "按 GitHub 新建仓库的星标排序", 28, MUTED),
    rule(80, 330, 1000, 330),
    ...rows,
    bodyText(80, h - 80, "每个都写了：这是什么、适合谁、怎么上手", 26, MUTED),
  ].join("");
  return { kind: "tools", label: "前沿 AI 配图", width: w, height: h, svg: frame(w, h, body) };
}

const GOLD = "#a2761d";

export function buildMarketsImage(article: Article, series?: { t: number[]; c: number[] } | null): GeneratedImage {
  const w = 1080;
  const h = 1350;
  const meta = article.meta as Record<string, any>;
  const quotes = (meta.quotes ?? []) as Array<{ symbol: string; name: string; price: number; changePct: number }>;
  const chart = [
    `<rect x="80" y="420" width="920" height="400" fill="${PAPER}" stroke="${LINE}" stroke-width="2"/>`
  ];
  if (series && series.c.length > 2) {
    const min = Math.min(...series.c);
    const max = Math.max(...series.c);
    const span = max - min || 1;
    const px = (i: number) => 80 + (i / (series.c.length - 1)) * 900;
    const py = (v: number) => 790 - ((v - min) / span) * 250;
    const pts = series.c.map((v, i) => `${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(" ");
    const rising = series.c[series.c.length - 1] >= series.c[0];
    const color = rising ? ACCENT : JADE;
    chart.push(`<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>`);
    chart.push(`<circle cx="${px(series.c.length - 1).toFixed(1)}" cy="${py(series.c[series.c.length - 1]).toFixed(1)}" r="10" fill="${color}"/>`);
    chart.push(`<line x1="80" y1="800" x2="1000" y2="800" stroke="${LINE}" stroke-width="2"/>`);
    chart.push(bodyText(96, 480, `标普 500 · 近 ${series.c.length} 个交易日`, 26, MUTED));
    chart.push(bodyText(96, 528, `${min.toFixed(0)} → ${max.toFixed(0)}`, 30, INK, SERIF, 700));
  }
  const quoteRows = quotes.slice(0, 6).flatMap((q, i) => {
    const y = 900 + i * 58;
    const up = q.changePct >= 0;
    return [
      bodyText(90, y, q.name, 30, INK, HEI, 700),
      bodyText(470, y, q.price.toFixed(2), 30, INK, SERIF),
      bodyText(700, y, `${up ? "+" : ""}${q.changePct.toFixed(2)}%`, 30, up ? ACCENT : JADE, SERIF, 700),
      rule(90, y + 22, 990, y + 22),
    ];
  });
  const body = [
    `<rect width="${w}" height="${h}" fill="${SURFACE}"/>`,
    `<rect x="0" y="0" width="1080" height="12" fill="${JADE}"/>`,
    kicker(80, 120, "全球与中国金融 · 真实报价", JADE),
    bigTitle(80, 226, fitTitle(article.title).text, fitTitle(article.title).size),
    bodyText(80, 286, String(meta.marketMood ?? ""), 28, MUTED),
    ...chart,
    ...quoteRows,
    bodyText(80, h - 60, "数字来自公开行情接口 · 不构成投资建议", 26, MUTED),
  ].join("");
  return { kind: "markets", label: "金融配图", width: w, height: h, svg: frame(w, h, body) };
}

export function buildWorldImage(article: Article): GeneratedImage {
  const w = 1080;
  const h = 1350;
  const meta = article.meta as Record<string, any>;
  const events = (meta.events ?? []) as Array<Record<string, any>>;
  const cards = events.slice(0, 5).flatMap((e, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const cw = i === 4 ? 920 : 440;
    const x = 80 + col * 480;
    const y = 380 + row * 312;
    const conf = String(e.confidence ?? "中");
    const confColor = conf === "高" ? JADE : conf === "低" ? ACCENT : MUTED;
    return [
      `<rect x="${x}" y="${y}" width="${cw}" height="272" fill="${PAPER}" stroke="${LINE}" stroke-width="2"/>`,
      bigTitle(x + 28, y + 70, String(i + 1).padStart(2, "0"), 38, ACCENT, SERIF),
      bodyText(x + 110, y + 62, cut(String(e.region ?? ""), 8), 24, AZURE, HEI, 700),
      ...wrapText(String(e.title ?? ""), x + 28, y + 126, cw - 56, 42, 30, INK, HEI, 3),
      bodyText(x + 28, y + 248, `置信度 ${conf}`, 22, confColor),
    ];
  });
  const body = [
    `<rect width="${w}" height="${h}" fill="${PAPER}"/>`,
    `<rect x="0" y="0" width="1080" height="12" fill="${AZURE}"/>`,
    kicker(80, 120, "全球局势 · 今日五件", AZURE),
    bigTitle(80, 226, fitTitle(article.title).text, fitTitle(article.title).size),
    rule(80, 300, 1000, 300),
    ...cards,
    bodyText(80, h - 80, "每件都标了来源与置信度 · 推断会写明是推断", 26, MUTED),
  ].join("");
  return { kind: "world", label: "局势配图", width: w, height: h, svg: frame(w, h, body) };
}

export function buildLessonPoster(input: ImageInput): GeneratedImage {
  const w = 1080;
  const h = 1440;
  const course = input.course;
  const meta = (course?.meta ?? {}) as Record<string, any>;
  const no = String(meta.lessonNo ?? 1);
  const stage = String(meta.stageTitle ?? "");
  const title = course ? course.title : "今天没有课";
  const goal = String(meta.goal ?? "");
  const body = [
    `<rect width="${w}" height="${h}" fill="${PAPER}"/>`,
    `<rect x="0" y="0" width="${w}" height="18" fill="${AZURE}"/>`,
    kicker(90, 150, `我的窗口 · AI 学习 第 ${no} 讲`, AZURE),
    bodyText(90, 202, stage, 30, MUTED),
    bigTitle(90, 322, fitTitle(title, [76, 62, 52]).text, fitTitle(title, [76, 62, 52]).size),
    rule(90, 372, 990, 372),
    kicker(90, 452, "这一讲要弄懂", MUTED),
    ...wrapText(goal, 90, 522, 900, 60, 34, INK, SONG, 5),
    rule(90, 862, 990, 862),
    kicker(90, 922, "动手练一下", ACCENT),
    ...wrapText(String(meta.exercise ?? ""), 90, 982, 900, 56, 30, INK, HEI, 5),
    bodyText(90, h - 90, "每天一讲 · 一张图 · 一段朗读", 26, MUTED),
  ].join("");
  return { kind: "poster", label: "讲次海报", width: w, height: h, svg: frame(w, h, body) };
}

export function buildImages(input: ImageInput, kinds?: string[]): GeneratedImage[] {
  const all: GeneratedImage[] = [buildCover(input)];
  if (input.books) all.push(buildBooksImage(input.books));
  if (input.course) {
    all.push(buildLessonPoster(input));
    all.push(buildCourseImage(input.course));
  }
  if (input.tools?.length) all.push(buildToolsImage(input.tools));
  if (input.markets) all.push(buildMarketsImage(input.markets, input.indexSeries));
  if (input.world) all.push(buildWorldImage(input.world));
  if (!kinds) return all;
  return all.filter((img) => kinds.includes(img.kind));
}