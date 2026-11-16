import fs from 'node:fs';
import path from 'node:path';

const roots = ["src", "docs"];
const files: string[] = [];
function walk(dir: string) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx|md|css|html|json)$/.test(e.name)) files.push(p);
  }
}
for (const r of roots) walk(r);
files.push("README.md", "index.html");

let n = 0;
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  if (!src.includes("个人学习窗口")) continue;
  fs.writeFileSync(f, src.split("个人学习窗口").join("我的窗口"), "utf8");
  n++;
  console.log(`  改名：${f}`);
}
console.log(`品牌更名：${n} 个文件`);