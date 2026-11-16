# 云端部署手册（电脑不开也能自动跑）

> 目标：把这套东西搬到云上，**电脑关机也能每天自动出稿**，并把公众号稿准备好。

## 零、先看清四件硬约束

1. **Edge 朗读（TTS）必须境外节点**：微软语音端点在国内访问不稳，音频会失败。
   → 买香港 / 新加坡 / 日本的机器；买国内节点则必须换 TTS（讯飞/阿里，音质略降）。
2. **微信草稿箱 API 需要固定公网 IP**（IP 白名单）。免费动态 IP 方案拿不到这个能力。
3. **数据要持久化**：SQLite 库、音频、图片都在 `data/` 目录，容器里必须挂卷，不能随容器重建。
4. **抓取并发**：本机出网代理并发弱（超过 2~3 个连接就 EADDRINUSE）。云上直连通常没有这个问题，
   但建议仍把并发压到 2，避免被源站限流。

## 一、方案 A：境外轻量 VPS + Docker（推荐）

**适合**：想要 24/7 网页版 + 将来自动写公众号草稿箱。

**规格建议**：2 核 2G、40G 硬盘、Debian 12 或 Ubuntu 22.04，节点选香港/新加坡。
月成本约 ¥60–120（各家轻量服务器促销价浮动较大）。

### 步骤

```bash
# 1. 装 Docker（官方源）
curl -fsSL https://get.docker.com | sh
sudo systemctl enable --now docker

# 2. 传代码（任选其一）
git clone <你的仓库> /opt/my-window
# 或从本机推：scp -r "E:\软件项目设计\个人窗口" user@host:/opt/my-window

# 3. 配密钥
cd /opt/my-window
cp .env.example .env
vim .env        # 填 DEEPSEEK_API_KEY / MINIMAX_CN_API_KEY / XIAOMI_TOKEN_PLAN_CN_API_KEY
                 # 认证过的公众号再填 WECHAT_APP_ID / WECHAT_APP_SECRET

# 4. 起
docker compose up -d --build
docker compose logs -f window      # 看日志

# 5. 访问
#   http://<服务器IP>:4399
#   不用域名也不用备案（公众号稿里不放外链）

# 6. 微信白名单（只有认证号需要）
#   公众号后台 → 基本配置 → IP 白名单 → 填服务器公网 IP
```

### 日常运维

```bash
docker compose logs -f window        # 看日志
docker compose restart window        # 重启
docker compose up -d --build         # 改完代码后更新

# 备份数据（SQLite + 音频 + 图片）
docker run --rm -v my-window_window-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/data-$(date +%F).tgz /data
```

## 二、方案 B：GitHub Actions（零成本）

> 这条路能同时满足「每天自动出稿」+「24/7 随时打开网页版」，且 ¥0。
> 代价：静态页**公开**（拿到链接的人都能看），且不能自动写公众号草稿箱（无固定 IP）。

### 开启步骤

1. 推代码到仓库（私有也行）；
2. `Settings → Pages → Source` 选 **GitHub Actions**；
3. `Settings → Secrets and variables → Actions` 添加密钥：
   `DEEPSEEK_API_KEY`、`MINIMAX_CN_API_KEY`、`XIAOMI_TOKEN_PLAN_CN_API_KEY`（认证号再放 `WECHAT_APP_ID`/`WECHAT_APP_SECRET`）；
4. 打开 Actions 页手动 Run 一次 `daily-digest` 验证；
5. 成功后得到 `https://<你的用户名>.github.io/<仓库名>/`，手机加到主屏幕即可。

### 每天自动发生什么

```
23:05 UTC（北京 07:05）
  → 生成 5 个板块 + 公众号稿 + 3 张图 + 朗读音频
  → 导出到 data/exports/
  → 清理 30 天前的音频（站点总体积控制在 300 MB 内，Pages 上限 1 GB）
  → 发布静态站（index.html / images / audio）
  → 同时存一份 Artifact（可下载：含 wechat.html，粘进公众号后台用）
```

### 想更私密怎么办

- 把仓库设成**私有**（Pages 对私有仓库需要 Pro）；或
- 在站点上加一层访问密码（Cloudflare Pages 的 Zero Trust / Worker 代理）；或
- 直接用下面的 VPS 方案（IP 白名单、后续还能自动写草稿箱）。


**适合**：只要"每天自动生成一份稿子"，不需要 24/7 网页版。

```bash
# 1. 把代码推到一个仓库（可以私有）
git remote add origin git@github.com:<你>/my-window.git
git push -u origin main

# 2. 仓库 Settings → Secrets and variables → Actions 里加：
#    DEEPSEEK_API_KEY / MINIMAX_CN_API_KEY / XIAOMI_TOKEN_PLAN_CN_API_KEY
#    （认证号再 WECHAT_APP_ID / WECHAT_APP_SECRET）

# 3. Actions 页面启用 workflow；每天 23:05 UTC（= 北京 07:05）自动跑
#    跑完在 Artifacts 里下载 my-window-<run_id>，内含：
#      index.html    离线可读的当日全部内容
#      wechat.html   公众号稿（图片已换成可见占位）
#      images/       封面 + 讲次海报 + 配图
#      audio/        朗读音频
#      summary.md    文字摘要与来源列表
```

**注意**：GitHub Actions 的 runner 在境外，Edge TTS 反而更稳 ✓；但免费额度是私有仓库 2000 分钟/月，
这个任务每天几分钟，绰绰有余。

**网页版怎么办**：把 `data/exports/` 里的 `index.html` 推到 Cloudflare Pages / Vercel（免费静态托管），
就是一份可分享的静态日报。

## 三、方案 C：云函数（腾讯 SCF / 阿里 FC）

