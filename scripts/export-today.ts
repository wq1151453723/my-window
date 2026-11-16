import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from '../src/server/config.js';
import { listArticles } from '../src/server/db.js';
import { buildWechatPreview, ensureSiteImages } from '../src/server/publishers/wechat/index.js';
import { markdownToHtml } from '../src/server/publishers/wechat/markdown.js';
import { todayStr } from '../src/server/pipeline/common.js';

const date = process.argv[2] ?? todayStr();
const exportRoot = path.join(DATA_DIR, 'exports');
const outDir = path.join(exportRoot, date);
const siteDir = path.join(exportRoot, 'site');
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(siteDir, { recursive: true });

const SECTIONS = ['books', 'ai-course', 'ai-tools', 'markets', 'world'] as const;
const bySection = {} as Record<string, any[]>;
for (const s of SECTIONS) {
  const list = listArticles(s, 8);
  if (s === 'ai-course') list.sort((a: any, b: any) => Number(b.meta?.lessonNo ?? 0) - Number(a.meta?.lessonNo ?? 0));
  bySection[s] = list;
}

const esc = (t: string) =>
  (t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const weekLabel = (d: string) => {
  const dt = new Date(d + 'T00:00:00+08:00');
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][dt.getDay()];
  return (dt.getMonth() + 1) + ' 月 ' + dt.getDate() + ' 日 · ' + week;
};

const CSS = [
  '*{box-sizing:border-box}',
  'html{-webkit-text-size-adjust:100%}',
  'body{margin:0;background:#f5f1e9;color:#17130e;font:16px/1.8 -apple-system,PingFang SC,Microsoft YaHei,system-ui,sans-serif;padding-bottom:env(safe-area-inset-bottom)}',
  'img{max-width:100%;height:auto;display:block}',
  'a{color:#b0341f}',
  '.top{position:sticky;top:0;z-index:9;background:rgba(245,241,233,.93);backdrop-filter:blur(10px);border-bottom:1px solid #e6ded0;padding:11px 16px;display:flex;align-items:baseline;gap:10px}',
  '.brand{font-family:Georgia,serif;font-weight:700;font-size:20px}',
  '.brand i{font-style:normal;font-size:12px;letter-spacing:.2em;color:#b0341f;font-family:system-ui;font-weight:700;margin-left:6px}',
  '.top .date{margin-left:auto;font-size:12px;color:#6a6153;white-space:nowrap}',
  '.wrap{max-width:680px;margin:0 auto;padding:0 16px}',
  '.banner{margin:16px 0 0;border-radius:14px;overflow:hidden;box-shadow:0 10px 26px -16px rgba(23,19,14,.22)}',
  '.hero{padding:22px 2px 4px}',
  '.kicker{font-size:12px;letter-spacing:.2em;color:#b0341f;font-weight:700;margin:0 0 8px}',
  'h1{font-family:Georgia,serif;font-size:30px;line-height:1.24;margin:0 0 6px;letter-spacing:-.01em}',
  '.dateline{font-size:14px;color:#6a6153;margin:0 0 16px}',
  '.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin:0 0 18px}',
  '.stat{background:#fffdf8;border:1px solid #e6ded0;border-radius:12px;padding:11px 12px 10px}',
  '.stat b{display:block;font-family:Georgia,serif;font-size:22px;line-height:1.15;color:#17130e}',
  '.stat span{font-size:12px;color:#6a6153;letter-spacing:.06em}',
  '.toc{display:flex;gap:13px;flex-wrap:wrap;font-size:14px;padding:0 0 16px;border-bottom:1px solid #e6ded0;margin-bottom:18px}',
  '.toc a{color:#6a6153;text-decoration:none;border-bottom:1px solid #e0d8c8;padding-bottom:2px}',
  '.card{background:#fffdf8;border:1px solid #e6ded0;border-radius:14px;padding:18px;margin:0 0 16px;box-shadow:0 1px 2px rgba(23,19,14,.03)}',
  '.card h2{font-family:Georgia,serif;font-size:22px;line-height:1.3;margin:0 0 10px}',
  '.art{width:100%;border-radius:10px;margin:12px 0 2px}',
  '.sum{font-size:15px;line-height:1.75;color:#4a4238;margin:0 0 12px}',
  '.pts{margin:0 0 12px;padding:0;list-style:none}',
  '.pts li{position:relative;padding-left:16px;font-size:15px;line-height:1.7;margin-bottom:6px;color:#3f3f3f}',
  '.pts li::before{content:"";position:absolute;left:0;top:11px;width:5px;height:5px;border-radius:9px;background:#b0341f}',
  'details{border-top:1px solid #efe9df}',
  'summary{list-style:none;cursor:pointer;min-height:46px;display:flex;align-items:center;font-size:14px;color:#b0341f;font-weight:600;gap:8px}',
  'summary::-webkit-details-marker{display:none}',
  'summary::after{content:"展开全文";margin-left:auto;font-weight:400;color:#6f6a5e;font-size:12px}',
  'details[open] summary::after{content:"收起"}',
  '.body{font-size:17px;line-height:1.95;color:#3f3f3f;padding-top:10px}',
  '.body p{margin:0 0 1.1em}',
  '.body h2{font-family:Georgia,serif;font-size:17px;margin:1.4em 0 .5em}',
  '.body h3{font-size:17px;margin:1.2em 0 .4em}',
  '.body ul{padding-left:18px;margin:0 0 1em}',
  '.body li{margin-bottom:.4em}',
  '.audio{width:100%;height:40px;margin:12px 0 4px}',
  '.quotes{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:12px 0 12px}',
  '.q{background:#faf7f0;border:1px solid #ece4d6;border-radius:10px;padding:8px 10px}',
  '.q b{display:block;font-size:14px;font-weight:600;color:#17130e}',
  '.q span{font-size:14px;font-variant-numeric:tabular-nums}',
  '.up{color:#b0341f}.down{color:#2f5d4c}',
  '.events{counter-reset:ev;list-style:none;padding:0;margin:12px 0}',
  '.events li{counter-increment:ev;position:relative;padding-left:30px;margin-bottom:9px;font-size:15px;line-height:1.6;color:#2f2a22}',
  '.events li::before{content:counter(ev,decimal-leading-zero);position:absolute;left:0;top:1px;font-family:Georgia,serif;font-size:15px;color:#b0341f}',
  '.tools{list-style:none;padding:0;margin:12px 0}',
  '.tools li{border-top:1px solid #f0e9dd;padding:9px 0;font-size:14px;line-height:1.6;color:#3f3f3f}',
  '.tools b{font-weight:600;color:#17130e}',
  '.tools em{font-style:normal;color:#8a6314;margin-left:6px;font-size:12px}',
  '.prog{height:4px;border-radius:4px;background:#e6ded0;overflow:hidden;margin:10px 0 2px}',
  '.prog i{display:block;height:100%;background:#b0341f}',
  '.meta{font-size:12px;color:#6f6a5e;margin:8px 0 0}',
  'footer{border-top:1px solid #e6ded0;margin-top:10px;padding:20px 0 44px;font-size:12px;color:#6f6a5e;line-height:1.9}',
  'footer a{color:#6a6153;word-break:break-all}',
  '@media(min-width:720px){.wrap{padding:0 24px}.quotes{grid-template-columns:repeat(3,1fr)}}',
].join('\n');

