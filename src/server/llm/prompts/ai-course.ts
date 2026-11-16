import { z } from 'zod';

import type { PromptSpec } from '../../../shared/types.js';
import { CoursePayloadSchema } from '../schema.js';

/** ai-course 板块的输入：当天要讲的那一讲，加上本周抓到的真实动态。 */
export interface AiCourseInput {
  lesson: {
    no: number;
    stage: string;
    stageTitle: string;
    title: string;
    goal: string;
    anchor: string;
    prerequisite: string;
    exercise: string;
    keywords: string[];
  };
  date: string;
  latestContext: Array<{ title: string; url: string; source: string; publishedAt?: string; note?: string }>;
}

export type CoursePayload = z.infer<typeof CoursePayloadSchema>;

/**
 * meta 字段清单直接从 zod 契约里取，避免提示词与 schema 各写一份而对不上。
 * 契约新增字段时，这里与【输出结构】会同步变化。
 */
const courseMetaShape = CoursePayloadSchema.shape.meta.shape as unknown as Record<string, unknown>;
const courseMetaFields: string[] = Object.keys(courseMetaShape);

/** 每个字段该怎么写：给模型的填写说明。契约里没登记的字段走兜底说明。 */
const COURSE_FIELD_HINTS: Record<string, string> = {
  lessonNo: '本讲编号（数字，与输入一致）',
  stage: '阶段代号，与输入一致',
  stageTitle: '阶段名称，与输入一致',
  lessonTitle: '本讲标题，与输入一致',
  goal: '本讲要解决的问题，与输入一致',
  anchor: '一句话写清本讲机制在锚点场景的哪一步起作用',
  prerequisite: '一句话写清开讲前需要先知道什么',
  exercise: '十分钟内能做完、能自己验证的练习，写清步骤与验收方式',
  keywords: '本讲真正讲到的三到六个术语',
  latestTieIn: '写明用了本周哪一条动态以及它和本讲的关系；没有可用动态就写「本周无直接关联，用常见工程场景举例」',
};

/** 输出格式硬约束：与其它板块保持一致的「只出一个 JSON」纪律。 */
const COMMON_RULES = `【输出格式 · 硬约束】
1. 只输出一个 JSON 对象，字段与【输出结构】完全一致：不增字段、不缺字段、不改字段名。
2. 禁止代码块包裹（三个反引号加 json，或任何其它围栏）；禁止任何解释性文字、前言、结语、自检说明、Markdown 标题。
3. 回复的第一个字符必须是左花括号，最后一个字符必须是右花括号，中间只有这一个 JSON 对象。
4. 字符串里的换行用标准 JSON 转义表示（反斜杠加字母 n，一共两个字符）；正文分段就写两个这样的转义。不要写成两个反斜杠（那会被解析成字面量），也不要插入真实换行。
5. 输出必须能被 JSON.parse 一次性解析成功：不允许尾随逗号、不允许单引号、不允许注释、不允许 NaN 或 Infinity。
`;

/** 读者画像：会调 API 的工程师，缺的是底层原理，不是使用手册。 */
const READER_RULES = `【读者画像 · 硬约束】
1. 读者每天都在写代码、调大模型 API，知道怎么发请求、怎么拿返回值、怎么处理报错。
2. 禁止讲「怎么用网页版」「怎么写提示词」「怎么注册账号」这类他已经会的东西，也不要复述他天天在用的 API 参数名。
3. 全篇只回答一个问题：这件事在底层到底是怎么发生的。答案要落到「模型内部做了什么、为什么结果会这样、为什么会出错」。
4. 默认他懂编程、HTTP、JSON、异步这些工程常识，不用从头解释；但模型内部的机制默认他不懂。
`;

/** 讲法：先直觉后机制，术语与公式都必须翻译成人话。 */
const TEACH_RULES = `【讲法 · 硬约束】
1. 先讲大白话直觉，再讲技术细节：先把看到的现象说清楚，再拆开机制。
2. 术语第一次出现时，后面必须紧跟一句大白话解释它到底指什么；解释过之后可以再用这个术语。
3. 适度使用公式或伪代码，但公式或伪代码后面必须紧跟一句人话解释它意味着什么。
4. 每个机制都要落到「所以你会看到什么现象」，比如输出会飘、会忘事、变慢、变贵，或者某个参数开始起作用。
5. 不写论文腔、不写公文腔、不写新闻通稿腔；一句话只讲一件事，长句拆成短句。
`;

