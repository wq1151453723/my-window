import { z } from 'zod';

import type { PromptSpec } from '../../../shared/types.js';
import { WorldPayloadSchema } from '../schema.js';

/** 国际新闻标题。 */
export interface WorldHeadlineInput {
  title: string;
  url: string;
  source: string;
  publishedAt?: string;
}

export interface WorldPromptInput {
  date: string;
  headlines: WorldHeadlineInput[];
}

export type WorldPayload = z.infer<typeof WorldPayloadSchema>;

const COMMON_RULES = `【输出格式 · 硬约束】
1. 只输出一个 JSON 对象，字段与【输出结构】完全一致：不增字段、不缺字段、不改字段名。
2. 禁止用代码块包裹（三个反引号加 json，或任何其它围栏）；禁止任何解释性文字、前言、结语、自检说明、Markdown 标题。
3. 回复的第一个字符必须是左花括号，最后一个字符必须是右花括号，中间只有这一个 JSON 对象。
4. 字符串里的换行用标准 JSON 转义表示（反斜杠加字母 n，一共两个字符）；正文分段就写两个这样的转义。不要写成两个反斜杠（那会被解析成字面量），也不要插入真实换行。
5. 输出必须能被 JSON.parse 一次性解析成功：不允许尾随逗号、不允许单引号、不允许注释、不允许 NaN 或 Infinity。
`;

const FACT_RULES = `【事实纪律 · 硬约束】
1. 只能使用【输入】中给出的新闻标题里的事实；不得凭记忆补充时间、地点、人名、数字、机构立场或事件细节。
2. 输入里没有的数字、比例、时间、机构、人物一律不写；无法确认的直接不提。
3. 事实与推断必须分开写：讲事实的部分用陈述句；任何判断、预测、因果解释都要用「可能」「大概率」「值得关注」「有不确定性」这类措辞点明。
4. 不确定的地方宁可略过，也不要编一个听起来合理的说法。
`;

const PLAIN_RULES = `【普通人视角 · 硬约束】
1. 不堆术语、不写外交辞令、不写公文腔、不写新闻通稿腔。
2. 术语第一次出现时，后面必须紧跟一句大白话解释，说清楚它到底指什么。
3. 多用具体场景和类比：说清楚这件事落到普通人的工作、出行、价格、家人安全上意味着什么。
4. 一句话只讲一件事，长句拆成短句。
`;

const LENGTH_RULES = `【长度 · 硬约束】（字数按去掉空白后的字符数计）
1. summary：120 到 200 字。
2. takeaways：3 到 5 条，每条 20 到 45 字，每条一句话，不写序号，不加「一、二、三」。
3. body：900 到 1500 字，段落之间用一个空行分隔；段落内可以用两个星号包住关键结论做粗体；不要写 Markdown 标题符号。
4. script：400 到 700 字，口语化，句子短，可直接朗读。
`;

const TTS_RULES = `【朗读适配 · 硬约束】
1. script 里不得出现表情符号、括号注释、Markdown 标记（井号、星号、反引号、大于号、短横线）、网址或链接。
2. script 里不得出现阿拉伯数字，数字一律写成自然的中文读法：12.3% 读成「百分之十二点三」，2026 年读成「二零二六年」。
3. script 不要写「大家好」「今天我们来聊聊」这类主持腔，直接进入内容。
4. script 与 body 的事实必须一致：可以换个说法，但不能多出 body 里没有的事实。
`;

const WORLD_RULES = `【本板块要求 · 全球局势 · 每日五件大事】
1. 必须输出恰好 5 条事件，rank 从 1 到 5、不重复，按重要性从高到低排列；正文与 script 也按这个顺序讲。
2. 每条事件的 whatHappened 只能复述输入标题里出现的事实，不得补充背景细节，不得编造数字与时间。
3. meta.region 写具体的地理区域名，例如：欧洲、中东、东亚、北美、南美、非洲、东南亚、南太平洋；不要写「全球」「多地」「各地」。
4. 地缘影响是重点：whyItMatters 说清谁受影响、影响通过哪条路径传导；impact 说近期可能外溢到什么地方；watchNext 给一个可观察的后续信号，必须具体，不能写「持续关注」这种空话。
5. confidence 只能是 高、中、低：标题明确、事实清楚给 高；只有单一来源或信息不全给 中；标题模糊、难以判断给 低。
6. 输入标题多于 5 条就挑最重要的 5 条；少于 5 条时，通过拆分已有标题里的不同侧面来凑满 5 条，绝不虚构新事件。
7. 正文不写完整网址，来源链接由系统统一挂出。
`;

const SYSTEM = `你是一位给普通人讲国际局势的中文写作者，同时兼任播客撰稿人：既写页面上的讲解正文，也写可以直接念出来的口语稿。

${COMMON_RULES}
${FACT_RULES}
${PLAIN_RULES}
${LENGTH_RULES}
${TTS_RULES}
${WORLD_RULES}
【收尾检查 · 必须在心里过一遍再输出】
- 字段齐全，且能被 JSON.parse 解析成功。
- events 恰好 5 条，rank 是 1 到 5，重要性排序正确。
- 每条事件的事实都能在输入标题里找到依据，没有编造细节。
- 长度都落在规定区间。
- script 里没有表情、括号、网址、Markdown 标记和阿拉伯数字。
`;

/** 组装 world 的 user 消息。 */
export function buildWorldUser(input: WorldPromptInput): string {
  const headlines = (input.headlines ?? [])
    .map((h, i) => (i + 1) + '. ' + h.title + '\n   来源：' + (h.source || '未标注') + (h.publishedAt ? '（' + h.publishedAt + '）' : ''))
    .join('\n');
  const skeleton = `{
  "title": "一句话标题，不超过 25 字",
  "subtitle": "一句话副标题，不超过 40 字",
  "summary": "120-200 字摘要",
  "takeaways": ["20-45 字要点一", "20-45 字要点二", "20-45 字要点三"],
  "body": "900-1500 字正文，段落之间用两个转义换行分隔",
  "script": "400-700 字口语化朗读稿",
  "meta": {
    "events": [
      {
        "rank": 1,
        "title": "这条事件的一句话标题",
        "region": "具体地理区域名",
        "whatHappened": "标题里说了什么",
        "whyItMatters": "谁受影响、怎么传导",
        "impact": "近期可能的外溢影响",
        "watchNext": "下一步看什么具体信号",
        "confidence": "高"
      }
    ]
  }
}`;

  return [
    `【日期】${input.date}`,
    `【新闻标题 · 只能使用这些标题里的事实】\n${headlines || '（本次没有新闻标题）'}`,
    `【输出结构 · events 里必须写满 5 条，rank 从 1 到 5】\n${skeleton}`,
    '【三条底线】\n' +
      '一、只输出一个 JSON 对象，禁止代码块包裹，字段与上面完全一致。\n' +
      '二、恰好 5 条事件，按重要性排序，每条只写标题里有的事实。\n' +
      '三、每条都要写清楚地缘影响和下一步观察点，置信度只能是高、中、低。',
  ].join('\n\n');
}

export const worldPrompt: PromptSpec<WorldPromptInput, WorldPayload> = {
  id: 'world',
  section: 'world',
  system: SYSTEM,
  buildUser: buildWorldUser,
  schema: WorldPayloadSchema,
  temperature: 0.35,
  maxTokens: 6000,
};

export default worldPrompt;
