# AI 学习板块设计（新增第 5 板块）

## 一、为什么独立成一个板块

「前沿 AI 应用」和「AI 学习」是两种相反的阅读行为：

| | 前沿 AI 应用 | AI 学习 |
|---|---|---|
| 组织方式 | 无序，每周五个，随便挑 | 有序，一讲接一讲，跳着看就断了 |
| 读者动作 | 扫一眼，感兴趣就点开 | 跟着走，从第 1 讲开始 |
| 需要的功能 | 仓库链接、星标、上手路径 | 目录、上一讲/下一讲、进度 |
| 情绪 | 惊喜（又出了新东西） | 连续（我在变强） |

所以课程有自己的板块、自己的目录和自己的进度，不与工具榜混在一页。

## 二、读者画像（决定了怎么讲）

读者**已经会写代码调 API，但不懂底层原理**。因此：

- 不讲「怎么写提示词」「怎么用网页版」这类他早已会的东西；
- 每讲从一个他天天在用的东西切入（`chat/completions` 请求体、`usage.prompt_tokens`、流式返回、temperature……）；
- 先大白话直觉，再技术细节，公式后面必须紧跟一句人话；
- 每讲都要落到「这会怎么影响你写的那段调用代码」。

## 三、课程结构：40 讲 / 五个阶段

| 阶段 | 讲次 | 主题 | 要解决什么 |
|---|---|---|---|
| S1 | 1–6 | 拆开一次调用 | 一次请求从 tokenize 到解码，中间每一环在干什么 |
| S2 | 7–14 | 模型是怎么来的 | 预训练、对齐、幻觉、部署、上下文工程、评测 |
| S3 | 15–24 | 应用原理 | RAG、检索、向量库、Agent、MCP、多模态、结构化输出、成本 |
| S4 | 25–32 | 看得懂前沿 | 推理模型、MoE、蒸馏、提示注入、本地部署、多智能体、评测驱动、读论文 |
| S5 | 33–40 | 动手做 | 跑模型、看权重、手写 RAG、手写 MCP Agent、造简报机器人、做知识库、优化与评测 |

讲次、标题、阶段由 `src/server/course/types.ts` 定死（唯一事实源）；
每讲的教学目标、锚点、前置、练习、关键词由 `src/server/course/curriculum.ts` 提供（子代理产出，454 项断言全过）。

## 四、两条线并行

- **主线 · 每日一讲**：每天生成一讲，进度自动前进（`course_state.current_lesson`），页面显示「第 N 讲 / 40」、已学进度条、40 讲目录（已讲可回看）、上一讲/下一讲。
- **副线 · 每周技术速递**：每周一篇（`ai-weekly`），汇总当周 AI 技术动态 + 本周热门仓库，用「技术层面变了什么 / 为什么重要 / 对你意味着什么」三段讲透，并附 2–5 个术语的大白话解释。

两条线在同一个板块页里上下排列，但节奏独立：课程按顺序推进，速递每周更新。

## 五、怎么保证「最新」

每讲生成时都会把当周真实素材喂进提示词：

- AI 类订阅源头条（MIT Tech Review / MarkTechPost / The Decoder / TechCrunch / Ars Technica / Nature / Hackaday / CNBC Tech）；
- GitHub 近 7 天新建的高星仓库；
- 提示词要求 `meta.latestTieIn` 必须写清「这一讲和当周哪条真实动态有关」，没有素材时必须明说「本周无直接关联」。

所以骨架是固定的（能系统学），例子是当周的（不滞后）。

## 六、数据模型新增

```sql
CREATE TABLE course_lessons (
  lesson_no INTEGER PRIMARY KEY,   -- 讲次
  article_id TEXT NOT NULL,         -- 对应 articles.id
  date TEXT NOT NULL,
  generated_at TEXT NOT NULL
);
CREATE TABLE course_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  current_lesson INTEGER NOT NULL DEFAULT 1,   -- 下一讲要讲的编号
  updated_at TEXT NOT NULL
);
```

文章本身仍存 `articles` 表，`section = 'ai-course'`，`meta.lessonNo` 记录讲次，
`id` 形如 `2026-11-16-ai-course-L1`。

## 七、接口

- `GET /api/today` 增加 `ai-course`（最新一讲）与 `ai-weekly`（本周速递）。
- `GET /api/course` 返回进度、阶段、五阶段列表、40 讲标题、已学清单与最新一讲。
- `GET /api/course/lesson/:no` 取指定讲次（用于上一讲/下一讲回看）。

## 八、朗读

课程与速递同样走 Edge 神经语音合成，朗读稿 450–800 字，
约束更严：原理课里有公式和术语，所以提示词额外禁止在朗读稿里出现 Markdown 标记、括号注释、网址，数字写成中文读法。