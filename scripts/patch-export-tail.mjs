import fs from 'node:fs';
const f = 'scripts/export-today.ts';
let s = fs.readFileSync(f, 'utf8');
const cut = s.indexOf('const html = [');
if (cut < 0) { console.log('未找到切点'); process.exit(1); }
s = s.slice(0, cut) + fs.readFileSync('scripts/_export-tail.txt', 'utf8');
fs.writeFileSync(f, s, 'utf8');
console.log('export-today.ts 尾部已替换');