/** 锚点：把机制挂回读者自己写过的那段调用代码。 */
const ANCHOR_RULES = `【锚点 · 硬约束】
1. 必须有且只有一段专门讲「本讲这个机制在锚点场景里是怎么发生的」，放在锚点场景对照的位置。
2. 锚点场景就是读者自己写过的那段调用代码；要把机制对应到请求、参数、返回里的具体位置，让他能对上自己写过的代码。
3. 这一段是本讲的落点，不能写成「这很重要」这种空话。
`;

/** 本周动态：能挂就挂，挂不上就明说，不许编。 */
const LATEST_RULES = `【本周动态 · 硬约束】
1. 【本周动态】里给了条目时，必须至少挑一条做例子，说清楚这条动态说明了什么机制问题，并在 meta.latestTieIn 里写明用的是哪一条（标题与来源）以及它和本讲的关系。
2. 【本周动态】为空、或没有一条与本讲相关时，meta.latestTieIn 必须原样写「本周无直接关联，用常见工程场景举例」，正文改用一个常见的工程场景举例。
3. 不得把动态标题改写成输入里没有的事实，也不得顺着标题往外推演输入里没有的细节。
`;

/** 事实纪律：只许用输入里的东西，推断必须点明。 */
const FACT_RULES = `【事实纪律 · 硬约束】
1. 只能使用【输入】中给出的事实、标题与数字；不得凭记忆补充模型名、版本号、参数、价格、benchmark 数字、论文结论。
2. 除输入里出现过的模型名与版本号外，不要写具体的模型名和版本号；需要举例时用「某个指令模型」「当轮调用的模型」这类中性说法。
3. 事实与推断必须分开写：讲事实的部分用陈述句；任何判断、因果解释、经验规律都要用「通常」「大致」「一般来说」「值得注意的是」「取决于」这类措辞点明。
4. 不确定的地方宁可略过，也不要编一个听起来合理的说法；确实拿不准就直说不确定。
`;

/** 长度：原理课要讲透，允许比其它板块长。 */
const LENGTH_RULES = `【长度 · 硬约束】（字数按去掉空白后的字符数计）
1. summary：120 到 200 字。
2. takeaways：3 到 5 条，每条 20 到 45 字，每条一句话，不写序号，不加「一、二、三」。
3. body：1100 到 1600 字，段落之间用一个空行分隔；段落内可以用两个星号包住关键结论做粗体；不要写 Markdown 标题符号。
4. script：450 到 800 字，口语化，句子短，可直接朗读。
`;

/** 朗读适配：script 要能直接念出来。 */
const TTS_RULES = `【朗读适配 · 硬约束】
1. script 里不得出现表情符号、括号注释、Markdown 标记（井号、星号、反引号、大于号、短横线）、网址或链接。
2. script 里不得出现阿拉伯数字，数字一律写成自然的中文读法：12.3% 读成「百分之十二点三」，1200 个 token 读成「一千二百个 token」，2026 年读成「二零二六年」。
3. script 不要写「大家好」「今天我们来聊聊」这类主持腔，直接进入内容。
4. script 与 body 的事实必须一致：可以换个说法，但不能多出 body 里没有的事实。
`;

/** 本板块专属要求。 */
const COURSE_RULES = `【本板块要求 · AI 学习日课】
1. 一讲只讲一个机制，全篇围绕本讲标题与目标展开，不要罗列成目录。
2. body 的推进顺序：现象 → 大白话直觉 → 底层机制 → 术语解释 → 公式或伪代码加一句人话 → 锚点场景对照 → 与本周动态的关联 → 边界与不确定性 → 一句收束。
3. meta 的字段是：${courseMetaFields.join('、')}。每一个都要写满，不能留空；与输入一致的字段照抄输入，其余按【输出结构】里的说明写。
4. meta.anchor 用一句话写清「本讲机制在锚点场景的哪一步起作用」，必须与输入的锚点对得上。
5. meta.exercise 要把输入的练习意图落到实处，可以细化步骤，但必须同时满足三条：十分钟内能做完、结果自己能验证、验证方式写得清楚（看什么输出、什么数值、什么现象算通过）。
6. meta.latestTieIn 按【本周动态 · 硬约束】写。
7. meta.keywords 写三到六个本讲真正讲到的术语，每个术语都要在正文里出现过。
8. 结尾留一句「现在你能解释什么」的收束，不写营销话术。
`;