const imgFor = (kind: string) => 'images/' + date + '-' + kind + '.png';

const points = (items: string[]) =>
  items.length
    ? '<ul class="pts">' + items.slice(0, 4).map((t) => '<li>' + esc(t) + '</li>').join('') + '</ul>'
    : '';

const audioOf = (a: any) =>
  a.audioPath
    ? '<audio class="audio" controls preload="none" src="audio/' + path.basename(a.audioPath) + '"></audio>'
    : '';

const bodyOf = (a: any) =>
  '<details><summary>读完整讲解</summary><div class="body">' + markdownToHtml(a.body) + '</div></details>';

const metaLine = (a: any) =>
  '<p class="meta">生成于 ' + esc(String(a.generatedAt || '').slice(0, 16).replace('T', ' ')) + '</p>';

function booksCard(): string {
  const a = bySection['books'][0];
  if (!a) return '';
  const m = a.meta || {};
  return [
    '<section class="card" id="books">',
    '<p class="kicker">书籍学习 · ' + esc(String(m.discipline || '')) + '</p>',
    '<h2>' + esc(a.title) + '</h2>',
    '<img class="art" src="' + imgFor('books') + '" alt="书籍学习配图">',
    '<p class="sum">' + esc(a.summary) + '</p>',
    points(a.takeaways || []),
    bodyOf(a),
    audioOf(a),
    metaLine(a),
    '</section>',
  ].join('');
}

