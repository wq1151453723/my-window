import { z } from 'zod';

import type { PromptSpec } from '../../../shared/types.js';
import { WeeklyPayloadSchema } from '../schema.js';

/** ai-weekly 板块的输入：一周的动态头条 + 这一周火的 GitHub 仓库。 */
export interface AiWeeklyInput {
  weekKey: string;
  period: string;
  headlines: Array<{ title: string; url: string; source: string; publishedAt?: string }>;
  repos: Array<{ fullName: string; url: string; description: string; stars: number; language: string }>;
}

export type WeeklyPayload = z.infer<typeof WeeklyPayloadSchema>;

/**
 * meta 字段清单直接从 zod 契约里取，避免提示词与 schema 各写一份而对不上。
 * 契约新增字段时，这里与【输出结构】会同步变化。
 */
const weeklyMetaShape = WeeklyPayloadSchema.shape.meta.shape as unknown as Record<string, any>;

/**
 * 取 zod 契约里对象类型的字段名。
 * 契约里如果给数组元素套了 transform（管道类型），要拆到管道内侧的对象，
 * 否则拿到的字段清单会是空的，输出骨架就会渲染成空对象。
 */
function objectShapeKeys(schema: any): string[] {
  if (!schema) return [];
  if (schema.shape) return Object.keys(schema.shape);
  const inner = schema._def?.in ?? schema._def?.innerType ?? schema._def?.schema;
  return inner ? objectShapeKeys(inner) : [];
}

const weeklyMetaFields: string[] = Object.keys(weeklyMetaShape);
const highlightFields: string[] = objectShapeKeys(weeklyMetaShape['highlights']?.element);
const techItemFields: string[] = objectShapeKeys(weeklyMetaShape['techList']?.element);

/** 术语条目里「大白话解释」那个字段的候选名，按优先级取第一个存在的。 */
const TECH_EXPLAIN_CANDIDATES = ['explain', 'plainMeaning', 'meaning', 'description', 'plain'];
const techExplainField = TECH_EXPLAIN_CANDIDATES.find((k) => techItemFields.includes(k));
const techFields: string[] = [
  ...(techItemFields.includes('term') ? ['term'] : []),
  ...(techExplainField ? [techExplainField] : []),
];

/** 每个字段该怎么写：给模型的填写说明。契约里没登记的字段走兜底说明。 */
const WEEKLY_FIELD_HINTS: Record<string, string> = {
  weekKey: '与输入的周次一字不差',
  period: '与输入的覆盖区间一字不差',
  highlights: '3 到 6 条，每条按下面给的字段顺序写',
  techList: '2 到 5 个术语，每个用一句大白话解释',
};

const HIGHLIGHT_FIELD_HINTS: Record<string, string> = {
  title: '这条动态是什么，直接用输入里的原标题',
  whatChanged: '技术层面到底变了什么，只写输入里能对上的事实',
  whyItMatters: '为什么重要，讲机制层面的影响',
  impactOnYou: '对每天调 API 的人意味着什么，具体到用法或选型',
  source: '输入里能对上的来源名，对不上就留空字符串',
  url: '输入里能对上的网址，对不上就留空字符串',
};

const TECH_FIELD_HINTS: Record<string, string> = {
  term: '术语',
  explain: '一句大白话解释，说白了就是……',
  plainMeaning: '一句大白话解释，说白了就是……',
};

/** 输出格式硬约束：与其它板块保持一致的「只出一个 JSON」纪律。 */
const COMMON_RULES = `【输出格式 · 硬约束】
1. 只输出一个 JSON 对象，字段与【输出结构】完全一致：不增字段、不缺字段、不改字段名。
2. 禁止代码块包裹（三个反引号加 json，或任何其它围栏）；禁止任何解释性文字、前言、结语、自检说明、Markdown 标题。
3. 回复的第一个字符必须是左花括号，最后一个字符必须是右花括号，中间只有这一个 JSON 对象。
4. 字符串里的换行用标准 JSON 转义表示（反斜杠加字母 n，一共两个字符）；正文分段就写两个这样的转义。不要写成两个反斜杠（那会被解析成字面量），也不要插入真实换行。
5. 输出必须能被 JSON.parse 一次性解析成功：不允许尾随逗号、不允许单引号、不允许注释、不允许 NaN 或 Infinity。
`;

