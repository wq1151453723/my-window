import fs from 'node:fs';
const f = 'scripts/export-today.ts';
let s = fs.readFileSync(f, 'utf8');
const fixes = [
  ['.brand 20px', /\.brand\{font-family:Georgia,serif;font-weight:700;font-size:19px\}/, '.brand{font-family:Georgia,serif;font-weight:700;font-size:20px}'],
  ['toc 14px', /\.toc\{display:flex;gap:13px;flex-wrap:wrap;font-size:13px;/, '.toc{display:flex;gap:13px;flex-wrap:wrap;font-size:14px;'],
  ['summary 12px', /summary::after\{content:"展开全文";margin-left:auto;font-weight:400;color:#6f6a5e;font-size:13px\}/, 'summary::after{content:"展开全文";margin-left:auto;font-weight:400;color:#6f6a5e;font-size:12px}'],
  ['tools em 12px', /\.tools em\{font-style:normal;color:#8a6314;margin-left:6px;font-size:13px\}/, '.tools em{font-style:normal;color:#8a6314;margin-left:6px;font-size:12px}'],
  ['quote 14px', /\.q b\{display:block;font-size:13px;/, '.q b{display:block;font-size:14px;'],
  ['quote span 14px', /\.q span\{font-size:13px;/, '.q span{font-size:14px;'],
  ['body h2 17px', /\.body h2\{font-family:Georgia,serif;font-size:19px;/, '.body h2{font-family:Georgia,serif;font-size:17px;'],
];
for (const [label, re, to] of fixes) {
  if (re.test(s)) { s = s.replace(re, to); console.log('OK   ' + label); }
  else console.log('SKIP ' + label);
}
fs.writeFileSync(f, s, 'utf8');