### 买机器清单（方案 A 用）

- **规格**：2 核 2G、40–60G SSD（数据库 + 音频，约每月 1–2 G 增量）；
- **系统**：Debian 12 或 Ubuntu 22.04；
- **节点**：香港 / 新加坡 / 日本（Edge TTS 要境外；国内节点延迟低但语音不稳）；
- **带宽**：1–3 Mbps 够用（每天约 10 MB 出站）；
- **公网 IP**：必须是固定 IP（微信白名单要用），别选 NAT 型实例；
- **价**：阿里云/腾讯云轻量服务器新用户活动价常见 38–99 元/月；
- **备案**：不需要（你不在国内节点，且公众号稿里不放外链）。

### 到手后 5 条命令

```bash
curl -fsSL https://get.docker.com | sh        # 1 装 Docker
git clone <你的仓库> /opt/my-window           # 2 拉代码
cd /opt/my-window && cp .env.example .env    # 3 配密钥
vim .env                                    #   填三个 API Key
docker compose up -d --build                 # 4 起服务+定时器
docker compose logs -f window                # 5 看日志
```


按量付费接近零，但要改三处：

- **SQLite 不能用**：换成云数据库（Postgres/D1），或干脆把每次生成结果写进对象存储；
- **超时**：抓 43 个源 + 8 次大模型调用 + 合成音频，函数要放宽到 15 分钟并拆分步骤；
- **TTS 要放境外**：函数主体在境内，Edge 语音不稳 → 语音单独用一个香港函数。

适合已有云函数基础设施的人；第一次做建议选 A 或 B。

## 四、方案 D：什么都不做，本机开机自启

```powershell
# 注册一个开机自启的任务（登录时启动服务）
schtasks /Create /TN "MyWindow" /TR "powershell -WindowStyle Hidden -File E:\软件项目设计\个人窗口\scripts\start-app.ps1" /SC ONLOGON /RL LIMITED
```

零成本，但电脑得一直开着。

## 五、本项目已上云的实际情况（2026-11-16 实测）

- 仓库：https://github.com/wq1151453723/my-window （**已转公开**，这样免费账户才能用 GitHub Pages）
- 公网网址：**https://wq1151453723.github.io/my-window/**（24/7，手机可开，9 篇文章 + 9 个音频播放器 + 配图）
- 公众号稿：`https://wq1151453723.github.io/my-window/wechat.html`（图片已换成「【在此插入图片：…】」占位）
- Actions：https://github.com/wq1151453723/my-window/actions （每天 23:05 UTC = 北京 07:05 自动跑）
- Secrets 已配三个大模型 Key；Pages 开关用仓库变量 `ENABLE_PAGES=true` 控制；
- 发布方式：工作流生成后**直推 gh-pages 分支**（不依赖 deploy-pages，省掉一层排队），Pages 源设为分支（legacy）。
- 首次云端运行实测：5m33s 完成生成 + 导出 + 清理 + 发布，产物 17.78 MB。

**注意**：GitHub 免费 runner 繁忙时会排队（实测等过 29 分钟），所以「每天 07:05 出稿」实际可能延后 5–30 分钟。

**踩坑（Windows 特有）**：用 PowerShell 5.1 的 `Get-Content -Raw` / `Set-Content` 处理 UTF-8 文件会按系统 ANSI 码页（本机 GBK）解码再写回，中文直接变成乱码。
本项目因此把线上 index.html 写坏过一次。**规则**：UTF-8 文件一律用 Node 处理（`fs.readFileSync/writeFileSync` + `utf8`），
或用 `Get-Content -Encoding UTF8` / `Set-Content -Encoding UTF8` 显式指定；网页文件优先整份用源文件覆盖，不做文本级替换。
（云端 Actions 跑在 Linux，不受此影响。）
要卡准点，就用方案 A（VPS + Docker，容器内定时器不受队列影响）。

## 六、迁移到云上要改什么

代码**零改动**。只需要：

1. 把 `data/` 目录带走（历史文章、课程进度、选题账本都在里面）；
2. 在云上 `.env` 里填同样的密钥；
3. 确认时区 `TZ=Asia/Shanghai`（容器已内置）；
4. 将来认证了公众号，补 `WECHAT_APP_ID` / `WECHAT_APP_SECRET` + 服务器 IP 白名单 → 「写入草稿箱」即刻生效。

## 六、升级路径回顾

| 阶段 | 账号 | 发布方式 | 成本 |
|---|---|---|---|
| 现在 | 个人订阅号 | 半自动（复制正文 + 插图，约 1 分钟） | ¥0 |
| 以后 | 个体工商户认证订阅号 | 自动写草稿箱，你点发表 | 服务器 ¥60–120/月 + 认证 ¥300/年 |
## 网页端静态站（手机优先）

- 产物：`scripts/export-today.ts` → `data/exports/site/`（`index.html` + `images/` + `audio/` + `wechat.html`）。
- 版式：粘性顶栏 → 封面横幅 → 「今天读什么」+ 三个数字卡（课程讲次 / 本周工具数 / 今日上涨指数）→ 目录锚点 → 五张板块卡。
- 每张卡片：板块标签 + 衬线大标题 + 板块配图 + 摘要 + 要点 + 「读完整讲解」折叠正文 + 音频条。
- 手机优先：单列、16–17px 正文、触达 ≥44px、含安全区内边距；字号收敛到 8 档以内，次要文字对比度 ≥4.5:1。
- 公众号稿（`wechat.html`）另存一份，图片替换为「【在此插入图片：…】」占位，粘进后台不裂图。
- 发布：Actions 每日生成后直推 `gh-pages` 分支（Pages 源=分支），不用 deploy-pages，少一层排队。