/** 事实纪律：只能用输入里的东西，热度不等于进展。 */
const FACT_RULES = `【事实纪律 · 硬约束】
1. 只能使用【头条】与【仓库】里给出的事实；不得编造版本号、benchmark 数字、融资金额、公司动作、发布日期、作者与用户量。
2. 不得把「开源项目变多」「星标涨得快」说成「技术突破」；热度不等于进展，这条界线不能模糊。
3. 事实与解读必须分开：whatChanged 只写输入里能对上的事实；whyItMatters 与 impactOnYou 写你的判断，并用「通常」「大致」「值得关注」「可能」「取决于」这类措辞点明这是解读。
4. 不确定就写不确定，不要用一个听起来合理的说法填空。
5. source 与 url 只有在输入里能一一对应上时才填；对应不上就留空字符串，不要拼一个像模像样的链接。
`;

/** 读者画像与语气：给工程师看的技术周报，克制、有判断、不吹不黑。 */
const TONE_RULES = `【读者画像与语气 · 硬约束】
1. 读者每天都在写代码、调大模型 API，关心的是「这件事对我的用法和选型意味着什么」。
2. 不写「震撼」「颠覆」「炸裂」「碾压」这类营销词，也不写「史上最强」这类宣传语。
3. 语气克制、有判断、不吹不黑：该夸的讲清楚好在哪，该疑的讲清楚疑在哪。
4. 术语一律翻译成人话：每个术语后面跟一句「说白了就是……」的解释。
5. 不写「大家好」「今天我们来聊聊」这类主持腔。
`;

/** 要点结构：每条落到「对你意味着什么」。 */
const HIGHLIGHT_RULES = `【要点结构 · 硬约束】
1. meta.highlights 写 3 到 6 条，每条按下面给的字段顺序写，字段顺序固定不变。
2. title（如果这一条有这个字段）写这条动态是什么：直接用输入里的原标题；来自仓库的条目就写仓库名加一句话说明它做什么。
3. whatChanged 只写技术层面到底变了什么，一到两句，讲事实。
4. whyItMatters 讲为什么重要，讲机制层面的影响，不堆形容词。
5. impactOnYou 必须具体到一个每天调 API 的人能落地的动作或选型判断：怎么改用法、要不要换模型、要不要加缓存、要不要改评测方式、什么场景可以先不跟。
6. meta.techList 写 2 到 5 个术语，每个术语的大白话解释用一句人话讲清楚它到底指什么。
`;

/** 长度。 */
const LENGTH_RULES = `【长度 · 硬约束】（字数按去掉空白后的字符数计）
1. summary：120 到 200 字。
2. takeaways：3 到 5 条，每条 20 到 45 字，每条一句话，不写序号，不加「一、二、三」。
3. body：900 到 1400 字，段落之间用一个空行分隔；段落内可以用两个星号包住关键结论做粗体；不要写 Markdown 标题符号。
4. script：400 到 700 字，口语化，句子短，可直接朗读。
`;

/** 朗读适配：script 要能直接念出来。 */
const TTS_RULES = `【朗读适配 · 硬约束】
1. script 里不得出现表情符号、括号注释、Markdown 标记（井号、星号、反引号、大于号、短横线）、网址或链接。
2. script 里不得出现阿拉伯数字，数字一律写成自然的中文读法：12.3% 读成「百分之十二点三」，1200 个 token 读成「一千二百个 token」，2026 年读成「二零二六年」。
3. script 不要写「大家好」「今天我们来聊聊」这类主持腔，直接进入内容。
4. script 与 body 的事实必须一致：可以换个说法，但不能多出 body 里没有的事实。
`;

/** 本板块专属要求。 */
const WEEKLY_RULES = `【本板块要求 · 本周技术速递】
1. body 的推进顺序：本周总体判断 → 逐条展开（事实 → 机制 → 对你的影响）→ 术语表 → 接下来一周值得盯什么。
2. 每周只有一个主线判断，不要写成流水账。
3. meta.weekKey 与 meta.period 必须与输入一字不差。
4. 结尾给一条「下周值得盯什么」，是观察项，不是预测。
5. 仓库部分只描述输入里给出的信息（做什么用的、什么语言、多少星），不要推断它的成熟度、性能或采用情况。
`;

