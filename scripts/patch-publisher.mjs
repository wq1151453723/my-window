import fs from 'node:fs';
const f = 'src/server/publishers/wechat/index.ts';
let s = fs.readFileSync(f, 'utf8');

// imageInput 带上全部板块（公众号侧再按 kinds 筛选）
const oldInput = s.slice(s.indexOf('async function imageInput'), s.indexOf('const manifestPath'));
const newInput = [
  'async function imageInput(date: string): Promise<ImageInput> {',
  '  const doc = collectWechatDoc(date);',
  '  const weekKey = isoWeekKey(new Date(`${date}T12:00:00+08:00`));',
  '  let series: { t: number[]; c: number[] } | null = null;',
  '  try {',
  '    series = await fetchHistory("^GSPC", 30);',
  '  } catch {',
  '    series = null;',
  '  }',
  '  return {',
  '    date,',
  '    dateLine: doc.dateLine,',
  '    books: getLatest("books") ?? null,',
  '    course: getLatest("ai-course") ?? null,',
  '    tools: listAiToolsByWeek(weekKey),',
  '    markets: getLatest("markets") ?? null,',
  '    world: getLatest("world") ?? null,',
  '    indexSeries: series,',
  '  };',
  '}',
  '',
].join('\n');
s = s.replace(oldInput, newInput);

// 追加：站点全量配图
if (!s.includes('export async function ensureSiteImages')) {
  s = s.replace('export async function buildWechatPreview', [
    '/** 网页端静态站：生成全部板块配图 */',
    'export async function ensureSiteImages(date: string): Promise<RenderedImage[]> {',
    '  const input = await imageInput(date);',
    '  const rendered = renderWechatImages(input, date);',
    '  fs.mkdirSync(IMAGE_DIR, { recursive: true });',
    '  fs.writeFileSync(manifestPath(date), JSON.stringify(rendered, null, 2), "utf8");',
    '  return rendered;',
    '}',
    '',
    'export async function buildWechatPreview',
  ].join('\n'));
}
fs.writeFileSync(f, s, 'utf8');
console.log('publisher/index.ts patched');
