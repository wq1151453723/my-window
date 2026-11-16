import { buildWechatPreview } from '../src/server/publishers/wechat/index.js';

const p = await buildWechatPreview(new Date().toISOString().slice(0, 10));
const labelOf = (src: string) => p.images.find((i) => i.url === src)?.label ?? "配图";
const html = p.contentHtml.replace(
  /<img src="([^"]+)" data-wx-img="1"[^>]*\/>/g,
  (_m, src: string) => `<p>[在此插入图片：${labelOf(src)}]</p>`
);
console.log("占位数量:", (html.match(/在此插入图片/g) ?? []).length);
console.log("残留本地图片路径:", (html.match(/\/images\//g) ?? []).length);
console.log("片段:", html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 320));
