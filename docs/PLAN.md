# 我的窗口 · 架构与任务书

> 最后更新：本次会话生成。本文是本项目唯一的决策记录来源，代码与本文冲突时以本文为准并回头修本文。

## 一、已确认的产品决策（用户拍板）

| 决策点 | 结论 |
|---|---|
| 内容引擎 | 云端 API（本机凭据仓已有 DeepSeek / MiniMax / 小米 三把 key）；本机跑模型不现实 |
| 访问方式 | 先做本机 + 同一 WiFi 下手机可访问；外网访问后续可加 Tailscale / 隧道 |
| 访问保护 | 不加登录密码（走 Tailscale 足够） |
| 学习档案 | 不做笔记 / 划重点 / 已读进度；保持极简，每天读新内容 |
| 自动化 | 定时自动生成，打开即读 |
| 核心体验 | 页面要优秀 + 要有朗读 |

## 二、技术栈（全部开源，Windows 本机运行）

| 层 | 选型 | 理由 |
|---|---|---|
| 前端 | Vite 8 + React 19 + TypeScript 5 + Tailwind CSS 4 | 无 SSR 复杂度，迭代快；Tailwind 4 用 @tailwindcss/vite 免 postcss 配置 |
| API | Hono + @hono/node-server | TS 原生、极轻、Node 直跑 |
| 存储 | Node 24 内置 `node:sqlite`（DatabaseSync） | 零原生依赖，免 better-sqlite3 的 node-gyp 编译坑 |
| 抓取 | 原生 fetch + fast-xml-parser + cheerio | RSS/Atom 与 HTML 兜底 |
| GitHub | api.github.com 原生 fetch + `gh auth token` 取令牌 | 官方 Search API 稳定；`gh` 令牌在 Windows keyring |
| 朗读 | msedge-tts（Edge 在线神经语音）→ MP3 | 免费、音质高、中文音色好；浏览器 speechSynthesis 作兜底 |
| 图表 | lightweight-charts 5 | K 线/指数走势，体积小 |
| 动画 | motion (Framer Motion 14) | 页面质感 |
| 调度 | Windows 计划任务 调 `pnpm gen:daily`；服务内 node-cron 兜底 | 生成是离线任务，站点只读 |

## 三、目录结构

```
src/
  shared/types.ts        # 前后端共享类型 + PromptSpec 契约
  web/                   # React 界面（main.tsx / App.tsx / pages / components / styles）
  server/
    index.ts             # Hono 入口：API + 静态站点 + /audio
    config.ts secrets.ts # 路径与密钥（密钥只读不打印）
    db.ts                # node:sqlite 建表与读写
    llm/schema.ts        # 四个板块的 zod 输出契约
    llm/providers.ts     # 多家 API 兜底链（子任务 C）
    llm/client.ts        # 调用 + JSON 抽取 + 重试
    llm/prompts/*.ts     # 四板块提示词（子任务 D）
    sources/*.ts         # RSS / GitHub / 行情抓取（子任务 A）
    tts/edge.ts          # 语音合成（子任务 B）
    pipeline/*.ts        # 采集 → 生成 → 入库 → 配音
    cli/generate-daily.ts# 每日编排 CLI（计划任务入口）
data/app.db              # SQLite
data/audio/*.mp3         # 朗读音频
docs/                    # 架构、任务书、数据源清单、验收记录
```

## 四、数据模型

