import fs from 'node:fs';

const fixes = [
  ['scripts/export-today.ts', 'card id', /id="course"/g, 'id="ai-course"'],
  ['scripts/export-today.ts', 'card id2', /id="tools"/g, 'id="ai-tools"'],
  ['scripts/export-today.ts', 'font min', /font-size:11px/g, 'font-size:12px'],
  ['scripts/export-today.ts', 'contrast grey', /#8a8478/g, '#6f6a5e'],
  ['scripts/export-today.ts', 'contrast gold', /#a2761d/g, '#8a6314'],
  ['src/server/publishers/wechat/html.ts', 'body width', /font-size:16px;line-height:1\.8;color:\$\{INK\}/g, 'max-width:680px;font-size:16px;line-height:1.8;color:\${INK}'],
  ['src/server/publishers/wechat/html.ts', 'digest width', /font-size:17px;line-height:1\.8;color:\$\{INK\}/g, 'max-width:680px;font-size:17px;line-height:1.8;color:\${INK}'],
  ['src/server/publishers/wechat/html.ts', 'points width', /font-size:16px;line-height:1\.75;color:\$\{INK\}/g, 'max-width:680px;font-size:16px;line-height:1.75;color:\${INK}'],
  ['src/server/publishers/wechat/html.ts', 'info width', /font-size:16px;line-height:1\.8;color:\$\{INK\}/g, 'max-width:680px;font-size:16px;line-height:1.8;color:\${INK}'],
];

for (const [file, label, re, to] of fixes) {
  let s = fs.readFileSync(file, 'utf8');
  const before = s;
  s = s.replace(re, to);
  if (s !== before) {
    fs.writeFileSync(file, s, 'utf8');
    console.log('OK   ' + label + '  ' + file.split('/').pop());
  } else {
    console.log('SKIP ' + label + '  未匹配');
  }
}
