import fs from 'node:fs';
const f = 'scripts/export-today.ts';
let s = fs.readFileSync(f, 'utf8');
const fixes = [
  ['back tap', /\.back\{display:inline-block;font-size:13px;color:#6a6153;text-decoration:none;margin:16px 0 0\}/, '.back{display:inline-flex;align-items:center;min-height:44px;font-size:13px;color:#6a6153;text-decoration:none;margin:8px 0 0}'],
  ['footer links', /'footer a\{color:#6f6a5e;word-break:break-all\}'/, "'footer a{color:#6f6a5e;word-break:break-word;text-decoration:none;border-bottom:1px solid #ded5c3}'"],
  ['source truncate', /const allSources = SECTIONS\.flatMap\(\(s\) => bySection\[s\]\)\n  \.flatMap\(\(a: any\) => \(a\.sources \|\| \[\]\)\.map\(\(x: any\) => '<a href="' \+ esc\(x\.url\) \+ '">' \+ esc\(x\.title\) \+ '<\/a>'\)\)\n  \.slice\(0, 30\);/, "const allSources = SECTIONS.flatMap((s) => bySection[s])\n  .flatMap((a: any) => (a.sources || []).map((x: any) => '<a href=\"' + esc(x.url) + '\">' + esc(String(x.title).slice(0, 24)) + '</a>'))\n  .filter((v, i, arr) => arr.indexOf(v) === i)\n  .slice(0, 12);"],
];
for (const [label, re, to] of fixes) {
  if (re.test(s)) { s = s.replace(re, to); console.log('OK   ' + label); }
  else console.log('SKIP ' + label);
}
fs.writeFileSync(f, s, 'utf8');