```sql
CREATE TABLE articles (
  id TEXT PRIMARY KEY,          -- 2026-11-05-books / 2026-11-05-ai-1 ...
  section TEXT NOT NULL,        -- books | ai-tools | markets | world
  date TEXT NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT "",
  summary TEXT NOT NULL DEFAULT "",
  takeaways TEXT NOT NULL DEFAULT "[]",   -- JSON
  body TEXT NOT NULL DEFAULT "",         -- Markdown 讲解正文
  script TEXT NOT NULL DEFAULT "",       -- 口语化朗读稿
  reading_minutes INTEGER NOT NULL DEFAULT 0,
  audio_path TEXT,
  meta TEXT NOT NULL DEFAULT "{}",       -- JSON：板块特有结构
  sources TEXT NOT NULL DEFAULT "[]",    -- JSON：引用来源
  generated_at TEXT NOT NULL
);
CREATE INDEX idx_articles ON articles(section, date DESC);
CREATE TABLE runs (              -- 每次生成留痕，便于排障
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section TEXT NOT NULL, date TEXT NOT NULL,
  started_at TEXT NOT NULL, finished_at TEXT,
  status TEXT NOT NULL, message TEXT, article_id TEXT
);
```

## 五、四个板块的生成流水线

| 板块 | 频率 | 采集 | 生成 | 产物 |
|---|---|---|---|---|
| books 书籍学习 | 每天 1 篇，6 个学科轮换 | 学科书单/经典概念清单（内置） | LLM 讲解：核心观点 + 为什么与你有关 + 3-5 要点 + 800-1500 字正文 + 口语化朗读稿 | 1 篇文章 |
| ai-tools 前沿 AI | 每周 5 个 | GitHub Search API（近 7 天新建、star 阈值）+ README | 逐仓库生成：这是什么 / 适合谁 / 怎么上手 / 为什么现在火 | 5 篇文章 |
| markets 全球与中国金融 | 每天 1 篇 | 指数与个股真实报价（Yahoo chart API / 东方财富）+ 财经 RSS | 基于真实报价与新闻做市场解读，附涨跌数据 | 1 篇文章 + 走势图 |
| world 全球局势 | 每天 1 篇 | 国际主流 RSS（BBC / FT / Guardian / Al Jazeera 等） | 5 件大事：发生了什么 / 为什么重要 / 影响 / 下一步看什么 / 置信度 | 1 篇文章 |

所有板块统一产出 `body`（页面讲解用 Markdown）+ `script`（朗读稿，口语化，可与正文略有出入但事实一致）+ `takeaways`。

## 六、真实性与准确性防线

1. 每篇文章必须带 `sources`（真实 URL），来源不明的具体数字一律不许出现。
2. 行情数字来自真实接口，不由模型编造；模型只负责解读。
3. 提示词层明确禁止编造，输出走 zod 校验，字段缺失直接判失败并重试。
4. world 板块每条事件带 `confidence`（高/中/低）与 `watchNext`。
5. 提示词要求「事实与推断分开陈述」，推测必须标记为推断。

## 七、朗读策略

- 主路径：服务端用 Edge 神经语音合成 MP3，存 `data/audio/`，页面用 `<audio>` 播放，可暂停/续播/变速。
- 兜底：音频缺失或合成失败时，页面自动切到浏览器 `speechSynthesis`（朗读稿仍可用）。
- 音色：中文优先 `zh-CN-XiaoxiaoNeural`（女声、讲解感强）与 `zh-CN-YunxiNeural`（男声、沉稳）。

## 八、子任务书（并行执行，边界互不重叠）

### A｜数据源与抓取（子代理 A）
- 边界：`src/server/sources/**`、`docs/SOURCES.md`
- 产出：`rss.ts` / `github.ts` / `market.ts`，每条数据源必须实测可用并记录抓取结果

### B｜语音合成（子代理 B）
- 边界：`src/server/tts/**`、`docs/TTS.md`
- 产出：`edge.ts`，必须在本机实测产出中文 MP3 文件

### C｜LLM 端点与兜底链（子代理 C）
- 边界：`src/server/llm/providers.ts`、`docs/LLM-PROVIDERS.md`
- 产出：用本机凭据实测各家端点可用性，实现多级兜底；严禁在任何输出里打印密钥原文

### D｜四板块提示词（子代理 D）
- 边界：`src/server/llm/prompts/**`
- 产出：`books.ts` / `ai-tools.ts` / `markets.ts` / `world.ts` + `index.ts`，输出必须过 `llm/schema.ts` 的 zod 校验

