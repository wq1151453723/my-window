import fs from 'node:fs';

const p = 'src/server/publishers/wechat/audio.ts';
let s = fs.readFileSync(p, 'utf8');
const before = s;
s = s.replace(
  `.replace(/——/g, "，")` ,
  `.replace(/——/g, "，").replace(/\s+，/g, "，").replace(/，\s+/g, "，")` ,
);
s = s.replace(
  "`另外还有 ${cnNumber(s.lines.length - 1)} 条，公众号正文里都列了。`",
  "`另外还有${cnNumber(s.lines.length - 1)}条，公众号正文里都列了。`",
);
if (s === before) {
  console.log("未命中任何替换，请检查原文");
  process.exit(1);
}
fs.writeFileSync(p, s, "utf8");
console.log("audio.ts 已修补");