function courseCard(total: number): string {
  const a = bySection['ai-course'][0];
  if (!a) return '';
  const m = a.meta || {};
  const no = Number(m.lessonNo || 1);
  const pct = Math.min(100, Math.round((no / Math.max(1, total)) * 100));
  return [
    '<section class="card" id="ai-course">',
    '<p class="kicker">AI 学习 · 第 ' + no + ' 讲 · ' + esc(String(m.stageTitle || '')) + '</p>',
    '<h2>' + esc(a.title) + '</h2>',
    '<img class="art" src="' + imgFor('course') + '" alt="AI 学习配图">',
    '<p class="sum">' + esc(a.summary) + '</p>',
    points(a.takeaways || []),
    '<div class="prog"><i style="width:' + pct + '%"></i></div>',
    '<p class="meta">课程进度 ' + no + ' / ' + total + ' 讲</p>',
    bodyOf(a),
    audioOf(a),
    '</section>',
  ].join('');
}

function toolsCard(): string {
  const list = bySection['ai-tools'];
  if (!list.length) return '';
  const items = list
    .map((t) => {
      const m = t.meta || {};
      const stars = Number(m.stars || 0);
      const starText =
        stars > 0
          ? '<em>★' + (stars >= 1000 ? (stars / 1000).toFixed(1) + 'k' : String(stars)) + '</em>'
          : '';
      return (
        '<li><b>' + esc(t.title) + '</b>' + starText +
        '<br>' + esc(String(m.language || '')) + ' · ' + esc(String(m.repoFullName || '')) + '</li>'
      );
    })
    .join('');
  return [
    '<section class="card" id="ai-tools">',
    '<p class="kicker">前沿 AI · 本周 ' + list.length + ' 个工具</p>',
    '<h2>本周 GitHub 高星开源项目</h2>',
    '<img class="art" src="' + imgFor('tools') + '" alt="前沿 AI 配图">',
    '<ul class="tools">' + items + '</ul>',
    '<details><summary>逐个看怎么用</summary><div class="body">' +
      list.map((t) => '<h3>' + esc(t.title) + '</h3>' + markdownToHtml(t.body)).join('') +
    '</div></details>',
    '</section>',
  ].join('');
}

function marketsCard(): string {
  const a = bySection['markets'][0];
  if (!a) return '';
  const m = a.meta || {};
  const quotes = (m.quotes || []).slice(0, 6);
  const qhtml = quotes
    .map((q: any) => {
      const up = Number(q.changePct) >= 0;
      return (
        '<div class="q"><b>' + esc(q.name) + '</b><span class="' + (up ? 'up' : 'down') + '">' +
        esc(Number(q.changePct).toFixed(2) + '%') + '</span></div>'
      );
    })
    .join('');
  return [
    '<section class="card" id="markets">',
    '<p class="kicker">全球与中国金融</p>',
    '<h2>' + esc(a.title) + '</h2>',
    '<img class="art" src="' + imgFor('markets') + '" alt="金融配图">',
    '<p class="sum">' + esc(a.summary) + '</p>',
    qhtml ? '<div class="quotes">' + qhtml + '</div>' : '',
    points(a.takeaways || []),
    bodyOf(a),
    audioOf(a),
    metaLine(a),
    '</section>',
  ].join('');
}

function worldCard(): string {
  const a = bySection['world'][0];
  if (!a) return '';
  const m = a.meta || {};
  const events = (m.events || [])
    .map((e: any) => '<li>' + esc(String(e.title || '')) + '</li>')
    .join('');
  return [
    '<section class="card" id="world">',
    '<p class="kicker">全球局势 · 今日五件</p>',
    '<h2>' + esc(a.title) + '</h2>',
    '<img class="art" src="' + imgFor('world') + '" alt="局势配图">',
    events ? '<ol class="events">' + events + '</ol>' : '',
    points(a.takeaways || []),
    bodyOf(a),
    audioOf(a),
    metaLine(a),
    '</section>',
  ].join('');
}

const LESSON_TOTAL = 40;
const courseNo = Number((bySection['ai-course'][0]?.meta || {}).lessonNo || 1);
const mQuotes = (bySection['markets'][0]?.meta || {}).quotes || [];
const upCount = mQuotes.filter((q: any) => Number(q.changePct) > 0).length;

const stats = [
  { n: String(courseNo), l: '课程讲次 / ' + LESSON_TOTAL },
  { n: String(bySection['ai-tools'].length), l: '本周开源工具' },
  { n: mQuotes.length ? upCount + '/' + mQuotes.length : '--', l: '今日上涨指数' },
];