## 九、验收标准

1. `pnpm typecheck` 与 `pnpm build` 全绿。
2. 四个板块各产出真实内容，引用可点开，行情数字与来源接口一致。
3. 音频可播放，时长与文稿匹配。
4. 桌面 1440×900 与手机 390×844 两档视口下页面无溢出、无重叠。
5. `pnpm gen:daily` 可在计划任务中无人值守跑完四个板块。
6. 提供 Before/After 截图证据。

## 十、待办与已知风险

- 风险：Edge 语音端点若被上游变更，`msedge-tts` 会失效 → 浏览器 speechSynthesis 兜底已内置。
- 风险：GitHub 未授权调用只有 60 次/小时 → 优先用 `gh auth token`，失败再退化为未授权。
- 风险：LLM 服务若全部不可用 → 生成失败会写 `runs` 表并保留上一次内容，页面显示"今日内容生成失败"。

## 十一、第五板块：AI 学习（2026-11-16 追加）

用户追加需求：为「会用大模型 API、但不懂原理」的读者编排一套每天一讲的 AI 学习课程。

- 决策：独立第 5 板块（顶栏/底栏各 6 项），板块内两条线并行 —— 每日一讲（40 讲固定骨架）+ 每周技术速递。
- 课程骨架 40 讲由 `src/server/course/types.ts` 定死，教学细节在 `src/server/course/curriculum.ts`。
- 新增两个 section id：`ai-course`（日课）、`ai-weekly`（周更）；新增两张表 `course_lessons` / `course_state`。
- 新增流水线 `pipeline/aiCourse.ts` / `pipeline/aiWeekly.ts`，素材来自 AI 类订阅源 + GitHub 当周高星仓库。
- 详细设计见 `docs/AI-COURSE.md`，课程大纲见 `docs/CURRICULUM.md`。

## 十二、内容去重闸门（2026-11-16 追加）

需求：每日推荐不要重复；观点可以更正，但不得把旧内容原样搬上来。

- 查重：同板块最近 21 篇做中文二元组 Jaccard 相似度，分 `copy` / `topic` / `none` 三档；局势板块额外做事件级查重。
- 重写：命中即把旧文摘要喂回模型并附「不要照搬／要写清新增了什么／没变化就换角度」的硬性要求，最多 3 次，取重复度最低的一稿。
- 账本：`topic_usage` 表记录已讲过的书籍种子与 GitHub 仓库，保证同一本书、同一仓库不重复讲。
- 允许更正：`topic` 档允许再讲同一件事，但正文必须写出新增了什么。
- 代码：`src/server/pipeline/dedupe.ts`；自检 `npx tsx scripts/check-dedupe.ts`；账本回填 `npx tsx scripts/seed-topic-ledger.ts`。

## 十三、换行转义修复（2026-11-16 追加）

现象：部分正文出现字面量 `\n\n`，整段挤成一行。

- 根因：提示词要求「换行写成转义形式（一个反斜杠加字母 n）」，模型把它理解成写两个反斜杠，JSON 解析后就成了字面量。不同模型、不同次生成表现不一致（有的给真换行，有的给字面量）。
- 修复一（不依赖模型听话）：`src/server/llm/text.ts` 在 zod 校验前对解析结果做深度归一——整段没有真实换行但存在字面量转义时，先把双反斜杠折成单反斜杠，再把 `\n`/`\t` 转成真实换行与制表符；已有真实换行的内容保持原样，避免误伤正文里故意讲解 `\n` 写法的段落。
- 修复二（提示词）：六个板块的规则统一改为「用标准 JSON 转义表示（反斜杠加字母 n，一共两个字符）；不要写成两个反斜杠」。
- 修复三（存量）：`scripts/repair-newlines.ts` 迁移历史文章，已修 3 篇。
- 附带加固：数字字段（`lessonNo`/`stars`/`rank`）接受数字字符串，避免模型偶尔写成 `"1"` 导致整篇判失败。
- 自检：`npx tsx scripts/check-newlines.ts`（9 项断言）、`npx tsx scripts/diag-newlines.ts`（存量体检）。

