/**
 * 提示词自检脚本
 * 运行：npx tsx src/server/llm/prompts/_check.ts
 *
 * 做两件事：
 *   1. 装配检查：用样例输入调用四个板块的 buildUser，打印 system / user 长度与前 200 字；
 *   2. 契约检查：用手写样例 JSON 走一遍 schema.parse，并核对长度、朗读适配、字段一致性。
 * 全程不发起任何网络请求。
 */
import type { SectionId } from '../../../shared/types.js';

import { PROMPTS, aiToolsPrompt, booksPrompt, marketsPrompt, worldPrompt } from './index.js';

/* ------------------------------------------------------------------ */
/* 工具                                                                */
/* ------------------------------------------------------------------ */

/** 字数口径：去掉空白后的字符数（含中文标点）。 */
const countChars = (s: string): number => s.replace(/\s+/g, '').length;

const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F0FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
const MD_RE = /[#*`>|]/;
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

/* ------------------------------------------------------------------ */
/* 样例输入                                                            */
/* ------------------------------------------------------------------ */

const booksSampleInput = {
  discipline: '社会学',
  date: '2026-11-05',
  seedIdeas: ['《乡土中国》', '差序格局', '社会学的想象力'],
};

const aiToolsSampleInput = {
  repo: {
    fullName: 'ollama/ollama',
    url: 'https://github.com/ollama/ollama',
    description: 'Run large language models locally with a single command.',
    stars: 144000,
    language: 'Go',
    topics: ['llm', 'local-llm', 'llama', 'ai'],
    readmeExcerpt:
      'Ollama lets you run LLMs locally. Quickstart: download Ollama, then run: ollama run llama3.2. ' +
      'Ollama provides a simple REST API for running and managing models. License: MIT.',
  },
};

const marketsSampleInput = {
  date: '2026-11-05',
  quotes: [
    { symbol: 'AAPL', name: '苹果', price: 231.5, changePct: 1.23 },
    { symbol: 'NVDA', name: '英伟达', price: 178.4, changePct: -2.05 },
    { symbol: '600519.SH', name: '贵州茅台', price: 1486, changePct: 0.62 },
  ],
  indices: [
    { symbol: '^GSPC', name: '标普500', changePct: 0.35 },
    { symbol: '000001.SH', name: '上证指数', changePct: -0.18 },
    { symbol: '^HSI', name: '恒生指数', changePct: 0.9 },
  ],
  headlines: [
    {
      title: '美联储官员表示通胀回落路径仍有反复',
      url: 'https://example.com/news/1',
      source: '路透社',
      publishedAt: '2026-11-05T09:00:00Z',
    },
    {
      title: '芯片板块承压，费城半导体指数走弱',
      url: 'https://example.com/news/2',
      source: '彭博社',
      publishedAt: '2026-11-05T08:30:00Z',
    },
    {
      title: '中国公布最新物价数据，居民消费价格同比上涨',
      url: 'https://example.com/news/3',
      source: '新华社',
      publishedAt: '2026-11-05T10:00:00Z',
    },
  ],
};

const worldSampleInput = {
  date: '2026-11-05',
  headlines: [
    { title: '欧盟与成员国就下一阶段能源价格补贴方案达成初步一致', url: 'https://example.com/w/1', source: '欧洲新闻台' },
    { title: '中东地区停火谈判进入新一轮磋商', url: 'https://example.com/w/2', source: 'BBC中文' },
    { title: '美国宣布调整部分出口管制清单', url: 'https://example.com/w/3', source: '彭博社' },
    { title: '南美主要产油国宣布延长减产协议', url: 'https://example.com/w/4', source: '路透社' },
    { title: '东亚主要经济体就跨境支付结算试点扩大达成框架', url: 'https://example.com/w/5', source: '路透社' },
    { title: '联合国报告称主要粮食出口国粮价连续三个月回落', url: 'https://example.com/w/6', source: '联合国新闻' },
  ],
};

/* ------------------------------------------------------------------ */
/* 样例 JSON（等价于模型应当返回的载荷）                              */
/* ------------------------------------------------------------------ */

const booksSampleJson = {
  title: '差序格局：人情网是怎么一圈圈长出来的',
  subtitle: '从《乡土中国》读懂关系远近与办事分寸',
  summary:
    '《乡土中国》用一个词讲透了中国人情关系的底层结构：差序格局。人的关系不是并排平铺的，而是一圈圈往外推的同心圆，亲疏由距离决定。这解释了很多说不清的别扭，为什么对家人和对外人可以完全是两套标准，为什么熟人社会里靠人情也能把事情办成。读完这篇，你至少能看懂自己身上那些不好意思明说的分寸。',
  takeaways: [
    '差序格局像水波纹，以自己为中心，亲疏由距离决定，而不是人人平等并列。',
    '西洋社会像一捆柴，靠规则连接，乡土社会像水波纹，靠人情与关系运转。',
    '团体格局讲究公事公办，差序格局讲究分寸，这套分寸今天依然在起作用。',
  ],
  body:
    '《乡土中国》要回答的问题其实很朴素：中国人的人际关系，为什么会长成今天这个样子？费孝通给出的答案叫差序格局，也就是以自己为中心、一圈圈往外推的关系结构。\n\n' +
    '把它翻译成大白话：越靠近自己的一圈关系越亲，越往外越远。家里人的标准和外人的标准可以是完全不同的两套，对内讲感情，对外讲规矩。按规矩办叫合格，按人情办叫懂事，这两套标准常常同时住在同一个人身上。\n\n' +
    '费孝通拿西洋社会做对照。西洋社会像一捆柴，每根木柴彼此平行，靠法律和契约捆在一起；中国社会像一张网，网心是自己，拉出去的每根线都牵着人情。所以西洋人习惯公事公办，中国人习惯讲分寸。\n\n' +
    '举一个能对号入座的例子：同样一件小事，熟人来做叫照顾，陌生人来做叫不懂事；同样一句话，对上级说是请示，对同事说是商量。差别不在事情本身，而在于你跟对方之间隔了几圈。\n\n' +
    '费孝通还提到，差序格局要求人克己，也就是压住一部分私人情绪，去完成对别人的义务。这听上去委屈，其实是一种维持圈子的办法。今天职场里那些说不清的内耗、那些看不懂的人情往来，在这本书里都能找到影子。\n\n' +
    '那这本书对普通人到底有什么用？第一，它能解释自己为什么在某些场合心里别扭；第二，它给了一个判断标准，这件事该按人情办还是按规矩办；第三，它提醒你在经营自己的小圈子时，哪些做法是长期有效的，哪些只是消耗。\n\n' +
    '还有一个提醒：差序格局并不是一句批评。费孝通写这本书，是为了说明这套结构能应付乡土社会的需要；真正的问题出在规则已经变了，旧的运转方式却还在硬撑。看懂这一点，才算读懂了这本书的分寸。\n\n' +
    '把差序格局用到自己身上，还有两点要留神。第一点是别把它当成万能借口，很多人把不公待遇解释成关系远近，其实是给自己找台阶下。第二点是它也有正面作用，理解了差序，才知道什么时候开口通融会被接受，什么时候会被看轻。\n\n' +
    '顺着这条线再往里走一步，费孝通还比较了团体格局和差序格局。前者像一捆柴，人人按同一套规矩相处；后者像水波纹，中心的人说了算。两种模式各有代价，团体格局显得生分，差序格局显得偏心。理解这一点，就明白为什么很多人一边抱怨不公平，一边又在关键时刻指望有人给自己通融。\n\n' +
    '读书的方法上有个小窍门：每读到一个概念，先问一句它和我见过的什么情况对得上。对上号的才算真懂，对不上的先记下来，等生活里再遇到一次，往往就通了。',
  script:
    '今天聊一本书，费孝通的《乡土中国》。这本书只讲一个词，叫差序格局。什么意思呢？想象你往水里扔一颗石子，水波一圈一圈往外荡。越靠里离你越近，越往外离你越远，这就是差序格局。你的关系网也是这样长的，家里人最近，朋友同事次之，陌生人最远。同样一件事，找熟人办叫照顾，找生人办叫不懂事。费孝通还拿西洋社会比，西洋像一捆柴，每根柴平行，靠规矩捆着；中国像一张网，网心是自己，靠人情牵着。所以中国人讲分寸，西洋人讲公事公办。读完这本书你会多一把尺子，判断一件事该讲情分还是讲规矩，也更容易看懂自己在职场和家事里的那些别扭。它没有教你怎么圆滑，只是让你明白，很多让人难受的场面，其实不是针对你，而是这套结构在起作用。费孝通写这本书，其实带着一个问题：这套关系模式在规则已经变了的社会里还能不能撑住。他的判断是，规则变了，旧方式还在硬撑，问题就出来了。这也是这本书今天更值得读的原因，很多人的别扭感，正是因为老方式和新规则撞在了一起。换句话说，看懂关系怎么运转，才谈得上在关系里做得更稳。',
  meta: {
    discipline: '社会学',
    book: '乡土中国',
    author: '费孝通',
    coreIdea: '差序格局：以自己为中心、亲疏由距离决定的一圈圈关系结构。',
    whyItMatters: '它决定了你该按人情办还是按规矩办，也解释了职场与家事里那些说不清的别扭。',
  },
};

const aiToolsSampleJson = {
  title: 'Ollama：把本地跑大模型变成一条命令',
  subtitle: '不上传数据也能在自己电脑上用大模型',
  summary:
    '很多人想用上大模型，卡在两个门槛：数据不敢往云端传，以及不会配环境。Ollama 把这件事压到一条命令：装好之后运行 ollama run，就能拉起一个开源模型在本地对话。它用 Go 写成，安装包覆盖主流系统，本地还开了一个接口能接进自己的程序。对不想折腾显卡、也不想按调用付费的人来说，这是一条现实的入门路线。',
  takeaways: [
    'Ollama 把本地跑大模型压缩成一条命令，普通用户不用自己配环境和显卡。',
    '它同时给命令行和本地接口，既能自己聊天，也能接进自己的程序里。',
    '隐私敏感和不想按调用付费，是它最实在的两个使用理由。',
  ],
  body:
    '先说清楚 Ollama 是什么。它不是一个新的模型，而是一个跑模型的工具。你告诉它想要哪个模型，它负责把模型文件下载到本地、配好运行环境，再给你一个对话入口。所以你用到的还是那些开源模型，只是外面多了一层好用的包装。\n\n' +
    '上手路径很短。装好安装包，打开终端，敲一条 ollama run 加模型名，模型下载完就能直接对话。下载时间取决于模型大小和网络，第一次会慢一些，之后就在本地跑。这对普通人意味着，你不用先学一整套 Python 环境，也不用自己调显卡参数。\n\n' +
    '第二个好处是可以接进自己的程序。Ollama 在本机开一个接口，你的脚本或者小工具可以直接调它。这样一来，原来必须付费调用云端接口的活儿，比如给一堆文档做摘要、把表格里的问题列出来，可能就能改成在本机跑。\n\n' +
    '它适合谁？适合手上有隐私敏感材料的人，比如公司内部文档、还没公开的方案、客户资料，不想传到第三方服务器上；也适合愿意一次性花点时间折腾、之后长期本地使用的人。不适合追求最强效果的场景，也不适合完全不想碰命令行的人。\n\n' +
    '要注意的是，它的强项是本地可用和上手简单，不是效果第一。同一道题，本地小模型和最大的云端模型之间通常还有差距。另外模型要占显存和硬盘，实际能跑多大的模型取决于机器配置，README 里对安装和硬件要求有说明。\n\n' +
    '至于为什么现在值得看，输入能给的依据是它的星标数量相当高，而且仓库描述就围绕在本地运行大模型这件事。真正让这类工具好用的原因，可能还包括开源模型本身变小了、量化之后普通电脑也跑得动，但这一点输入没有给出更多证据，只能算推测。\n\n' +
    '聊到本地模型，还有一个常被忽略的点：它天然更省。调用云端接口按次或者按量计费，跑得越勤花得越多；本地模型下载一次之后，成本基本只剩电费和硬盘。对经常要处理文档的人来说，这笔账算下来差别很明显。当然，偶尔问几个问题的话，用现成的网页版可能更划算，选工具还是看自己的使用节奏。\n\n' +
    '所以判断要不要用它，可以先问自己三个问题：数据能不能外传、任务频次高不高、机器配置撑不撑得住。三个里有一个答不上来，就先别急着折腾。\n\n' +
    '一句话建议：如果你一直想试大模型却卡在环境和费用上，先拿它跑一个手头真实的小任务，跑通了再说下一步。工具好不好用，看的不是介绍，而是你有没有真的用它把一件小事做完。',
  script:
    '这周看一个能真跑起来的开源工具，Ollama。它的 GitHub 星标非常多，用 Go 写成。先说它是干什么的。Ollama 本身不是模型，它更像一个跑模型的管家。你告诉它想要哪个模型，它把模型下载下来、把环境配好，然后给你一个对话框。你用的还是那些开源模型，只是包装得更好用。怎么跑起来？装好安装包，打开终端，敲一条 ollama run 加模型名，第一次下载完就能直接聊。它适合两类人，一类是有不能外传的文档资料，想留在自己电脑上；另一类是愿意折腾一次、以后长期本地用的人。它不太适合追求最强效果的人，也不适合完全不想碰命令行的人。但只要你手上有一件真实的小任务，比如把一份长文档总结成几条要点，试着跑一遍，你会发现很多原来觉得遥远的说法，就落在自己桌面上。还有一个常被忽略的好处是成本。调用云端接口按次计费，跑得越勤花得越多；本地模型下载一次之后，基本只剩电费和硬盘开销。对经常要处理文档的人，这笔账很清楚。当然偶尔问几个问题的话，免费的网页版可能更划算。工具好不好，看的是它能不能接进你的日常，而不是它有多酷。',
  meta: {
    repoFullName: 'ollama/ollama',
    repoUrl: 'https://github.com/ollama/ollama',
    stars: 144000,
    language: 'Go',
    whatItIs: '一个跑模型的工具，负责下载模型、配好环境并给出对话入口。',
    whoIsItFor: '适合有不能外传资料、愿意折腾一次的人；不适合追求最强效果和完全不碰命令行的人。',
    howToStart: '装好安装包，打开终端运行 ollama run 加模型名，模型下载完即可对话。',
    whyNow: '输入显示其星标数量很高且定位清晰；至于其它流行原因，输入没有给出证据。',
    license: 'MIT',
  },
};

const marketsSampleJson = {
  title: '指数没怎么动，分化全在个股',
  subtitle: '芯片方向承压，利率预期仍是关键变量',
  summary:
    '今天是涨跌互现的一天。标普五百涨了百分之零点三五，苹果涨了百分之一点二三，英伟达跌了百分之二点零五，芯片方向明显承压；上证指数微跌，恒生指数相对更强。新闻面最值得留意的是美联储官员关于通胀回落路径仍有反复的表态，这仍是牵动利率方向的关键变量。对普通人来说，这种分化更多影响手里的持仓体感，而不是需要立刻做什么决定。',
  takeaways: [
    '今天是涨跌互现的盘面，指数变化不大，个股之间的分化更明显。',
    '芯片方向承压是今天最突出的线索，直接反映在英伟达的跌幅上。',
    '美联储对通胀路径的表态仍是最关键的外部变量，值得继续盯。',
    '对普通投资者来说，这类结构性分化提示的是风险，而不是操作指令。',
  ],
  body:
    '先看今天的盘面。标普五百涨了百分之零点三五，上证指数跌了百分之零点一八，恒生指数涨了百分之零点九，指数层面并没有大的方向，更多是个股之间的分化。真正值得讲的是个股。\n\n' +
    '苹果涨了百分之一点二三，收在二百三十一点五美元；英伟达跌了百分之二点零五，收在一百七十八点四美元；贵州茅台涨了百分之零点六二，收在一千四百八十六元。这三只票在同一天里的方向完全不同。\n\n' +
    '分化背后有一条线索：芯片方向承压。新闻里提到芯片板块走弱，费城半导体指数出现回落。英伟达当天的跌幅超过百分之二，和这条线索是吻合的。这里能确认的是价格和板块表现，至于下跌具体由哪一条消息触发，输入没有给出更多证据，可能更多是市场情绪和整体风险偏好的变化。\n\n' +
    '另一条线索来自利率预期。新闻里美联储官员表示通胀回落的路径仍有反复，这句话对利率预期的影响不小，利率预期变了，估值的分母就变了，很多资产的价格会跟着动。这一步属于推断，输入里没有更多数据可以确认。\n\n' +
    '国内这边，新闻提到最新物价数据公布，居民消费价格同比上涨。物价温和回升通常意味着实际需求没有明显走弱，这一点对消费类资产算正面信号，但单月数据往往噪声较大，可能还需要后续几个月才能确认趋势。\n\n' +
    '风险点得说清楚。第一，美联储下一步表态仍可能反复，利率预期随时可能再变一次，今天的涨跌幅不代表趋势。第二，芯片方向的承压如果延续，相关行业之外的公司也可能跟着调整。第三，国内物价数据的单点表现容易被过度解读。\n\n' +
    '把三个指数放在一起看，可以留意一个细节：美股小幅收涨，港股相对更强，A 股微跌。这个组合更像是各自在消化自己的事情，而不是全球同向。真正需要警惕的是把单日表现当成趋势，一天涨了不说明趋势向上，一天跌了也不说明趋势反转。\n\n' +
    '还有一个容易忽略的角度是汇率和资金成本，这些在输入里没有给出，所以今天不做判断，但它们通常会先于基本面变化影响大盘的方向。下次看盘时如果方向判断和理由对不上，多半是有一个中间变量没被算进去。\n\n' +
    '回到普通人身上：这类分化真正的影响，往往是情绪而不是现金流。持仓的人体感会不一样，但没有急用的资金时，短期内其实不需要因为一天的涨跌改变什么。这句话不是建议，只是提醒自己别把新闻和动作绑得太紧。\n\n' +
    '最后提醒一句：以上只是对当天已有数据的解读，不构成任何买卖建议，也没有对点位做预测。市场里最难受的时刻往往是数据最含糊的时候，看不懂的时候少动一点，通常比急着找答案更稳妥。',
  script:
    '今天的盘面先给你一个整体感觉：涨跌互现，指数没怎么动，分化全在个股。标普五百涨了百分之零点三五，上证指数小跌，恒生指数涨了百分之零点九。真正有故事的是苹果和英伟达，苹果涨了百分之一点二三，英伟达跌了百分之二点零五，方向完全相反。一条线索是新闻里提到的芯片板块走弱，英伟达正好在这一块。另一条线索是美联储官员说通胀回落的路径仍有反复，这句话可能影响了市场的利率预期。两个风险要说清楚。一是美联储的表态可能反复，今天的涨跌不构成趋势；二是芯片方向如果继续承压，其它相关公司大概率也会跟着调整。这些只是对今天已有数据的解读，不是买卖建议，也没有对点位做预测。数据最含糊的时候，少动一点通常更稳妥。也有两点值得提醒。一是不要把单日表现当成趋势，一天涨不说明趋势向上，一天跌也不说明趋势反转。二是这类分化更多影响的是情绪，不是现金流，只要没有急用的钱，短期其实不需要因为一天的涨跌做决定。至于汇率和资金成本这些中间变量，这次没有数据，就不硬讲。',
  meta: {
    marketMood: '指数平淡，个股分化，芯片方向偏弱',
    quotes: [
      { symbol: 'AAPL', name: '苹果', price: 231.5, changePct: 1.23 },
      { symbol: 'NVDA', name: '英伟达', price: 178.4, changePct: -2.05 },
      { symbol: '600519.SH', name: '贵州茅台', price: 1486, changePct: 0.62 },
    ],
    indices: [
      { symbol: '^GSPC', name: '标普500', changePct: 0.35 },
      { symbol: '000001.SH', name: '上证指数', changePct: -0.18 },
      { symbol: '^HSI', name: '恒生指数', changePct: 0.9 },
    ],
    drivers: [
      '芯片板块走弱带动英伟达当日下跌百分之二点零五',
      '美联储官员关于通胀回落路径的表态影响利率预期',
      '居民消费价格同比上涨的物价数据对消费方向构成正面信号',
    ],
    riskPoints: [
      '美联储表态仍可能反复，利率预期变化会放大资产价格波动',
      '芯片方向承压如果延续，相关行业之外的公司可能跟着调整',
    ],
  },
};

const worldSampleJson = {
  title: '今天的五件事：价格与规则同时在调整',
  subtitle: '能源补贴、停火磋商与出口管制清单的变化',
  summary:
    '今天的五件事，主线是围绕资源和规则的两类动作。欧洲在下一阶段能源价格补贴上谈出初步一致，能源成本这个变量短期可能稳一点；美国调整出口管制清单，贸易和技术限制的边界仍在移动；中东停火谈判进入新一轮磋商，能源与航运的风险并没有解除。南美产油国延长减产协议，供给端继续收紧；东亚在跨境支付结算试点上达成框架，属于长期规则推进。',
  takeaways: [
    '能源补贴与减产是同一条线，供给端的松紧决定能源价格往哪走。',
    '出口管制清单调整，说明贸易与技术限制的边界仍在移动。',
    '停火谈判进入新一轮磋商，地缘风险缓解但没有落地，仍需观察。',
    '跨境支付试点扩大是长期规则推进，短期对个人钱包影响有限。',
  ],
  body:
    '今天的五件事按影响面从大到小排。第一件在欧洲，欧盟与成员国就下一阶段的能源价格补贴方案达成了初步一致。能源是工业生产的投入，补贴方案如果落地，生产成本的压力就小一点，传导到物价上会慢一些。\n\n' +
    '第二件在中东，停火谈判进入新一轮磋商。中东的紧张程度直接影响能源和航运的风险溢价，谈判只要还在进行，风险就还在。真正能确认进度的信号不是会谈本身，而是后面有没有出现可核查的停火安排，这一点输入里没有，只能当作观察项。\n\n' +
    '第三件在北美，美国宣布调整部分出口管制清单。管制清单决定哪些技术和商品不能出口，调整意味着边界在移动。对普通人的传导路径比较间接但确实存在：被限制的品类范围变了，相关企业的生产安排可能跟着变，终端产品的供应和价格也可能跟着动。\n\n' +
    '第四件在南美，主要产油国宣布延长减产协议。减产延续说明供给端收得比较紧，油价的上行压力会被保留一部分。这件事和第二件其实是同一条线的两面：中东的冲突影响供给风险溢价，南美的减产影响实际产量。\n\n' +
    '第五件在东亚，主要经济体就跨境支付结算试点扩大达成了框架。这属于规则层面的推进，短期对个人钱包影响不大，但值得留意结算通道是否更顺、相关成本是否下降，这条线索往往和市场里的资金流向有关联。\n\n' +
    '把五件事放在一起看，今天的共同主题是价格和规则：能源补贴和减产协议在调整供给，管制清单和支付结算在调整规则。两类变化都会沿着产业链传导，传导的速度和幅度都说不准。\n\n' +
    '往后观察什么？一是补贴方案和减产协议的具体条款什么时候落地，生效范围多大；二是会谈能不能产出可核查的结果；三是管制清单调整之后相关商品的供应有没有变化；四是跨境支付试点从框架走到实操的进度。这些都是观察项，不是预测。\n\n' +
    '这五件事里，有三件和资源与贸易有关，一件和地缘冲突有关，一件是金融规则。把它们放在一起看会发现一个规律：越是涉及规则和资源的动作，落地时间越长，短期看着平静，实则是在给后面的变化攒条件。所以看这类新闻，最忌讳用当天的心情去判断方向。\n\n' +
    '还有一条经验：同一条消息，不同的人看到的是不同的部分。有人看到利好，有人看到风险，这往往说明两边说的其实是同一件事的两头。\n\n' +
    '对普通人来说，这类新闻的用法不是猜涨跌，而是提前知道哪些东西可能在接下来几个月变贵或变便宜，以及哪些环节的风险在积累。看清这一点，这五条新闻才算用上了。',
  script:
    '今天的五件事，主线是价格和规则。第一件在欧洲，欧盟和成员国在下一阶段的能源价格补贴方案上谈出了初步一致。能源是工厂的饭，补贴稳一点，产品的成本压力就小一点，传到物价上会慢一些。第二件在中东，停火谈判进入新一轮磋商，能源和航运的风险并没有解除。第三件在美国，调整了部分出口管制清单，规则边界在移动，相关商品的供应值得盯。第四件在南美，主要产油国延长减产协议，供给端收得比较紧。第五件在东亚，跨境支付结算试点扩大达成框架，属于长期的规则推进。往后看什么？看补贴和减产怎么落地，看会谈有没有可核查的结果，看清单调整后供应有没有变化，看支付试点从框架走到实操的进度。这些都是观察项，不是预测。对普通人来说，这类新闻的用法不是猜涨跌，而是提前知道哪些东西可能变贵或者变便宜。这五件事里，有三件和资源与贸易有关，一件和地缘冲突有关，一件是金融规则。涉及规则和资源的动作，落地时间通常更长，短期看着平静，其实是在给后面的变化攒条件。所以看这类新闻，最忌讳用当天的心情去判断方向。同一条消息，有人看到利好，有人看到风险，往往说明两边说的是同一件事的两头。',
  meta: {
    events: [
      {
        rank: 1,
        title: '欧盟与成员国就下一阶段能源价格补贴方案达成初步一致',
        region: '欧洲',
        whatHappened: '欧盟与成员国就下一阶段能源价格补贴方案达成初步一致。',
        whyItMatters: '能源是工业生产的投入，补贴方案可能影响生产成本的传导。',
        impact: '若方案落地，相关产业成本压力可能有所缓解，传导到物价上会慢一些。',
        watchNext: '看具体条款、覆盖范围与生效时间是否公布。',
        confidence: '高',
      },
      {
        rank: 2,
        title: '中东地区停火谈判进入新一轮磋商',
        region: '中东',
        whatHappened: '中东地区停火谈判进入新一轮磋商。',
        whyItMatters: '地区紧张程度会影响能源与航运的风险溢价。',
        impact: '谈判继续进行意味着风险溢价仍可能维持在较高水平。',
        watchNext: '看后续是否出现可核查的停火安排，而不是只看会谈消息。',
        confidence: '中',
      },
      {
        rank: 3,
        title: '美国宣布调整部分出口管制清单',
        region: '北美',
        whatHappened: '美国宣布调整部分出口管制清单。',
        whyItMatters: '清单决定哪些技术和商品不能出口，调整意味着边界在移动。',
        impact: '相关企业的生产安排可能变化，终端产品的供应与价格也可能跟着变动。',
        watchNext: '看调整涉及的具体品类，以及企业端是否出现排产变化。',
        confidence: '高',
      },
      {
        rank: 4,
        title: '南美主要产油国宣布延长减产协议',
        region: '南美',
        whatHappened: '南美主要产油国宣布延长减产协议。',
        whyItMatters: '减产延续说明供给端收得比较紧，油价上行压力会被保留一部分。',
        impact: '供给偏紧与地缘风险叠加，可能继续放大能源价格波动。',
        watchNext: '看协议执行范围与期限，以及产量实际变化情况。',
        confidence: '中',
      },
      {
        rank: 5,
        title: '东亚主要经济体就跨境支付结算试点扩大达成框架',
        region: '东亚',
        whatHappened: '东亚主要经济体就跨境支付结算试点扩大达成框架。',
        whyItMatters: '结算通道与成本的变化会影响跨境贸易的资金安排。',
        impact: '短期影响有限，中长期可能改变跨境资金的流转效率。',
        watchNext: '看框架是否进入试点，以及参与方名单与时间表。',
        confidence: '中',
      },
    ],
  },
};

/* ------------------------------------------------------------------ */
/* 通用载荷检查                                                        */
/* ------------------------------------------------------------------ */

function checkCommon(label: string, payload: any): void {
  expectRange(label + ' summary 字数', countChars(payload.summary), 120, 200);
  expect(
    Array.isArray(payload.takeaways) && payload.takeaways.length >= 3 && payload.takeaways.length <= 5,
    label + ' takeaways 条数为 3-5',
    '实际 ' + (payload.takeaways ? payload.takeaways.length : '非法'),
  );
  for (const t of payload.takeaways ?? []) {
    expectRange(label + ' takeaway 字数「' + t.slice(0, 12) + '…」', countChars(t), 20, 45);
  }
  expectRange(label + ' body 字数', countChars(payload.body), 900, 1500);
  const paragraphs = payload.body.split(/\n{2,}/).filter((p: string) => p.trim().length > 0);
  expect(paragraphs.length >= 3, label + ' body 分段不少于 3 段', '实际 ' + paragraphs.length);
  expect(!FENCE_RE.test(payload.body), label + ' body 不含代码块围栏');
  expectRange(label + ' script 字数', countChars(payload.script), 400, 700);
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

const inputs: Record<string, any> = {
  books: booksSampleInput,
  'ai-tools': aiToolsSampleInput,
  markets: marketsSampleInput,
  world: worldSampleInput,
};

const order: Array<'books' | 'ai-tools' | 'markets' | 'world'> = ['books', 'ai-tools', 'markets', 'world'];

console.log('========================================================');
console.log(' 我的窗口 · 四板块提示词自检（本地校验，无网络请求）');
console.log('========================================================');

for (const section of order) {
  const prompt = PROMPTS[section];
  const user = prompt.buildUser(inputs[section]);
  console.log('');
  console.log('[' + (order.indexOf(section) + 1) + '/4] ' + section + ' —— 提示词装配');
  console.log('  system 长度 : ' + prompt.system.length + ' 字符');
  console.log('  user   长度 : ' + user.length + ' 字符');
  console.log('  --- system 前 200 字 ---');
  console.log('  ' + prompt.system.slice(0, 200).split('\n').join('\n  '));
  console.log('  --- user 前 200 字 ---');
  console.log('  ' + user.slice(0, 200).split('\n').join('\n  '));
}

/* ------------------------------------------------------------------ */
/* 2. 提示词层面的硬约束                                               */
/* ------------------------------------------------------------------ */

console.log('');
console.log('--------------------------------------------------------');
console.log(' 提示词硬约束检查');
console.log('--------------------------------------------------------');

for (const section of order) {
  const prompt = PROMPTS[section];
  const user = prompt.buildUser(inputs[section]);
  console.log('');
  console.log('[' + section + ']');
  expect(prompt.system.includes('只输出一个 JSON 对象'), section + ' system 含「只输出一个 JSON 对象」');
  expect(prompt.system.includes('禁止用代码块包裹'), section + ' system 含「禁止用代码块包裹」');
  expect(user.includes('禁止代码块包裹'), section + ' user 含「禁止代码块包裹」');
  expect(prompt.system.includes('120 到 200 字'), section + ' system 写明 summary 长度');
  expect(prompt.system.includes('900 到 1500 字'), section + ' system 写明 body 长度');
  expect(prompt.system.includes('400 到 700 字'), section + ' system 写明 script 长度');
  expect(prompt.system.includes('阿拉伯数字'), section + ' system 写明朗读数字约束');
  expect(prompt.system.includes('可能') && prompt.system.includes('值得关注'), section + ' system 写明事实与推断分离措辞');
  expect(prompt.system.includes('术语'), section + ' system 写明术语须用大白话解释');
  expect(prompt.id === section && prompt.section === section, section + ' id / section 自洽');
  expect(prompt.temperature >= 0 && prompt.temperature <= 1, section + ' temperature 合法');
  expect(prompt.maxTokens >= 1024, section + ' maxTokens 足够');
}

expect(
  JSON.stringify(Object.keys(PROMPTS).sort()) === JSON.stringify(['ai-tools', 'books', 'markets', 'world']),
  'PROMPTS 覆盖四个板块',
  Object.keys(PROMPTS).join(','),
);

/* ------------------------------------------------------------------ */
/* 3. 样例 JSON 过 schema                                               */
/* ------------------------------------------------------------------ */

const samples: Record<string, any> = {
  books: booksSampleJson,
  'ai-tools': aiToolsSampleJson,
  markets: marketsSampleJson,
  world: worldSampleJson,
};

console.log('');
console.log('--------------------------------------------------------');
console.log(' 样例 JSON 契约检查（schema.parse）');
console.log('--------------------------------------------------------');

for (const section of order) {
  const prompt = PROMPTS[section];
  console.log('');
  console.log('[' + section + ']');
  let payload: any;
  try {
    const raw = JSON.stringify(samples[section]);
    payload = prompt.schema.parse(JSON.parse(raw));
    ok(section + ' schema.parse 成功（JSON 往返一次）');
  } catch (err: any) {
    fail(section + ' schema.parse 失败', err?.issues ? JSON.stringify(err.issues) : String(err?.message ?? err));
    continue;
  }
  checkCommon(section, payload);

  if (section === 'books') {
    expect(payload.meta.discipline === booksSampleInput.discipline, 'books meta.discipline 与输入一致');
    expect(payload.meta.book.length > 0, 'books meta.book 非空');
    expect(payload.meta.author.length > 0, 'books meta.author 非空');
    expect(payload.meta.coreIdea.length > 0, 'books meta.coreIdea 非空');
    expect(payload.meta.whyItMatters.length > 0, 'books meta.whyItMatters 非空');
  }

  if (section === 'ai-tools') {
    expect(payload.meta.repoFullName === aiToolsSampleInput.repo.fullName, 'ai-tools meta.repoFullName 与输入一致');
    expect(payload.meta.repoUrl === aiToolsSampleInput.repo.url, 'ai-tools meta.repoUrl 与输入一致');
    expect(payload.meta.stars === aiToolsSampleInput.repo.stars, 'ai-tools meta.stars 与输入一致');
    expect(payload.meta.language === aiToolsSampleInput.repo.language, 'ai-tools meta.language 与输入一致');
    expect(payload.meta.whatItIs.length > 0, 'ai-tools meta.whatItIs 非空');
    expect(payload.meta.whoIsItFor.length > 0, 'ai-tools meta.whoIsItFor 非空');
    expect(payload.meta.howToStart.length > 0, 'ai-tools meta.howToStart 非空');
    expect(payload.meta.whyNow.length > 0, 'ai-tools meta.whyNow 非空');
  }

  if (section === 'markets') {
    const q = payload.meta.quotes.map((x: any) => [x.symbol, x.name, x.price, x.changePct].join('|')).join(';');
    const qi = marketsSampleInput.quotes.map((x: any) => [x.symbol, x.name, x.price, x.changePct].join('|')).join(';');
    expect(q === qi, 'markets meta.quotes 与输入逐字一致', q + ' vs ' + qi);
    const ix = payload.meta.indices.map((x: any) => [x.symbol, x.name, x.changePct].join('|')).join(';');
    const ixi = marketsSampleInput.indices.map((x: any) => [x.symbol, x.name, x.changePct].join('|')).join(';');
    expect(ix === ixi, 'markets meta.indices 与输入逐字一致', ix + ' vs ' + ixi);
    expect(payload.meta.riskPoints.length >= 2, 'markets meta.riskPoints 至少两条');
    expect(countChars(payload.meta.marketMood) <= 30, 'markets meta.marketMood 不超过 30 字');
    expect(payload.meta.drivers.length >= 3, 'markets meta.drivers 至少三条');
    const advice = /建议买入|建议加仓|建议减持|该抄底|可以重仓|满仓|目标价|推荐买入/;
    expect(!advice.test(payload.body) && !advice.test(payload.script), 'markets 正文与朗读稿无投资建议措辞');
  }

  if (section === 'world') {
    expect(payload.meta.events.length === 5, 'world meta.events 恰好 5 条', '实际 ' + payload.meta.events.length);
    const ranks = payload.meta.events.map((e: any) => e.rank).sort((a: number, b: number) => a - b);
    expect(JSON.stringify(ranks) === JSON.stringify([1, 2, 3, 4, 5]), 'world rank 覆盖 1-5 且不重复');
    for (const e of payload.meta.events) {
      expect(e.region.length > 0 && !['全球', '多地', '各地'].includes(e.region), 'world 事件 region 具体：' + e.region);
      expect(['高', '中', '低'].includes(e.confidence), 'world 事件 confidence 合法：' + e.confidence);
      expect(e.whatHappened.length > 0 && e.whyItMatters.length > 0 && e.impact.length > 0 && e.watchNext.length > 0, 'world 事件四段齐备：rank ' + e.rank);
    }
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
console.log(' 结论：全绿 —— 四个板块 schema.parse 全部成功，提示词硬约束全部命中');
process.exit(0);