const toc = [
  ['books', '书籍学习'],
  ['ai-course', 'AI 学习'],
  ['ai-tools', '前沿 AI'],
  ['markets', '金融'],
  ['world', '局势'],
].filter((row) => bySection[row[0]] && bySection[row[0]].length);

const allSources = SECTIONS.flatMap((s) => bySection[s])
  .flatMap((a: any) => (a.sources || []).map((x: any) => '<a href="' + esc(x.url) + '">' + esc(String(x.title).slice(0, 24)) + '</a>'))
  .filter((v, i, arr) => arr.indexOf(v) === i)
  .slice(0, 12);


const CSS2 = [
  '.tabs{display:flex;gap:15px;overflow-x:auto;white-space:nowrap;-webkit-overflow-scrolling:touch;padding:10px 16px;border-bottom:1px solid #e6ded0;background:rgba(245,241,233,.95);scrollbar-width:none;position:sticky;top:57px;z-index:8}',
  '.tabs::-webkit-scrollbar{display:none}',
  '.tabs a{font-size:14px;color:#6a6153;text-decoration:none;padding:4px 0;flex:0 0 auto}',
  '.tabs a.on{color:#b0341f;font-weight:700}',
  '.entry{display:block;text-decoration:none;color:inherit;background:#fffdf8;border:1px solid #e6ded0;border-radius:14px;padding:16px 16px 14px;margin:0 0 14px;box-shadow:0 1px 2px rgba(23,19,14,.03)}',
  '.entry h2{font-family:Georgia,serif;font-size:20px;line-height:1.35;margin:0 0 8px}',
  '.entry .sum{font-size:14px;line-height:1.7;color:#4a4238;margin:0 0 10px}',
  '.entry .go{font-size:13px;color:#b0341f;font-weight:600}',
  '.entry .art{margin:10px 0 12px}',
  '.back{display:inline-flex;align-items:center;min-height:44px;font-size:13px;color:#6a6153;text-decoration:none;margin:8px 0 0}',
].join('\n');

const SECTION_ORDER = ['books', 'ai-course', 'ai-tools', 'markets', 'world'];
const SECTION_LABEL: Record<string, string> = {
  books: '书籍学习',
  'ai-course': 'AI 学习',
  'ai-tools': '前沿 AI',
  markets: '全球金融',
  world: '全球局势',
};

const presentSections = () => SECTION_ORDER.filter((id) => bySection[id] && bySection[id].length);

function cardFor(id: string): string {
  if (id === 'books') return booksCard();
  if (id === 'ai-course') return courseCard(LESSON_TOTAL);
  if (id === 'ai-tools') return toolsCard();
  if (id === 'markets') return marketsCard();
  if (id === 'world') return worldCard();
  return '';
}

function entryFor(id: string): string {
  const a = bySection[id][0];
  if (!a) return '';
  const kick =
    id === 'ai-course'
      ? 'AI 学习 · 第 ' + Number((a.meta || {}).lessonNo || 1) + ' 讲 · ' + String((a.meta || {}).stageTitle || '')
      : id === 'ai-tools'
        ? '前沿 AI · 本周 ' + bySection[id].length + ' 个工具'
        : id === 'markets'
          ? '全球与中国金融'
          : id === 'world'
            ? '全球局势 · 今日五件'
            : '书籍学习 · ' + String((a.meta || {}).discipline || '');
  return [
    '<a class="entry" href="' + id + '.html">',
    '<p class="kicker">' + esc(kick) + '</p>',
    '<h2>' + esc(a.title) + '</h2>',
    '<p class="sum">' + esc(a.summary) + '</p>',
    '<img class="art" src="' + imgFor(id === 'ai-course' ? 'course' : id === 'ai-tools' ? 'tools' : id) + '" alt="' + esc(SECTION_LABEL[id]) + '">',
    '<span class="go">进入阅读 ›</span>',
    '</a>',
  ].join('');
}

function navFor(current: string | null): string {
  const items = ['<a href="index.html"' + (current === null ? ' class="on"' : '') + '>今日</a>'];
  for (const id of presentSections()) {
    items.push('<a href="' + id + '.html"' + (id === current ? ' class="on"' : '') + '>' + esc(SECTION_LABEL[id]) + '</a>');
  }
  return items.join('');
}

