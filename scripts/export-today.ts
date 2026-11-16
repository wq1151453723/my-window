import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from '../src/server/config.js';
import { listArticles } from '../src/server/db.js';
import { buildWechatPreview } from '../src/server/publishers/wechat/index.js';
import { markdownToHtml } from '../src/server/publishers/wechat/markdown.js';
import { todayStr } from '../src/server/pipeline/common.js';

const date = process.argv[2] ?? todayStr();
const exportRoot = path.join(DATA_DIR, 'exports');
const outDir = path.join(exportRoot, date);
const siteDir = path.join(exportRoot, 'site');
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(siteDir, { recursive: true });

const sections = ['books', 'ai-course', 'ai-tools', 'markets', 'world'] as const;
const articles = sections.flatMap((s) => listArticles(s, 5));

const esc = (t: string) =>
  (t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function cardOf(a: any): string {
  const audio = a.audioPath
    ? '<p style=\'margin:12px 0;\'><audio controls src=\'audio/' + path.basename(a.audioPath) + '\'></audio></p>'
    : '';
  return (
    '<article style=\'max-width:720px;margin:0 auto 40px;padding:0 20px;\'>' +
    '<p style=\'font-size:12px;letter-spacing:2px;color:#b0341f;font-weight:700;\'>' + esc(a.section) + '</p>' +
    '<h1 style=\'font-family:Georgia,serif;font-size:28px;line-height:1.3;margin:6px 0 10px;\'>' + esc(a.title) + '</h1>' +
    '<p style=\'font-size:15px;color:#6a6153;line-height:1.8;\'>' + esc(a.summary) + '</p>' +
    audio +
    '<div style=\'font-size:16px;line-height:1.9;color:#3f3f3f;\'>' + markdownToHtml(a.body) + '</div>' +
    '<p style=\'margin-top:14px;font-size:12px;color:#8a8f98;\'>' +
    '生成于 ' + esc(String(a.generatedAt).slice(0, 16).replace('T', ' ')) + '</p>' +
    '</article>'
  );
}

const days = fs
  .readdirSync(exportRoot, { withFileTypes: true })
  .filter((d) => d.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(d.name))
  .map((d) => d.name)
  .sort()
  .reverse();

const style =
  'body{margin:0;background:#f5f1e9;font:16px/1.9 \'PingFang SC\',\'Microsoft YaHei\',system-ui;color:#17130e}' +
  'header{padding:28px 20px;border-bottom:1px solid #e6ded0}' +
  'h1{font-family:Georgia,serif}' +
  '.nav a{margin-right:14px;color:#b0341f;text-decoration:none;font-size:13px}' +
  '.card{background:#fffdf8;border:1px solid #e6ded0;border-radius:14px;padding:4px 24px;margin:0 auto 28px;max-width:768px}';

const navHtml = days
  .slice(0, 14)
  .map((d) => '<a href=\'' + d + '/index.html\'>' + d + '</a>')
  .join('');
const navText = days
  .slice(0, 14)
  .map((d) => '<span style=\'margin-right:12px;color:#b0341f;font-size:13px;\'>' + d + '</span>')
  .join('');

const html =
  '<!doctype html><html lang=\'zh-CN\'><head><meta charset=\'utf-8\'>' +
  '<meta name=\'viewport\' content=\'width=device-width,initial-scale=1\'>' +
  '<title>我的窗口 · ' + date + '</title>' +
  '<style>' + style + '</style></head><body>' +
  '<header><p style=\'font-size:12px;letter-spacing:3px;color:#b0341f;font-weight:700;\'>我的窗口 · DAILY DIGEST</p>' +
  '<h1 style=\'font-family:Georgia,serif;font-size:32px;margin:8px 0 0;\'>' + date + '</h1>' +
  '<p class=\'nav\' style=\'margin:14px 0 0;\'>' + navHtml + '</p></header>' +
  articles.map(cardOf).join('') +
  '</body></html>';

fs.writeFileSync(path.join(outDir, 'index.html'), html, 'utf8');
const siteHtml = html.replace(navHtml, navText);
fs.writeFileSync(path.join(siteDir, 'index.html'), siteHtml, 'utf8');

// 公众号稿：图片地址换成可见占位
const preview = await buildWechatPreview(date);
const labelOf = (src: string) => preview.images.find((i) => i.url === src)?.label ?? '配图';
const wechatHtml = preview.contentHtml.replace(
  /<img src="([^"]+)" data-wx-img="1"[^>]*\/>/g,
  (_m, src: string) =>
    '<p style=\'color:#b0341f;font-size:14px;text-align:center;\'>【在此插入图片：' + labelOf(src) + '】</p>'
);
fs.writeFileSync(path.join(outDir, 'wechat.html'), wechatHtml, 'utf8');
fs.writeFileSync(path.join(siteDir, 'wechat.html'), wechatHtml, 'utf8');

// 图片
for (const target of [outDir, siteDir]) {
  const imgDir = path.join(target, 'images');
  fs.mkdirSync(imgDir, { recursive: true });
  for (const img of preview.images) {
    const src = path.join(DATA_DIR, 'images', img.file);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(imgDir, img.file));
  }
}

// 音频
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

// 文字摘要
const mdLines: string[] = ['# 我的窗口 · ' + date, ''];
for (const a of articles) {
  mdLines.push('## ' + a.title, '');
  mdLines.push('- 板块：' + a.section);
  mdLines.push('- 摘要：' + a.summary);
  mdLines.push('- 要点：');
  for (const t of a.takeaways) mdLines.push('  - ' + t);
  mdLines.push('- 来源：' + (a.sources.map((s) => '[' + s.title + '](' + s.url + ')').join('、') || '（无外链）'), '');
}
fs.writeFileSync(path.join(outDir, 'summary.md'), mdLines.join('\n'), 'utf8');

console.log('导出完成：' + outDir);
console.log('  静态站点：' + path.join(siteDir, 'index.html'));
console.log('  文章 ' + articles.length + ' 篇 | 图片 ' + preview.images.length + ' 张 | 历史 ' + days.length + ' 天');