const SYSTEM = `你是一位给工程师写 AI 技术周报的中文作者，同时兼任播客撰稿人：既写页面上的周报正文，也写能直接念出来的口语稿。读者每天都在写代码、调大模型 API，他不缺新闻，缺的是判断。

${COMMON_RULES}

${FACT_RULES}

${TONE_RULES}

${HIGHLIGHT_RULES}

${LENGTH_RULES}

${TTS_RULES}

${WEEKLY_RULES}

【收尾检查 · 必须在心里过一遍再输出】
- 字段齐全，且能被 JSON.parse 解析成功。
- 每条 highlight 的 source 与 url 要么能在输入里对上，要么留空。
- 没有把热度说成突破，没有编造输入里没有的数字与版本号。
- 解读部分都用了「通常」「大致」「值得关注」「可能」这类措辞。
- 术语都翻译成了人话。
- 长度都落在规定区间。
- script 里没有表情、括号、网址、Markdown 标记和阿拉伯数字。
`;

/** 按契约里的字段清单生成 meta 的输出骨架。 */
function buildWeeklyMetaSkeleton(): string {
  const lines: string[] = [];
  for (const f of weeklyMetaFields) {
    if (f === 'highlights') {
      const item = highlightFields
        .map((k) => '        "' + k + '": "' + (HIGHLIGHT_FIELD_HINTS[k] ?? '按输入填写，不要编造') + '"')
        .join(',\n');
      lines.push('    "highlights": [\n      {\n' + item + '\n      }\n    ]');
      continue;
    }
    if (f === 'techList') {
      const item = techFields
        .map((k) => '        "' + k + '": "' + (TECH_FIELD_HINTS[k] ?? '按输入填写，不要编造') + '"')
        .join(',\n');
      lines.push('    "techList": [\n      {\n' + item + '\n      }\n    ]');
      continue;
    }
    lines.push('    "' + f + '": "' + (WEEKLY_FIELD_HINTS[f] ?? '按输入填写，不要编造') + '"');
  }
  return lines.join(',\n');
}

/** 组装 ai-weekly 的 user 消息：把本周素材摆到台面上，再给出输出结构。 */
export function buildAiWeeklyUser(input: AiWeeklyInput): string {
  const headlineLines = (input.headlines ?? []).map((h, i) => {
    const when = h.publishedAt ? '（' + h.publishedAt.slice(0, 10) + '）' : '';
    return i + 1 + '. ' + h.title + ' —— 来源：' + h.source + when;
  });
  const headlineBlock =
    headlineLines.length > 0 ? headlineLines.join('\n') : '（本周没有抓到可用头条：只写仓库部分，不要编造头条）';
  const repoLines = (input.repos ?? []).map((r, i) => {
    return (
      i + 1 +
      '. ' +
      r.fullName +
      '（' +
      (r.language || '未标注语言') +
      '，' +
      r.stars +
      ' 星）—— ' +
      (r.description || '仓库没有给出描述')
    );
  });
  const repoBlock = repoLines.length > 0 ? repoLines.join('\n') : '（本周没有可用仓库：不要编造仓库）';
  const skeleton = `{
  "title": "一句话标题，不超过 25 字",
  "subtitle": "一句话副标题，不超过 40 字",
  "summary": "120-200 字摘要",
  "takeaways": ["20-45 字要点一", "20-45 字要点二", "20-45 字要点三"],
  "body": "900-1400 字正文，段落之间用两个转义换行分隔",
  "script": "400-700 字口语化朗读稿",
  "meta": {
${buildWeeklyMetaSkeleton()}
  }
}`;

  return [
    '【周次】' + input.weekKey,
    '【覆盖区间】' + input.period,
    '【头条】\n' + headlineBlock,
    '【仓库】\n' + repoBlock,
    '【输出结构】\n' + skeleton,
    '【三条底线】\n' +
      '一、只输出一个 JSON 对象，禁止代码块包裹，字段与上面完全一致。\n' +
      '二、事实只用上面给的头条与仓库；解读要用「通常」「大致」「值得关注」这类措辞点明。\n' +
      '三、每条要点都要落到「对每天调 API 的人意味着什么」，不写营销话术。',
  ].join('\n\n');
}

export const aiWeeklyPrompt: PromptSpec<AiWeeklyInput, WeeklyPayload> = {
  id: 'ai-weekly',
  section: 'ai-weekly',
  system: SYSTEM,
  buildUser: buildAiWeeklyUser,
  schema: WeeklyPayloadSchema,
  temperature: 0.5,
  maxTokens: 5000,
};

export default aiWeeklyPrompt;