## 十四、公众号发布通道（2026-11-16 追加）

产品名统一为《我的窗口》。

### 形态与前提

> 2026-11-16 调整：公众号只发 AI 学习这一讲（原本是五板块合并日报），其余板块仍只在网页版。

- 形态：**只做 AI 学习板块**（用户 2026-11-16 定）——每天一讲，一讲一图一段朗读，不掺其他板块；
  正文含：这一讲要弄懂 / 从哪儿看起 / 要点 / 完整讲解正文 / 动手练一下。
- 账号前提：**个人主体订阅号拿不到微信认证，因此没有草稿箱 API 权限**；
  全自动通道按「配置即启用」实现——`WECHAT_APP_ID` / `WECHAT_APP_SECRET` 到位后自动走草稿箱 API，
  未配置时页面提供「复制 HTML / 下载 HTML / 下载音频」作为手动发布路径。
- 微信限制的处理：正文不放外链与图片（外链图会被过滤）；语音控制在 2 分钟内（公众号语音单条上限）；
  「阅读全文」按用户选择不放链接。

### 代码

- `src/server/publishers/wechat/html.ts` —— 公众号兼容排版（全内联样式）与五板块打包
- `src/server/publishers/wechat/audio.ts` —— 摘要朗读稿（数字转中文读法、90 秒预算）
- `src/server/publishers/wechat/api.ts` —— access_token、语音素材上传、草稿箱写入（密钥脱敏）
- `src/server/publishers/wechat/index.ts` —— 组装与发布编排
- 接口：`GET /api/wechat/preview`、`POST /api/wechat/audio`、`POST /api/wechat/publish`
- 页面：`src/web/pages/Wechat.tsx`（路由 `/wechat`，顶栏「公众号」入口）

### 路由改为真实路径

原来是 hash 路由（`#/wechat`），改为路径路由（`/wechat`）：链接可直接复制分享，
也避免某些代理/预加载场景丢片段导致落回首页。服务端已有 SPA 回退（任意路径返回 index.html）。
hash 仍然兼容。

### 配图（程序化矢量插画）

公众号图文没有封面发不出去、正文无图也不像杂志，因此配图走**程序化生成**：

- 代码：`src/server/publishers/wechat/images.ts`（SVG 生成）+ `render.ts`（SVG→PNG 光栅化）；
- 光栅化：`@resvg/resvg-js`（纯 Rust 预编译二进制，无需编译、无 GPU、无模型下载）；
- 每天 3 张：封面 900×383、讲次海报 1080×1440、AI 学习配图 1080×1350；
- 图里的数字全是真实数据（星标、报价、走势图用 `fetchHistory("^GSPC")` 的真实序列）；
- 缓存：`data/images/{date}-manifest.json`，同一天不重复生成；`POST /api/wechat/images` 可强制重出。
- 为什么不用本地出图模型：本机是 RTX 3050 4GB 笔记本卡，SDXL 跑不动也不适合每天无人值守；
  程序化矢量图与网页端杂志排版同源、零版权风险、秒级产出。
- 风格：米白纸底 + 墨黑 + 朱红 + 衬线数字，与网页端一致；长标题自动缩字号而不是硬截断。

### 踩坑：`fetch` 传 `AbortSignal` 会挂起

给 `fetch` 传 `{ signal: AbortController.signal }` 时，页面的请求在部分浏览器环境里会一直挂着不返回（无报错、无超时），
表现为页面永远停在加载态；同一个接口用不带 signal 的 `fetch` 则立刻返回。
现在改用 `Promise.race` 实现超时（`src/web/lib/api.ts` 的 `getJson`），既保留 20 秒超时，又不传 signal。
排查这类"接口明明正常、页面却不动"的问题，先用最小探针页在浏览器里直接 fetch 一次，