function pageShell(current: string | null, inner: string): string {
  return [
    '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">',
    '<meta name="theme-color" content="#f5f1e9">',
    '<meta name="apple-mobile-web-app-capable" content="yes">',
    '<title>我的窗口 · ' + esc(date) + (current ? ' · ' + esc(SECTION_LABEL[current]) : '') + '</title>',
    '<style>' + CSS + CSS2 + '</style></head><body>',
    '<div class="top"><a class="brand" href="index.html">我的窗口<i>DAILY DIGEST</i></a><div class="date">' + esc(date) + '</div></div>',
    '<nav class="tabs">' + navFor(current) + '</nav>',
    '<div class="wrap">',
    inner,
    '<footer>',
    '<p>《我的窗口》· 每日学习订阅。内容基于公开数据与来源生成，仅供参考，不构成投资建议。</p>',
    allSources.length ? '<p>来源：' + allSources.join(' · ') + '</p>' : '',
    '<p>页面由 GitHub Actions 每日自动生成并发布。</p>',
    '</footer>',
    '</div></body></html>',
  ].join('\n');
}

// 落地页：今日总览 + 五个入口
const landing = pageShell(
  null,
  [
    '<div class="banner"><img src="' + imgFor('cover') + '" alt="我的窗口"></div>',
    '<section class="hero">',
    '<p class="kicker">今日 ' + presentSections().length + ' 份</p>',
    '<h1>今天读什么</h1>',
    '<p class="dateline">' + esc(weekLabel(date)) + ' · 每天早上自动生成</p>',
    '<div class="stats">' +
      stats.map((s) => '<div class="stat"><b>' + esc(s.n) + '</b><span>' + esc(s.l) + '</span></div>').join('') +
    '</div>',
    '</section>',
    presentSections().map((id) => entryFor(id)).join(''),
  ].join('\n'),
);

const sectionPages: Record<string, string> = {};
for (const id of presentSections()) {
  sectionPages[id] = pageShell(
    id,
    '<a class="back" href="index.html">‹ 回到今日</a>' + cardFor(id)
  );
}

for (const target of [outDir, siteDir]) {
  fs.writeFileSync(path.join(target, 'index.html'), landing, 'utf8');
  for (const id of Object.keys(sectionPages)) {
    fs.writeFileSync(path.join(target, id + '.html'), sectionPages[id], 'utf8');
  }
}

const preview = await buildWechatPreview(date);
const labelOf = (src: string) => preview.images.find((i) => i.url === src)?.label ?? '配图';
const wechatHtml = preview.contentHtml.replace(
  /<img src="([^"]+)" data-wx-img="1"[^>]*\/>/g,
  (_m, src: string) =>
    '<p style="color:#b0341f;font-size:14px;text-align:center;">【在此插入图片：' + labelOf(src) + '】</p>'
);
for (const target of [outDir, siteDir]) {
  fs.writeFileSync(path.join(target, 'wechat.html'), wechatHtml, 'utf8');
}

const siteImages = await ensureSiteImages(date);
for (const target of [outDir, siteDir]) {
  const imgDir = path.join(target, 'images');
  fs.mkdirSync(imgDir, { recursive: true });
  for (const img of siteImages) {
    const src = path.join(DATA_DIR, 'images', img.file);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(imgDir, img.file));
  }
}

const audioSrc = path.join(DATA_DIR, 'audio');
if (fs.existsSync(audioSrc)) {
  for (const target of [outDir, siteDir]) {
    const audioDir = path.join(target, 'audio');
    fs.mkdirSync(audioDir, { recursive: true });
    for (const f of fs.readdirSync(audioSrc)) {
      if (f.endsWith('.mp3')) fs.copyFileSync(path.join(audioSrc, f), path.join(audioDir, f));
    }
  }
}

const mdLines: string[] = ['# 我的窗口 · ' + date, ''];
for (const s of SECTIONS) {
  for (const a of bySection[s]) {
    mdLines.push('## ' + a.title, '');
    mdLines.push('- 板块：' + a.section);
    mdLines.push('- 摘要：' + a.summary);
    mdLines.push('- 要点：');
    for (const t of a.takeaways || []) mdLines.push('  - ' + t);
    mdLines.push(
      '- 来源：' + ((a.sources || []).map((x: any) => '[' + x.title + '](' + x.url + ')').join('、') || '（无外链）'),
      ''
    );
  }
}
fs.writeFileSync(path.join(outDir, 'summary.md'), mdLines.join('\n'), 'utf8');

console.log('导出完成：' + outDir);
console.log('  落地页 + ' + Object.keys(sectionPages).length + ' 个板块页 | 配图 ' + siteImages.length + ' 张');
