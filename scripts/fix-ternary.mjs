import fs from 'node:fs';
const f = 'scripts/export-today.ts';
let s = fs.readFileSync(f, 'utf8');
s = s.replace(/\? '全球与中国金融',/, "? '全球与中国金融'");
s = s.replace(/\? '全球局势 · 今日五件',/, "? '全球局势 · 今日五件'");
fs.writeFileSync(f, s, 'utf8');
console.log('已修正三元表达式尾逗号');
