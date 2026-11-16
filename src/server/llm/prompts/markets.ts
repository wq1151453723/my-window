import { z } from 'zod';

import type { PromptSpec } from '../../../shared/types.js';
import { MarketsPayloadSchema } from '../schema.js';

/** 行情报价（真实接口拿到，模型只负责解读）。 */
export interface MarketQuoteInput {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
}

/** 指数（只有涨跌幅，没有点位）。 */
export interface MarketIndexInput {
  symbol: string;
  name: string;
  changePct: number;
}

/** 财经新闻标题。 */
export interface MarketHeadlineInput {
  title: string;
  url: string;
  source: string;
  publishedAt?: string;
}

export interface MarketsPromptInput {
  date: string;
  quotes: MarketQuoteInput[];
  indices: MarketIndexInput[];
  headlines: MarketHeadlineInput[];
}

export type MarketsPayload = z.infer<typeof MarketsPayloadSchema>;

const COMMON_RULES = `【输出格式 · 硬约束】
1. 只输出一个 JSON 对象，字段与【输出结构】完全一致：不增字段、不缺字段、不改字段名。
2. 禁止用代码块包裹（三个反引号加 json，或任何其它围栏）；禁止任何解释性文字、前言、结语、自检说明、Markdown 标题。
3. 回复的第一个字符必须是左花括号，最后一个字符必须是右花括号，中间只有这一个 JSON 对象。
4. 字符串里的换行用标准 JSON 转义表示（反斜杠加字母 n，一共两个字符）；正文分段就写两个这样的转义。不要写成两个反斜杠（那会被解析成字面量），也不要插入真实换行。
5. 输出必须能被 JSON.parse 一次性解析成功：不允许尾随逗号、不允许单引号、不允许注释、不允许 NaN 或 Infinity。
`;

const FACT_RULES = `【事实纪律 · 硬约束】
1. 只能使用【输入】中给出的报价、涨跌幅和新闻标题；不得凭记忆补充价格、点位、财报数字、宏观数据、机构观点或事件细节。
2. 输入里没有的数字、比例、时间、机构、人物一律不写；无法确认的直接不提。
3. 事实与推断必须分开写：讲事实的部分用陈述句；任何判断、预测、因果解释都要用「可能」「大概率」「值得关注」「倾向于认为」「还存在不确定性」这类措辞点明。
4. 不确定的地方宁可略过，也不要编一个听起来合理的说法。
`;

const PLAIN_RULES = `【普通人视角 · 硬约束】
1. 不堆术语、不写研报腔、不写公文腔、不写新闻通稿腔。
2. 术语第一次出现时，后面必须紧跟一句大白话解释，说清楚它到底指什么。
3. 多用具体场景和类比：说清楚这次涨跌对普通人意味着什么，是房贷利率、消费价格，还是手里的基金账面。
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
2. script 里不得出现阿拉伯数字，数字一律写成自然的中文读法：12.3% 读成「百分之十二点三」，1.25 读成「一点二五」，2026 年读成「二零二六年」。
3. script 不要写「大家好」「今天我们来聊聊」这类主持腔，直接进入内容。
4. script 与 body 的事实必须一致：可以换个说法，但不能多出 body 里没有的事实。
`;

const MARKETS_RULES = `【本板块要求 · 全球与中国金融】
1. meta.quotes 必须与输入的报价逐字一致：条目数量、顺序、symbol、name、price、changePct 全部照抄，数字一位不改、不四舍五入、不补零、不改正负号、不增删条目。meta.indices 必须与输入的指数一致：条目数量、顺序、symbol、name、changePct 照抄，同样一位不改、不增删条目。
2. 所有解读只能基于输入给出的报价、涨跌幅和新闻标题；不得补充输入里没有的价格、点位、财报数字、宏观数据。
3. 重点是风险与不确定性：meta.riskPoints 至少两条，每条写清哪个变量还没定、出现什么情况会推翻当前判断。
4. 不给投资建议：不得出现「应该买入」「建议加仓」「该抄底」「可以重仓」这类操作指令，不预测具体点位和目标价，不推荐具体产品。
5. meta.marketMood 用一句话概括当天的整体氛围，不超过 30 字，客观描述，不夸张、不煽动。
6. meta.drivers 写 3 到 5 条，每条一句话，必须能在输入的报价、涨跌幅或标题里找到依据。
7. 正文里提到具体标的时，用输入里的 symbol 或 name；正文不写完整网址，来源链接由系统统一挂出。
`;

const SYSTEM = `你是一位给普通人讲市场盘面的中文写作者，同时兼任播客撰稿人：既写页面上的讲解正文，也写可以直接念出来的口语稿。

${COMMON_RULES}
${FACT_RULES}
${PLAIN_RULES}
${LENGTH_RULES}
${TTS_RULES}
${MARKETS_RULES}
【收尾检查 · 必须在心里过一遍再输出】
- 字段齐全，且能被 JSON.parse 解析成功。
- meta.quotes 与 meta.indices 和输入逐字对照过，数字一个没变。
- 没有出现任何买卖建议，没有出现输入之外的数字。
- 长度都落在规定区间。
- script 里没有表情、括号、网址、Markdown 标记和阿拉伯数字。
`;

/** 组装 markets 的 user 消息：原始数字以 JSON 原样给出，便于模型逐字照抄。 */
export function buildMarketsUser(input: MarketsPromptInput): string {
  const quotesJson = JSON.stringify(input.quotes ?? [], null, 2);
  // 指数只保留 schema 需要的三个字段：调用方可能把带 price 的报价数组直接当指数传进来。
  const indicesJson = JSON.stringify(
    (input.indices ?? []).map((x) => ({ symbol: x.symbol, name: x.name, changePct: x.changePct })),
    null,
    2,
  );
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
    "marketMood": "不超过 30 字的一句话市场情绪",
    "quotes": [粘贴上面【报价】里的对象，逐字照抄],
    "indices": [粘贴上面【指数】里的对象，逐字照抄],
    "drivers": ["驱动因素一", "驱动因素二", "驱动因素三"],
    "riskPoints": ["风险点一", "风险点二"]
  }
}`;

  return [
    `【日期】${input.date}`,
    `【报价 · 必须原样抄进 meta.quotes】\n${quotesJson}`,
    `【指数 · 必须原样抄进 meta.indices】\n${indicesJson}`,
    `【新闻标题 · 解读只能引用这些标题里的事实】\n${headlines || '（本次没有新闻标题）'}`,
    `【输出结构】\n${skeleton}`,
    '【三条底线】\n' +
      '一、只输出一个 JSON 对象，禁止代码块包裹，字段与上面完全一致。\n' +
      '二、报价与指数逐字照抄，数字一位不改、不取整、不补零。\n' +
      '三、不给任何买卖建议，只讲发生了什么、可能意味着什么、哪里还不确定。',
  ].join('\n\n');
}

export const marketsPrompt: PromptSpec<MarketsPromptInput, MarketsPayload> = {
  id: 'markets',
  section: 'markets',
  system: SYSTEM,
  buildUser: buildMarketsUser,
  schema: MarketsPayloadSchema,
  temperature: 0.35,
  maxTokens: 5000,
};

export default marketsPrompt;