const SYSTEM = `你是一位给「会写代码调大模型 API、但不懂底层原理」的工程师讲原理的中文技术作者，同时兼任播客撰稿人：既写页面上的讲解正文，也写能直接念出来的口语稿。

${COMMON_RULES}

${READER_RULES}

${TEACH_RULES}

${ANCHOR_RULES}

${LATEST_RULES}

${FACT_RULES}

${LENGTH_RULES}

${TTS_RULES}

${COURSE_RULES}

【收尾检查 · 必须在心里过一遍再输出】
- 字段齐全，且能被 JSON.parse 解析成功。
- 全篇没有出现「怎么用网页版」「怎么写提示词」这类读者已经会的内容。
- 术语第一次出现都有大白话解释，公式或伪代码后面都紧跟一句人话解释。
- 有一段专门把机制挂到锚点场景上。
- 只用了输入里的事实，没有编造模型名、版本号、参数、价格和论文结论。
- meta.exercise 十分钟内能做完、能自己验证。
- 长度都落在规定区间。
- script 里没有表情、括号、网址、Markdown 标记和阿拉伯数字。
`;

/** 按契约里的字段清单生成 meta 的输出骨架。 */
function buildMetaSkeleton(fields: string[]): string {
  return fields
    .map((f) => {
      const hint = COURSE_FIELD_HINTS[f] ?? '按输入填写，不要编造';
      if (f === 'keywords') return '    "' + f + '": ["本讲术语一", "本讲术语二", "本讲术语三"]';
      return '    "' + f + '": "' + hint + '"';
    })
    .join(',\n');
}

/** 组装 ai-course 的 user 消息：把本讲的骨架摆到台面上，再给出输出结构。 */
export function buildAiCourseUser(input: AiCourseInput): string {
  const lesson = input.lesson;
  const contextLines = (input.latestContext ?? []).map((item, i) => {
    const when = item.publishedAt ? '（' + item.publishedAt.slice(0, 10) + '）' : '';
    const note = item.note ? '｜' + item.note : '';
    return i + 1 + '. ' + item.title + ' —— 来源：' + item.source + when + note;
  });
  const contextBlock =
    contextLines.length > 0
      ? contextLines.join('\n')
      : '（本周没有可用动态：正文改用常见工程场景举例，meta.latestTieIn 原样写「本周无直接关联，用常见工程场景举例」）';
  const keywords = (lesson.keywords ?? []).join('、') || '（无）';
  const skeleton = `{
  "title": "一句话标题，不超过 25 字",
  "subtitle": "一句话副标题，不超过 40 字",
  "summary": "120-200 字摘要",
  "takeaways": ["20-45 字要点一", "20-45 字要点二", "20-45 字要点三"],
  "body": "1100-1600 字正文，段落之间用两个转义换行分隔",
  "script": "450-800 字口语化朗读稿",
  "meta": {
${buildMetaSkeleton(courseMetaFields)}
  }
}`;

  return [
    '【课程进度】第 ' + lesson.no + ' 讲 · 阶段 ' + lesson.stage + ' ' + lesson.stageTitle,
    '【本讲标题】' + lesson.title,
    '【本讲目标】' + lesson.goal,
    '【锚点场景】' + lesson.anchor,
    '【先修】' + lesson.prerequisite,
    '【本讲练习】' + lesson.exercise,
    '【关键词】' + keywords,
    '【日期】' + input.date,
    '【本周动态】\n' + contextBlock,
    '【输出结构】\n' + skeleton,
    '【三条底线】\n' +
      '一、只输出一个 JSON 对象，禁止代码块包裹，字段与上面完全一致。\n' +
      '二、全篇只讲本讲这一个机制，术语第一次出现都要紧跟一句大白话解释。\n' +
      '三、事实只用输入里给的；推断要用「通常」「大致」「值得注意的是」这类措辞点明。',
  ].join('\n\n');
}

export const aiCoursePrompt: PromptSpec<AiCourseInput, CoursePayload> = {
  id: 'ai-course',
  section: 'ai-course',
  system: SYSTEM,
  buildUser: buildAiCourseUser,
  schema: CoursePayloadSchema,
  temperature: 0.6,
  maxTokens: 6000,
};

export default aiCoursePrompt;
