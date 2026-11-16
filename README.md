# 我的窗口

每天四份读物，十五分钟读完世界 —— 书籍学习 / 前沿 AI 工具 / 全球与中国金融 / 全球局势，全部带来源、全部能朗读。

## 快速开始

```powershell
cd E:\软件项目设计\个人窗口
npm install                 # 首次需要
powershell -ExecutionPolicy Bypass -File scripts\start-app.ps1
```

- 本机访问：<http://localhost:4399>
- 手机访问（同一 WiFi）：`http://<本机局域网IP>:4399`（start-app.ps1 会把 IP 打出来）

开发模式（前端热更新）：

```powershell
npm run dev        # API :4399 + 前端 :5173
```

## 每天自动生成

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-schedule.ps1
```

注册 Windows 计划任务，每天 07:05 跑 `npm run gen:daily`，日志在 `data/daily.log`。
服务自身也带兜底：每 20 分钟检查一次，若北京时间已过 07:00 且当天内容缺失，就自动补齐。

手动生成：

```powershell
npm run gen:daily                                   # 今天全部四个板块
npm run gen:daily -- 2026-11-16 books,world        # 指定日期与板块
npm run gen:daily -- --force                        # 强制重生成
```

页面上右上角「立即生成」也是同一套流程。

## 朗读

- 主路径：服务端用 Edge 神经语音合成 MP3，存 `data/audio/`，页面底部播放条可暂停、拖进度、0.75~1.5 倍速。
- 兜底：音频缺失或合成失败时，自动改用浏览器自带语音（`speechSynthesis`）。
- 默认音色 `zh-CN-XiaoxiaoNeural`，共 8 个 zh-CN 音色可用。

## 密钥

不填也能跑：服务端会回退读取 `E:\dsh-home\.credentials.yaml` 里 `refs:` 段的同名 key（`DEEPSEEK_API_KEY` / `MINIMAX_CN_API_KEY` / `XIAOMI_TOKEN_PLAN_CN_API_KEY`）。
也可以在项目根建 `.env.local` 覆盖（见 `.env.example`）。
实测可用端点：DeepSeek（chat / reasoner）、MiniMax（M3 / M2.5，cn 与 intl）；小米 MiMo 两个模型当前额度耗尽（429）。

## 目录

```
src/server/    后端：抓取源、提示词、大模型兜底链、TTS、流水线、API
src/web/       前端：四个板块页面、朗读播放器、行情图表
src/shared/    前后端共享类型与契约
data/          SQLite 数据库 + 音频（已 gitignore）
docs/          架构、任务书、数据源清单、提示词说明、学习方法、交付记录
scripts/       启动脚本、计划任务安装脚本
```

## 自检脚本

```powershell
npx tsx src/server/sources/_check.ts       # 数据源实测
npx tsx src/server/llm/providers.check.ts  # 大模型端点实测
npx tsx src/server/tts/_check.ts           # 语音合成实测
npx tsx src/server/llm/prompts/_check.ts   # 提示词契约实测
npx tsx src/server/cli/check-keys.ts       # 密钥装载状态（只打印长度）
```

更多细节见 `docs/PLAN.md`。
## 云端部署（电脑不开也能自动跑）

已内置容器化与定时器，部署手册见 `docs/DEPLOY.md`：

- **VPS + Docker**（推荐）：`docker compose up -d --build`，2 核 2G 境外轻量机即可，网页版 24/7；
- **GitHub Actions**（零成本）：每天 23:05 UTC 自动出稿，产物含离线网页、公众号稿、配图、音频、摘要；
- **本机开机自启**（零成本）：一条 `schtasks` 命令。

硬约束：**Edge 朗读必须在境外节点**；微信草稿箱 API 需要固定公网 IP（认证号 + IP 白名单）。


## 公众号日报

顶栏「公众号」进入：把今天的几份内容打包成一条**公众号图文 + 一段约 90 秒摘要朗读**。

- 正文按公众号排版规则生成（全部内联样式，微信不会剥离），可直接复制或下载 HTML，粘进公众号后台即可发布。
- **账号路线（2026-11-16 定）**：先用个人订阅号，不办执照、不做认证；每天一讲跟着课程进度走。
  个人号没有草稿箱 API 权限，所以走半自动：点「复制图文（带插图占位）」→ 公众号后台粘正文 →
  按占位顺序插入图片（每张配图都有「复制图片」按钮）→ 可选插入音频 → 发表。全程约一分钟。
- 等内容跑顺、确实嫌手动麻烦了再去办个体工商户 + 微信认证（300 元/年），
  填 `WECHAT_APP_ID` / `WECHAT_APP_SECRET` 并加 IP 白名单，「写入草稿箱」即刻生效，代码不用改。
- 朗读稿单独生成并控制在 90 秒内（微信单条语音上限约 2 分钟）。
- 已写好草稿箱 API 通道：把 `WECHAT_APP_ID` / `WECHAT_APP_SECRET` 填进凭据文件后，「写入草稿箱」可直接生成草稿。
  注意：个人主体订阅号无法微信认证，没有草稿箱 API 权限——个人号请用复制/下载这条路。
- 本版按你的选择：**公众号里只放摘要，不放外链**，需要细节回网页版。

细节见 `docs/PLAN.md` 第十四章。

## AI 学习板块

第 5 板块：面向「会调 API、但不懂原理」的读者，40 讲固定骨架（S1 拆开一次调用 → S2 模型是怎么来的 →
S3 应用原理 → S4 看得懂前沿 → S5 动手做），每天一讲，每讲都用当周真实动态举例；
另有每周一篇「本周技术速递」并行更新。设计见 `docs/AI-COURSE.md`，大纲见 `docs/CURRICULUM.md`。