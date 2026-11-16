/**
 * AI 板块提示词自检脚本
 * 运行：npx tsx src/server/llm/prompts/_check-ai.ts
 *
 * 做四件事：
 *   1. 装配检查：用样例输入调用 ai-course / ai-weekly 的 buildUser，打印 system / user 长度与前 200 字；
 *   2. 提示词硬约束：断言两个提示词都写明「只输出一个 JSON 对象」「禁止代码块包裹」，以及各自的长度区间；
 *   3. 契约检查：用手写样例 JSON 走一遍 schema.parse，并核对长度、分段、朗读适配；
 *   4. 汇总：失败项列出并以非零码退出。
 *
 * 字段级断言按 zod 契约的字段清单动态生成：契约改了字段名，断言跟着改，
 * 不会出现「提示词要一套字段、契约要另一套字段」的错位。
 *
 * 全程不发起任何网络请求。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { CoursePayloadSchema, WeeklyPayloadSchema } from '../schema.js';
import { aiCoursePrompt, type AiCourseInput } from './ai-course.js';
import { aiWeeklyPrompt, type AiWeeklyInput } from './ai-weekly.js';

/* ------------------------------------------------------------------ */
/* 工具                                                                */
/* ------------------------------------------------------------------ */

/** 字数口径：去掉空白后的字符数（含中文标点）。 */
const countChars = (s: string): number => s.replace(/\s+/g, '').length;

