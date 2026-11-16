import fs from 'node:fs';
const f = 'src/server/publishers/wechat/index.ts';
let s = fs.readFileSync(f, 'utf8');
if (!s.includes('WECHAT_IMAGE_KINDS =')) {
  const marker = 'export function dateLineOf';
  const inject = [
    '/** 公众号只发 AI 学习：封面 + 讲次海报 + AI 学习配图 */',
    "export const WECHAT_IMAGE_KINDS = ['cover', 'poster', 'course'];",
    '',
  ].join('\n');
  s = s.replace(marker, inject + marker);
  fs.writeFileSync(f, s, 'utf8');
  console.log('常量已插入');
} else {
  console.log('常量已存在');
}