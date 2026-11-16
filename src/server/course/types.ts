export interface Lesson {
  no: number;
  stage: string;
  stageTitle: string;
  title: string;
  goal: string;
  anchor: string;
  prerequisite: string;
  exercise: string;
  keywords: string[];
}

export interface LessonPlan {
  no: number;
  stage: string;
  stageTitle: string;
  title: string;
}

export const STAGES: Array<{ stage: string; title: string; from: number; to: number; blurb: string }> = [
  { stage: "S1", title: "拆开一次调用", from: 1, to: 6, blurb: "从你每天都在发的那个请求出发，把大模型的里子拆给你看" },
  { stage: "S2", title: "模型是怎么来的", from: 7, to: 14, blurb: "训练、对齐、幻觉、部署与评测，模型从数据变成服务的过程" },
  { stage: "S3", title: "应用原理", from: 15, to: 24, blurb: "RAG、检索、Agent、MCP、多模态、结构化输出与成本模型" },
  { stage: "S4", title: "看得懂前沿", from: 25, to: 32, blurb: "推理模型、MoE、蒸馏、安全边界、评测驱动开发与读论文的方法" },
  { stage: "S5", title: "动手做", from: 33, to: 40, blurb: "跑通模型、手写 RAG 与 Agent、造自己的小工具并做评测" },
];

export const LESSON_TITLES: LessonPlan[] = [
  { no: 1, stage: "S1", stageTitle: "拆开一次调用", title: "一次 chat/completions 请求的完整旅程" },
  { no: 2, stage: "S1", stageTitle: "拆开一次调用", title: "Token 与词表：你的每个字是怎么变成数字的" },
  { no: 3, stage: "S1", stageTitle: "拆开一次调用", title: "Embedding：为什么意思相近能被算出来" },
  { no: 4, stage: "S1", stageTitle: "拆开一次调用", title: "注意力机制：模型到底怎么读你的话" },
  { no: 5, stage: "S1", stageTitle: "拆开一次调用", title: "采样与温度：同一句话为什么会变" },
  { no: 6, stage: "S1", stageTitle: "拆开一次调用", title: "上下文窗口、位置与 KV cache：为什么长对话会忘事" },
  { no: 7, stage: "S2", stageTitle: "模型是怎么来的", title: "预训练：下一个词预测，以及模型读书的方式" },
  { no: 8, stage: "S2", stageTitle: "模型是怎么来的", title: "Scaling law 与涌现：为什么模型变大后突然会写代码" },
  { no: 9, stage: "S2", stageTitle: "模型是怎么来的", title: "后训练与对齐：RLHF 与 DPO 到底在调什么" },
  { no: 10, stage: "S2", stageTitle: "模型是怎么来的", title: "幻觉的成因：为什么它会一本正经地编" },
  { no: 11, stage: "S2", stageTitle: "模型是怎么来的", title: "开源与闭源：权重、许可、蒸馏与微调的关系" },
  { no: 12, stage: "S2", stageTitle: "模型是怎么来的", title: "推理与部署：量化、显存、吞吐与延迟" },
  { no: 13, stage: "S2", stageTitle: "模型是怎么来的", title: "上下文工程：提示词之外的另一半" },
  { no: 14, stage: "S2", stageTitle: "模型是怎么来的", title: "评测与基准：跑分怎么被做出来，哪些指标没用" },
  { no: 15, stage: "S3", stageTitle: "应用原理", title: "RAG 原理：检索怎么把知识塞进上下文" },
  { no: 16, stage: "S3", stageTitle: "应用原理", title: "检索的三种流派：关键词、向量、混合与重排" },
  { no: 17, stage: "S3", stageTitle: "应用原理", title: "向量数据库：相似度检索的工程取舍" },
  { no: 18, stage: "S3", stageTitle: "应用原理", title: "Agent 与工具调用：循环、规划与记忆" },
  { no: 19, stage: "S3", stageTitle: "应用原理", title: "MCP：模型接工具的标准协议" },
  { no: 20, stage: "S3", stageTitle: "应用原理", title: "多模态：图片和声音怎么进模型" },
  { no: 21, stage: "S3", stageTitle: "应用原理", title: "长文档处理：切分、摘要与上下文压缩" },
  { no: 22, stage: "S3", stageTitle: "应用原理", title: "结构化输出与约束解码：JSON 为什么会崩" },
  { no: 23, stage: "S3", stageTitle: "应用原理", title: "函数调用与 API 编排：把模型接进真实系统" },
  { no: 24, stage: "S3", stageTitle: "应用原理", title: "成本模型：token 怎么计价，缓存与批处理怎么省" },
  { no: 25, stage: "S4", stageTitle: "看得懂前沿", title: "推理模型与测试时计算：让模型想久一点" },
  { no: 26, stage: "S4", stageTitle: "看得懂前沿", title: "MoE 稀疏专家：参数多但每次只动一部分" },
  { no: 27, stage: "S4", stageTitle: "看得懂前沿", title: "蒸馏与小模型：把大模型的能力压进小壳" },
  { no: 28, stage: "S4", stageTitle: "看得懂前沿", title: "提示注入与安全边界：模型为什么会被骗" },
  { no: 29, stage: "S4", stageTitle: "看得懂前沿", title: "本地部署与隐私：什么数据该留在自己机器上" },
  { no: 30, stage: "S4", stageTitle: "看得懂前沿", title: "多智能体系统：什么时候值得多开几个模型" },
  { no: 31, stage: "S4", stageTitle: "看得懂前沿", title: "评测驱动开发：给自己的应用做一套体检" },
  { no: 32, stage: "S4", stageTitle: "看得懂前沿", title: "读懂技术报告与论文：五分钟抓重点" },
  { no: 33, stage: "S5", stageTitle: "动手做", title: "从零跑一个开源模型" },
  { no: 34, stage: "S5", stageTitle: "动手做", title: "看懂模型的 config 与权重结构" },
  { no: 35, stage: "S5", stageTitle: "动手做", title: "手写一个最小 RAG" },
  { no: 36, stage: "S5", stageTitle: "动手做", title: "手写一个带 MCP 的 Agent" },
  { no: 37, stage: "S5", stageTitle: "动手做", title: "做一个每日简报机器人" },
  { no: 38, stage: "S5", stageTitle: "动手做", title: "做一个本地知识库" },
  { no: 39, stage: "S5", stageTitle: "动手做", title: "做一次成本与延迟优化" },
  { no: 40, stage: "S5", stageTitle: "动手做", title: "给自己的应用做一套评测" },
];

export const TOTAL_LESSONS = LESSON_TITLES.length;