const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F0FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
const MD_RE = /[#*\`>|]/;
const PAREN_RE = /[()（）]/;
const DIGIT_RE = /\d/;
const URL_RE = /https?:\/\/|www\./i;
const FENCE_RE = /```/;

const failures: string[] = [];
let passed = 0;

function ok(label: string): void {
  passed += 1;
  console.log('  [PASS] ' + label);
}

function fail(label: string, detail?: string): void {
  failures.push(label + (detail ? ' —— ' + detail : ''));
  console.log('  [FAIL] ' + label + (detail ? ' —— ' + detail : ''));
}

function expect(cond: boolean, label: string, detail?: string): void {
  if (cond) ok(label);
  else fail(label, detail);
}

function expectRange(label: string, value: number, min: number, max: number): void {
  expect(
    value >= min && value <= max,
    label + '（实际 ' + value + '，要求 ' + min + '-' + max + '）',
    value >= min && value <= max ? undefined : '越界',
  );
}

/**
 * 契约里的 meta 字段清单（动态，避免与 schema 各写一份）。
 * 数组元素若被 transform 包成管道类型，要拆到管道内侧的对象，否则字段清单会是空的。
 */
function objectShapeKeys(schema: any): string[] {
  if (!schema) return [];
  if (schema.shape) return Object.keys(schema.shape);
  const inner = schema._def?.in ?? schema._def?.innerType ?? schema._def?.schema;
  return inner ? objectShapeKeys(inner) : [];
}

const courseMetaShape = CoursePayloadSchema.shape.meta.shape as unknown as Record<string, unknown>;
const courseMetaKeys: string[] = Object.keys(courseMetaShape);
const weeklyMetaShape = WeeklyPayloadSchema.shape.meta.shape as unknown as Record<string, any>;
const weeklyMetaKeys: string[] = Object.keys(weeklyMetaShape);
const highlightKeys: string[] = objectShapeKeys(weeklyMetaShape['highlights']?.element);
const techItemKeys: string[] = objectShapeKeys(weeklyMetaShape['techList']?.element);
const TECH_EXPLAIN_CANDIDATES = ['explain', 'plainMeaning', 'meaning', 'description', 'plain'];
const techExplainKey = TECH_EXPLAIN_CANDIDATES.find((k) => techItemKeys.includes(k));
const techKeys: string[] = [
  ...(techItemKeys.includes('term') ? ['term'] : []),
  ...(techExplainKey ? [techExplainKey] : []),
];

/** 判断一个字段值算不算「写满了」。 */
function isFilled(v: unknown): boolean {
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'number') return Number.isFinite(v);
  return v !== undefined && v !== null;
}

/* ------------------------------------------------------------------ */
/* 样例输入                                                            */
/* ------------------------------------------------------------------ */

const aiCourseSampleInput: AiCourseInput = {
  lesson: {
    no: 5,
    stage: 'S1',
    stageTitle: '拆开一次调用',
    title: '采样与温度：同一句话为什么会变',
    goal: '搞清楚模型输出为什么会飘，以及温度这个参数到底在调什么。',
    anchor:
      '你写过这样的调用：给 chat/completions 传 temperature 和 top_p，然后拿到一段文本；同一个问题跑两次，答案不一样。',
    prerequisite: '知道模型是逐个片段往外吐的。',
    exercise: '同一个提示词用不同温度各跑五次，比较输出的差异。',
    keywords: ['采样', '温度', '概率分布', '贪心解码'],
  },
  date: '2026-11-05',
  latestContext: [
    {
      title: '某推理引擎开源了新的采样实现',
      url: 'https://example.com/ai/1',
      source: '技术周报',
      publishedAt: '2026-11-04',
    },
    {
      title: '社区讨论长对话里输出变慢与上下文截断的关系',
      url: 'https://example.com/ai/2',
      source: '开发者社区',
      publishedAt: '2026-11-03',
    },
  ],
};

const aiWeeklySampleInput: AiWeeklyInput = {
  weekKey: '2026-W45',
  period: '2026-11-02 ~ 2026-11-08',
  headlines: [
    {
      title: '某开源推理引擎发布新的批处理调度实现',
      url: 'https://example.com/ai/1',
      source: '技术媒体',
      publishedAt: '2026-11-05',
    },
    {
      title: '某模型团队说明其长上下文训练方式的变化',
      url: 'https://example.com/ai/2',
      source: '官方博客',
      publishedAt: '2026-11-04',
    },
    {
      title: '社区讨论结构化输出在多轮调用里的稳定性问题',
      url: 'https://example.com/ai/3',
      source: '开发者社区',
      publishedAt: '2026-11-03',
    },
  ],
  repos: [
    {
      fullName: 'example/inference-scheduler',
      url: 'https://github.com/example/inference-scheduler',
      description: 'A small scheduler for batched inference workloads.',
      stars: 4200,
      language: 'Rust',
    },
    {
      fullName: 'example/eval-harness',
      url: 'https://github.com/example/eval-harness',
      description: 'Run and compare prompt evaluations locally.',
      stars: 3100,
      language: 'TypeScript',
    },
  ],
};

/* ------------------------------------------------------------------ */
/* 样例 JSON（等价于模型应当返回的载荷）                              */
/* ------------------------------------------------------------------ */

const aiCourseSampleJson = {
  title: '同一句话为什么会变：模型是怎么挑下一个词的',
  subtitle: '从采样与温度讲到大模型输出不确定性的来源',
  summary:
    '同一个问题、同一个模型、同一套参数，问两次答案不一样，很多人第一反应是模型不稳定。更准确的说法是，模型在最后一步不是直接吐出答案，而是从一张「下一个词的概率表」里挑一个词，这一步叫采样，随机性就是这么来的。温度参数决定这张表被压得多尖：温度低，模型基本只走最可能的那条路，答案稳定但重复；温度高，冷门词也有机会被选中，答案发散也更容易跑偏。本讲把这条链路从概率表一路拆到你的调用参数。',
  takeaways: [
    '输出会飘不是故障，而是最后一步从概率表里挑词，这个动作叫采样。',
    '温度决定概率表被压得多尖：越低越稳，越高越发散也越容易跑偏。',
    '温度调到零通常等于取概率最高的词，所以同一输入每次结果都一样。',
    'top_p 是另一个旋钮，它砍掉长尾候选，只在一个小集合里抽词。',
  ],
  body: `先说现象。同一个问题、同一个模型、同一套参数，连着问两次，答案会不一样。有人觉得模型不稳定，其实更准确的说法是：模型在最后一步不是直接吐出答案，而是从一张概率表里挑词。挑的过程叫采样，采样引入了随机性，所以同样的输入可以得到不同的输出。这不是故障，是设计。

把这一步想成写文章。前面所有的计算，其实是在给「下一个词」排一个名次：哪个词最可能，哪个次之，哪个几乎不可能。最后一步不是照着第一名写，而是照着这张名次表，按某种规则抽一个出来。这个规则由参数控制，而最常被调的那个参数叫温度。

术语解释一下。词表就是模型能用的全部词，通常包含几万个到十几万个片段；模型不是按字往外写，而是按词表里的片段拼。概率分布指的就是这张「下一个词有多大概率」的表。采样指的是从这张表里按概率抽一个词出来。

常见的采样规则可以写成这样一段伪代码：先算出每个词的分数，减去温度乘以它的对数概率，取最大的若干个，再在这若干个里按概率抽一个。人话解释是，温度越大，对冷门词的惩罚越弱，它们被抽中的机会变大，输出就更发散；温度越小，分布被压得越尖，输出更稳定，但也更容易变得干巴巴。温度等于零时通常直接取概率最高的词，也就是常说的贪心解码，此时同一个输入每次都会给出一模一样的结果。

回到锚点场景。你写的是给 chat/completions 传 temperature 和 top_p，然后拿到文本。你当时填的那个数字，最终就落到上面这段采样规则里。温度填得低，模型基本只走最高概率的那条路，答案稳定、重复度高；温度填得高，模型更愿意冒险选次优的词，答案花样多，也更容易跑偏。top_p 是另一种控制方式：它按概率从高到低截断，只在一个很小的候选集合里抽。两种旋钮经常一起用，一个改分布的形状，一个改候选集合的大小。

本周动态里那条关于新采样实现的消息，可以放在这个框架里看：它改的是采样这一步的实现方式，而不是模型本身的能力。你调用的参数没变，接口也没变，但同样的参数现在可能给出略微不同的分布。这类改动通常不值得你改代码，但你应该知道它存在，因为当你发现两次输出不一致时，排查顺序里要多一项：先确认是采样随机性，还是上游真的换了实现。

需要说清楚边界。温度不是越大越好，也不是越小越稳，通常要按任务来定：做抽取、做分类、要格式稳定的任务，倾向于低温；要写多个版本、要创意发散，倾向于高温。另外，不同模型对同一个温度的敏感程度并不一样，所以别人的经验值不一定能直接搬过来，这一点只算经验判断，不是定论。还有一点：温度对不同任务的最优区间并不一样，同一个模型做抽取和做创意文案，合适的取值可能差挺多，这属于经验范围。

一句话收束：模型输出会飘，不是因为它记性差或者系统有故障，而是因为最后一步刻意留了随机性；温度和 top_p 就是你手里那两个旋钮，决定这场随机性要多大。`,
  script:
    '同一段代码跑两次，答案不一样，这是很多人第一次用大模型时的困惑。有人以为模型不稳定，其实不是。模型在吐出最后一个词之前，先给自己算了一张表：下一个词有哪些可能，每个可能占多大比例。最后一步不是照着第一名写，而是从这张表里按概率抽一个出来。这一步叫采样，随机性就是这么来的。抽的时候有一个旋钮可以调，叫温度。调低一点，模型基本只走最可能的那条路，答案就稳；调高一点，冷门词也有机会被选中，答案更发散，也更容易跑偏。温度调到零，通常就等于每次都取概率最高的那个词，所以同一个问题每次答案都一样。你上次写的那次调用里传的温度和 top_p，最终就是落在这个动作上。top_p 是另一个旋钮，它按概率从高到低把候选词砍掉一部分，只在小集合里抽。这周有个消息是关于新的采样实现，改的是这一步怎么抽，不是模型变强了，所以你的调用方式不用改，但你排查输出不一致时要多想一项：到底是采样随机，还是上游换了实现。还有一点要留意，采样带来的差异通常不是错误。判断质量好坏，要看多次输出里是不是都落在同一个结论上，而不是盯着某一次抽到了哪句话。',
  meta: {
    lessonNo: 5,
    stage: 'S1',
    stageTitle: '拆开一次调用',
    lessonTitle: '采样与温度：同一句话为什么会变',
    goal: '搞清楚模型输出为什么会飘，以及温度这个参数到底在调什么。',
    anchor: '温度与 top_p 这两个参数，在你调用 chat/completions 时改的是最后选词那一步的随机性大小。',
    prerequisite: '先要知道模型是逐个片段往外吐的，输出是一次次拼出来的。',
    exercise:
      '固定同一个提示词，只改温度，取零、零点五和一点五三档，每档跑五次，记录每档出现了几种不同的答案，以及有没有哪一次明显跑偏；五分钟内跑得完，看输出重复率就能确认温度有没有起作用。',
    keywords: ['采样', '温度', '概率分布', '贪心解码', 'top_p'],
    latestTieIn:
      '用了本周动态里的「某推理引擎开源了新的采样实现」这条：它改的是采样这一步的实现方式，不是模型能力，所以调用参数不用动，但排查输出不一致时要多考虑这一项。',
  },
};

const aiWeeklySampleJson = {
  title: '这周值得盯的两件事：调度和评测',
  subtitle: '推理引擎换了批处理方式，本地评测工具也补齐了',
  summary:
    '这一周 AI 基础设施层面有两件事值得看。一是推理引擎改了批处理的调度方式，影响的是同一台机器上能同时处理多少请求、以及每个请求要等多久。二是社区把本地评测工具补完整了，跑提示词评测不再需要自己拼一套流程。这两件事都不是模型能力上的突破，但都落在每天调 API 的人会遇到的成本与延迟上：先看调度，再看评测。',
  takeaways: [
    '推理引擎换了批处理调度，影响并发量和排队时间，不影响模型能力。',
    '本地评测工具补齐之后，提示词改动前后能自己跑一遍对比。',
    '本周的进展属于工程优化，不要当成技术突破来理解。',
    '对使用者来说，先量自己的延迟和成本，再决定要不要跟着换。',
  ],
  body: `先给这一周一个总判断：值得看的不是模型变强了，而是围绕模型的工程环节在变得更省事。这一周的两条消息，一条落在推理引擎怎么排队，一条落在评测怎么跑，都属于工程优化，不属于能力突破。

第一条是推理引擎换了批处理调度的实现。批处理调度的意思，是把同时到来的请求打包一起处理，而不是一个一个排队。这件事改的是吞吐和延迟的分配方式，不改模型本身的输出质量。对使用者来说，最直观的影响是高峰期更容易排上队，同一台机器能扛的并发量通常更高。至于提升幅度有多大，输入里没有给出可对照的数字，这里不下结论。

第二条是社区把本地评测工具补完整了。评测的意思，是拿一组固定的输入和期望结果，批量跑一遍看输出对不对。工具补齐之前，你要评估一次提示词改动，往往得自己拼一套脚本；补齐之后，跑一次评测变成一条命令。这件事的长期价值可能比第一件更大，因为它把「改完提示词心里没底」变成了一件可以量化的事。

再说仓库。这周进入视野的两个项目，一个是批处理调度方向的工具，一个是把评测流程跑起来的工具，方向和上面两条消息正好对上。但要提醒一句：星标涨得快不等于技术突破，开源项目变多也不等于行业在前进，它们只是说明有更多人在做同一件事。至于是不是解决了你的问题，还得看它能不能接进你现在的调用方式。

把这周的两件事连起来看，有个判断：对每天调 API 的人来说，现在更值得投入的往往不是再找一个更响亮的模型名，而是把自己的调用量、延迟和评测跑起来。量出来的数字，才知道自己该不该跟这次调度改动，或者该把自己的评测先搭起来。

再补一句关于这周仓库的判断。开源项目变多本身是个中性信号，它说明供给在变多，但不说明这条路已经被验证过。真正值得看的，是它有没有解决你此刻的具体麻烦：你的调用是长文本还是短问答，你的瓶颈是延迟还是成本，这两点决定了同一批仓库里哪个对你真正有意义。所以看仓库不要先看星标，先看自己的问题长什么样。

回到主线。这一周的共同点，是把模型的内部藏得更深了一层：调度决定它什么时候能开始算，评测决定它算出来的东西合不合格。对使用者来说，你不需要懂实现细节，但要知道这两件事现在都可以自己动手验证，而不是只能等厂商告诉你结果。

下周值得盯什么：一是这类调度实现有没有给出可对照的吞吐与延迟数据；二是评测工具能不能接进你现有的调用流程，而不是要你重写一遍。以上都是观察项，不是预测。`,
  script:
    '这周有一条总体判断：值得看的不是模型变强了，而是围绕模型的工程环节在变得更省事。这周有两条消息。第一条是推理引擎换了批处理调度。批处理调度就是把同时来的请求打包一起处理，不是一个一个排队。改的是吞吐和延迟怎么分，不改模型输出质量。影响很直接，高峰期更好排队，一台机器能扛的并发通常也更高。提升到底有多大，输入没给可对照的数字，这里不下结论。第二条是社区把本地评测工具补齐了。评测就是拿一组固定输入跑一遍看输出对不对。以前评估一次提示词改动要自己拼脚本，现在跑评测接近一条命令。这件事的长期价值可能更大，因为它把改完提示词心里没底，变成了可以量化的事。再看仓库。这周有两个项目，一个做批处理调度，一个跑评测流程，方向和上面两条消息正好对上。但星标涨得快不等于技术突破，开源项目变多也不等于行业在前进。下周值得盯两件事：这类调度实现会不会给出可对照的吞吐和延迟数据；评测工具能不能接进你现有的调用流程，而不是要你重写一遍。这些都是观察项，不是预测。',
  meta: {
    weekKey: '2026-W45',
    period: '2026-11-02 ~ 2026-11-08',
    highlights: [
      {
        title: '某开源推理引擎发布新的批处理调度实现',
        whatChanged: '推理引擎换了批处理调度的实现，请求打包处理的方式变了。',
        whyItMatters: '它改的是吞吐与延迟的分配方式，不改模型本身的输出质量。',
        impactOnYou:
          '高峰期排队会变短，同一台机器能扛的并发通常更高；但改动幅度输入没给数字，先量自己的延迟再决定要不要跟。',
        source: '技术媒体',
        url: 'https://example.com/ai/1',
      },
      {
        title: '社区讨论结构化输出在多轮调用里的稳定性问题',
        whatChanged: '社区讨论集中在多轮调用里结构化输出容易在某一轮崩掉，配套的评测工具因此被补齐。',
        whyItMatters: '评测把「输出到底对不对」从主观感觉变成可以量化的一件事。',
        impactOnYou:
          '以后改提示词可以先跑一遍自己的评测再上线，比凭感觉决定稳得多；接入前先确认它能不能读你现有的调用代码。',
        source: '开发者社区',
        url: 'https://example.com/ai/3',
      },
      {
        title: '某模型团队说明其长上下文训练方式的变化',
        whatChanged: '某模型团队说明了长上下文训练方式的变化。',
        whyItMatters: '长上下文的训练方式会影响模型在长输入上的表现，属于机制层面的变化。',
        impactOnYou:
          '如果你正在把长文档整篇塞进上下文，可以留意长输入场景的效果是否变化，但先别急着改切分策略，用自己的样本验一遍。',
        source: '官方博客',
        url: 'https://example.com/ai/2',
      },
    ],
    techList: [
      { term: '批处理调度', explain: '说白了就是把同时到来的请求打包一起算，别一个一个排队。', plainMeaning: '说白了就是把同时到来的请求打包一起算，别一个一个排队。' },
      { term: '连续批处理', explain: '说白了是算完一个请求就立刻接下一个，让显卡别空着。', plainMeaning: '说白了是算完一个请求就立刻接下一个，让显卡别空着。' },
      { term: '评测集', explain: '说白了是一批固定的输入加期望答案，用来判断输出还合不合格。', plainMeaning: '说白了是一批固定的输入加期望答案，用来判断输出还合不合格。' },
      { term: '吞吐', explain: '说白了是同一时间能处理掉多少个请求。', plainMeaning: '说白了是同一时间能处理掉多少个请求。' },
    ],
  },
};

/* ------------------------------------------------------------------ */
/* 通用载荷检查                                                        */
/* ------------------------------------------------------------------ */

function checkCommon(
  label: string,
  payload: any,
  bodyMin: number,
  bodyMax: number,
  scriptMin: number,
  scriptMax: number,
): void {
  expectRange(label + ' summary 字数', countChars(payload.summary), 120, 200);
  expect(
    Array.isArray(payload.takeaways) && payload.takeaways.length >= 3 && payload.takeaways.length <= 5,
    label + ' takeaways 条数为 3-5',
    '实际 ' + (payload.takeaways ? payload.takeaways.length : '非法'),
  );
  for (const t of payload.takeaways ?? []) {
    expectRange(label + ' takeaway 字数「' + t.slice(0, 12) + '…」', countChars(t), 20, 45);
  }
  expectRange(label + ' body 字数', countChars(payload.body), bodyMin, bodyMax);
  const paragraphs = payload.body.split(/\n{2,}/).filter((p: string) => p.trim().length > 0);
  expect(paragraphs.length >= 3, label + ' body 分段不少于 3 段', '实际 ' + paragraphs.length);
  expect(!FENCE_RE.test(payload.body), label + ' body 不含代码块围栏');
  expectRange(label + ' script 字数', countChars(payload.script), scriptMin, scriptMax);
  expect(!EMOJI_RE.test(payload.script), label + ' script 无表情符号');
  expect(!MD_RE.test(payload.script), label + ' script 无 Markdown 标记');
  expect(!PAREN_RE.test(payload.script), label + ' script 无括号注释');
  expect(!DIGIT_RE.test(payload.script), label + ' script 无阿拉伯数字');
  expect(!URL_RE.test(payload.script), label + ' script 无网址');
  expect(!FENCE_RE.test(payload.script), label + ' script 无代码块围栏');
}

/* ------------------------------------------------------------------ */
/* 1. 提示词装配                                                       */
/* ------------------------------------------------------------------ */

console.log('========================================================');
console.log(' 我的窗口 · AI 板块提示词自检（本地校验，无网络请求）');
console.log('========================================================');

const courseUser = aiCoursePrompt.buildUser(aiCourseSampleInput);
const weeklyUser = aiWeeklyPrompt.buildUser(aiWeeklySampleInput);

console.log('');
console.log('[1/2] ai-course —— 提示词装配');
console.log('  system 长度 : ' + aiCoursePrompt.system.length + ' 字符');
console.log('  user   长度 : ' + courseUser.length + ' 字符');
console.log('  --- system 前 200 字 ---');
console.log('  ' + aiCoursePrompt.system.slice(0, 200).split('\n').join('\n  '));
console.log('  --- user 前 200 字 ---');
console.log('  ' + courseUser.slice(0, 200).split('\n').join('\n  '));

console.log('');
console.log('[2/2] ai-weekly —— 提示词装配');
console.log('  system 长度 : ' + aiWeeklyPrompt.system.length + ' 字符');
console.log('  user   长度 : ' + weeklyUser.length + ' 字符');
console.log('  --- system 前 200 字 ---');
console.log('  ' + aiWeeklyPrompt.system.slice(0, 200).split('\n').join('\n  '));
console.log('  --- user 前 200 字 ---');
console.log('  ' + weeklyUser.slice(0, 200).split('\n').join('\n  '));

/* ------------------------------------------------------------------ */
/* 2. 提示词层面的硬约束                                               */
/* ------------------------------------------------------------------ */

console.log('');
console.log('--------------------------------------------------------');
console.log(' 提示词硬约束检查');
console.log('--------------------------------------------------------');

for (const prompt of [aiCoursePrompt, aiWeeklyPrompt]) {
  const user = prompt.id === 'ai-course' ? courseUser : weeklyUser;
  console.log('');
  console.log('[' + prompt.id + ']');
  expect(prompt.system.includes('只输出一个 JSON 对象'), prompt.id + ' system 含「只输出一个 JSON 对象」');
  expect(prompt.system.includes('禁止代码块包裹'), prompt.id + ' system 含「禁止代码块包裹」');
  expect(user.includes('只输出一个 JSON 对象'), prompt.id + ' user 含「只输出一个 JSON 对象」');
  expect(user.includes('禁止代码块包裹'), prompt.id + ' user 含「禁止代码块包裹」');
  expect(prompt.system.includes('120 到 200 字'), prompt.id + ' system 写明 summary 长度');
  expect(prompt.system.includes('20 到 45 字'), prompt.id + ' system 写明 takeaway 长度');
  expect(prompt.system.includes('阿拉伯数字'), prompt.id + ' system 写明朗读数字约束');
  expect(prompt.system.includes('术语'), prompt.id + ' system 写明术语须用大白话解释');
  expect(prompt.system.includes('事实'), prompt.id + ' system 写明事实纪律');
  expect(prompt.id === prompt.section, prompt.id + ' id / section 自洽');
  expect(prompt.temperature >= 0 && prompt.temperature <= 1, prompt.id + ' temperature 合法');
  expect(prompt.maxTokens >= 1024, prompt.id + ' maxTokens 足够');
}

console.log('');
console.log('[ai-course 专属]');
expect(aiCoursePrompt.system.includes('1100 到 1600 字'), 'ai-course system 写明 body 长度 1100-1600');
expect(aiCoursePrompt.system.includes('450 到 800 字'), 'ai-course system 写明 script 长度 450-800');
expect(aiCoursePrompt.system.includes('本周无直接关联，用常见工程场景举例'), 'ai-course system 写明无动态时的 meta.latestTieIn 写法');
expect(aiCoursePrompt.system.includes('怎么用网页版'), 'ai-course system 写明禁止讲读者已会的内容');
expect(aiCoursePrompt.system.includes('锚点'), 'ai-course system 写明锚点要求');
expect(aiCoursePrompt.system.includes('meta.exercise'), 'ai-course system 写明 meta.exercise 要求');
expect(courseUser.includes('【锚点场景】'), 'ai-course user 带上锚点场景');
expect(courseUser.includes('【本周动态】'), 'ai-course user 带上本周动态');

console.log('');
console.log('[ai-weekly 专属]');
expect(aiWeeklyPrompt.system.includes('900 到 1400 字'), 'ai-weekly system 写明 body 长度 900-1400');
expect(aiWeeklyPrompt.system.includes('400 到 700 字'), 'ai-weekly system 写明 script 长度 400-700');
expect(aiWeeklyPrompt.system.includes('whatChanged'), 'ai-weekly system 写明 highlights 分段结构');
expect(aiWeeklyPrompt.system.includes('impactOnYou'), 'ai-weekly system 写明 impactOnYou 要求');
expect(aiWeeklyPrompt.system.includes('说白了就是'), 'ai-weekly system 写明术语要翻译成人话');
expect(aiWeeklyPrompt.system.includes('技术突破'), 'ai-weekly system 写明不得把热度说成技术突破');
expect(weeklyUser.includes('【头条】'), 'ai-weekly user 带上头条');
expect(weeklyUser.includes('【仓库】'), 'ai-weekly user 带上仓库');

/* ------------------------------------------------------------------ */
/* 3. 样例 JSON 过 schema                                               */
/* ------------------------------------------------------------------ */

console.log('');
console.log('--------------------------------------------------------');
console.log(' 样例 JSON 契约检查（schema.parse）');
console.log('--------------------------------------------------------');
console.log('  ai-course meta 契约字段 : ' + courseMetaKeys.join('、'));
console.log('  ai-weekly meta 契约字段 : ' + weeklyMetaKeys.join('、'));
console.log('  highlight 条目字段     : ' + highlightKeys.join('、'));
console.log('  techList 条目字段      : ' + techKeys.join('、'));

/* 契约字段清单必须解出来了，否则提示词骨架会渲染成空对象。 */
expect(courseMetaKeys.length > 0, 'ai-course 契约 meta 字段清单解出');
expect(weeklyMetaKeys.length > 0, 'ai-weekly 契约 meta 字段清单解出');
expect(highlightKeys.length > 0, 'ai-weekly highlight 条目字段清单解出');
expect(techKeys.length > 0, 'ai-weekly techList 条目字段清单解出');

/* 提示词的【输出结构】必须把契约里的每个字段都点名，否则模型会漏字段。 */
for (const k of courseMetaKeys) {
  expect(courseUser.includes('"' + k + '"'), 'ai-course 输出结构点名 meta.' + k);
}
for (const k of weeklyMetaKeys) {
  expect(weeklyUser.includes('"' + k + '"'), 'ai-weekly 输出结构点名 meta.' + k);
}
for (const k of highlightKeys) {
  expect(weeklyUser.includes('"' + k + '"'), 'ai-weekly 输出结构点名 highlight.' + k);
}
for (const k of techKeys) {
  expect(weeklyUser.includes('"' + k + '"'), 'ai-weekly 输出结构点名 techList.' + k);
}

const samples: Array<{ id: string; prompt: any; json: unknown }> = [
  { id: 'ai-course', prompt: aiCoursePrompt, json: aiCourseSampleJson },
  { id: 'ai-weekly', prompt: aiWeeklyPrompt, json: aiWeeklySampleJson },
];

for (const s of samples) {
  console.log('');
  console.log('[' + s.id + ']');
  let payload: any;
  try {
    const raw = JSON.stringify(s.json);
    payload = s.prompt.schema.parse(JSON.parse(raw));
    ok(s.id + ' schema.parse 成功（JSON 往返一次）');
  } catch (err: any) {
    fail(s.id + ' schema.parse 失败', err?.issues ? JSON.stringify(err.issues) : String(err?.message ?? err));
    continue;
  }

  if (s.id === 'ai-course') {
    checkCommon(s.id, payload, 1100, 1600, 450, 800);
    for (const k of courseMetaKeys) {
      expect(isFilled(payload.meta[k]), 'ai-course meta.' + k + ' 非空');
    }
    if (courseMetaKeys.includes('lessonNo')) {
      expect(payload.meta.lessonNo === aiCourseSampleInput.lesson.no, 'ai-course meta.lessonNo 与输入一致');
    }
    if (courseMetaKeys.includes('stage')) {
      expect(payload.meta.stage === aiCourseSampleInput.lesson.stage, 'ai-course meta.stage 与输入一致');
    }
    if (courseMetaKeys.includes('stageTitle')) {
      expect(payload.meta.stageTitle === aiCourseSampleInput.lesson.stageTitle, 'ai-course meta.stageTitle 与输入一致');
    }
    if (courseMetaKeys.includes('lessonTitle')) {
      expect(payload.meta.lessonTitle === aiCourseSampleInput.lesson.title, 'ai-course meta.lessonTitle 与输入一致');
    }
    if (courseMetaKeys.includes('anchor')) {
      expect(payload.meta.anchor.includes('temperature') || payload.meta.anchor.includes('温度'), 'ai-course meta.anchor 挂在锚点场景上');
    }
    if (courseMetaKeys.includes('exercise')) {
      expect(payload.meta.exercise.length >= 30, 'ai-course meta.exercise 足够具体', '实际 ' + payload.meta.exercise.length);
      expect(payload.meta.exercise.includes('分钟'), 'ai-course meta.exercise 写明耗时上限');
    }
    if (courseMetaKeys.includes('latestTieIn')) {
      expect(
        payload.meta.latestTieIn.includes(aiCourseSampleInput.latestContext[0].title),
        'ai-course meta.latestTieIn 引用了本周动态中的具体条目',
      );
    }
    if (courseMetaKeys.includes('keywords')) {
      expect(payload.meta.keywords.length >= 3, 'ai-course meta.keywords 至少三个');
      expect(
        payload.meta.keywords.every((k: string) => payload.body.includes(k)),
        'ai-course meta.keywords 里的术语都在正文出现过',
      );
    }
  }

  if (s.id === 'ai-weekly') {
    checkCommon(s.id, payload, 900, 1400, 400, 700);
    for (const k of weeklyMetaKeys) {
      if (k === 'highlights' || k === 'techList') continue;
      expect(isFilled(payload.meta[k]), 'ai-weekly meta.' + k + ' 非空');
    }
    expect(
      payload.meta.highlights.length >= 3 && payload.meta.highlights.length <= 6,
      'ai-weekly meta.highlights 3-6 条',
      '实际 ' + payload.meta.highlights.length,
    );
    for (const h of payload.meta.highlights) {
      for (const k of highlightKeys) {
        if (k === 'source' || k === 'url') continue;
        expect(isFilled(h[k]), 'ai-weekly highlight.' + k + ' 非空');
      }
      expect(
        h.source === '' || aiWeeklySampleInput.headlines.some((x: any) => x.source === h.source),
        'ai-weekly highlight.source 要么留空要么能在输入里对上',
      );
      expect(
        h.url === '' || aiWeeklySampleInput.headlines.some((x: any) => x.url === h.url),
        'ai-weekly highlight.url 要么留空要么能在输入里对上',
      );
    }
    expect(
      payload.meta.techList.length >= 2 && payload.meta.techList.length <= 5,
      'ai-weekly meta.techList 2-5 条',
      '实际 ' + payload.meta.techList.length,
    );
    for (const t of payload.meta.techList) {
      for (const k of techKeys) {
        expect(isFilled(t[k]), 'ai-weekly techList.' + k + ' 非空');
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* 3.5 文档里的两个 JSON 样例也要能过契约                              */
/* ------------------------------------------------------------------ */

console.log('');
console.log('--------------------------------------------------------');
console.log(' docs/PROMPTS-AI.md 样例一致性检查');
console.log('--------------------------------------------------------');

const docPath = fileURLToPath(new URL('../../../../docs/PROMPTS-AI.md', import.meta.url));
let docText = '';
try {
  docText = readFileSync(docPath, 'utf8');
} catch (err: any) {
  fail('读取 docs/PROMPTS-AI.md 失败', String(err?.message ?? err));
}
const docBlocks = [...docText.matchAll(/```json\n([\s\S]*?)```/g)].map((m) => m[1]);
expect(docBlocks.length === 2, 'docs/PROMPTS-AI.md 里有两个 JSON 样例', '实际 ' + docBlocks.length);
for (const [i, block] of docBlocks.entries()) {
  const id = i === 0 ? 'ai-course' : 'ai-weekly';
  const prompt = i === 0 ? aiCoursePrompt : aiWeeklyPrompt;
  try {
    const docPayload = prompt.schema.parse(JSON.parse(block));
    ok('文档样例 ' + id + ' 过 schema.parse');
    checkCommon('文档样例 ' + id, docPayload, i === 0 ? 1100 : 900, i === 0 ? 1600 : 1400, i === 0 ? 450 : 400, i === 0 ? 800 : 700);
  } catch (err: any) {
    fail('文档样例 ' + id + ' 过 schema.parse', err?.issues ? JSON.stringify(err.issues) : String(err?.message ?? err));
  }
}

/* ------------------------------------------------------------------ */
/* 4. 汇总                                                             */
/* ------------------------------------------------------------------ */

console.log('');
console.log('--------------------------------------------------------');
console.log(' 汇总');
console.log('--------------------------------------------------------');
console.log('  通过断言 : ' + passed);
console.log('  失败断言 : ' + failures.length);

if (failures.length > 0) {
  console.log('');
  for (const f of failures) console.log('  [FAIL] ' + f);
  console.log('');
  console.log(' 结论：不通过');
  process.exit(1);
}

console.log('');
console.log(' 结论：全绿 —— ai-course / ai-weekly 装配、硬约束、schema.parse 全部通过');
process.exit(0);
