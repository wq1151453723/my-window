# 数据源清单（本机实测）

> 本文件不是网上抄的清单，是在这台机器上用 `npx tsx src/server/sources/_check.ts` 一条命令跑出来的实测结果。
> 最近一次全量实测：**2026-11-16 19:47（北京时间）**，耗时 **104.0 秒**，出网请求 **70 次**（含重试），订阅源 **43/43 全部通过**，行情 **21/21**，GitHub 仓库 **5/5**。

## 一、代码位置与用法

| 文件 | 职责 |
|---|---|
| `src/server/sources/http.ts` | 统一出网层：超时、重试、并发闸门、字符集解码（BOM / XML 声明 / HTTP 头 / GBK 兜底） |
| `src/server/sources/rss.ts` | `FEEDS` 订阅源清单 + `fetchFeed()`（RSS 2.0 / Atom / RSS 1.0 RDF 三种结构统一） |
| `src/server/sources/github.ts` | `fetchWeeklyHotRepos()`（GitHub Search API + README 摘录） |
| `src/server/sources/market.ts` | `fetchQuotes()` / `fetchHistory()`：东方财富实时报价与日线 + CBOE 官方 VIX + Gate.io 加密货币 |
| `src/server/sources/_check.ts` | 自检脚本，一条命令打印全部实测结果 |

```bash
# 全量自检（唯一命令）
npx tsx src/server/sources/_check.ts
```

调用示例：

```ts
import { FEEDS, fetchFeed } from './sources/rss.js';
import { fetchWeeklyHotRepos } from './sources/github.js';
import { fetchQuotes, fetchHistory } from './sources/market.js';

const items = await fetchFeed(FEEDS.find(f => f.id === 'wallstreetcn')!, 10);
const repos = await fetchWeeklyHotRepos(new Date(Date.now() - 7 * 864e5), 5);
const quotes = await fetchQuotes(['^GSPC', '000001.SS', 'AAPL', '^VIX', 'BTC-USD']);
const series = await fetchHistory('^GSPC', 30);
```

**降级约定**：`fetchFeed` / `fetchQuotes` / `fetchHistory` / `fetchWeeklyHotRepos` 遇失效源、无效代码、网络异常一律返回空数组或空序列，**绝不抛异常**。自检脚本第 5 节专门验证了这一点。

## 二、实测通过的订阅源（43 个）

「条数」为自检脚本抓取条数上限 8 条时的实际条数；「最新发布」为该源最新一条的发布时间（北京时间）。

### 2.1 中文源（17 个，要求 ≥ 6）

| 名称 | URL | 分类 | 条数 | 最新发布（北京） |
|---|---|---|---|---|
| 中国新闻网·财经 | https://www.chinanews.com.cn/rss/finance.xml | cn-finance | 8 | 2026-11-16 19:41 |
| 中国新闻网·滚动新闻 | https://www.chinanews.com.cn/rss/scroll-news.xml | global-world | 8 | 2026-11-16 19:41 |
| 东方财富·资讯 | https://rss.eastmoney.com/rss_partener.xml | cn-finance | 8 | 2026-11-16 18:43 |
| 华尔街见闻 | https://dedicated.wallstreetcn.com/rss.xml | cn-finance | 8 | 2026-11-16 19:28 |
| 界面新闻 | https://a.jiemian.com/index.php?m=article&a=rss | cn-finance | 8 | 2026-11-16 19:38 |
| 经济观察网 | https://www.eeo.com.cn/rss.xml | cn-finance | 1 | 2026-11-16 18:51 |
| 量子位 | https://www.qbitai.com/feed | cn-tech | 8 | 2026-11-14 18:08 |
| 少数派 | https://sspai.com/feed | cn-tech | 8 | 2026-11-16 18:09 |
| InfoQ 中文 | https://www.infoq.cn/feed | cn-tech | 8 | 2026-11-17 02:01 |
| 钛媒体 | https://www.tmtpost.com/feed | cn-tech | 8 | 2026-11-16 19:30 |
| 极客公园 | http://www.geekpark.net/rss | cn-tech | 8 | 2026-11-16 08:47 |
| 爱范儿 | https://www.ifanr.com/feed | cn-tech | 8 | 2026-11-16 18:53 |
| 雷锋网 | https://www.leiphone.com/feed | cn-tech | 8 | 2026-11-16 16:59 |
| IT 之家 | https://www.ithome.com/rss/ | cn-tech | 8 | 2026-11-16 19:30 |
| Solidot 奇客的资讯 | https://www.solidot.org/index.rss | cn-tech | 8 | 2026-11-16 18:33 |
| 联合国新闻（中文） | https://news.un.org/feed/subscribe/zh/news/all/rss.xml | global-world | 8 | 2026-11-13 20:00 |
| 阮一峰的网络日志（科技爱好者周刊·读书笔记） | https://www.ruanyifeng.com/blog/atom.xml | books | 3 | 2026-11-13 08:08 |

### 2.2 国际源（26 个，要求 ≥ 8）

| 名称 | URL | 分类 | 条数 | 最新发布（北京） |
|---|---|---|---|---|
| CNBC Markets | https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664 | global-finance | 8 | 2026-11-16 11:53 |
| CNBC Top News | https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114 | global-finance | 8 | 2026-11-16 18:44 |
| WSJ Markets | https://feeds.content.dowjones.io/public/rss/RSSMarketsMain | global-finance | 8 | 2026-11-16 19:35 |
| MarketWatch 头条 | https://www.marketwatch.com/rss/topstories | global-finance | 8 | 2026-11-16 19:15 |
| Seeking Alpha 市场快讯 | https://seekingalpha.com/market_currents.xml | global-finance | 7 | 2026-11-16 19:46 |
| 欧洲央行 ECB 新闻 | https://www.ecb.europa.eu/rss/press.html | global-finance | 8 | 2026-11-16 16:30 |
| 美联储 Fed 新闻 | https://www.federalreserve.gov/feeds/press_monetary.xml | global-finance | 8 | 2026-11-13 01:45 |
| United Nations News | https://news.un.org/feed/subscribe/en/news/all/rss.xml | global-world | 8 | 2026-11-15 20:00 |
| France 24 | https://www.france24.com/en/rss | global-world | 8 | 2026-11-16 19:43 |
| NPR World | https://feeds.npr.org/1004/rss.xml | global-world | 8 | 2026-11-16 18:00 |
| NPR News | https://feeds.npr.org/1001/rss.xml | global-world | 8 | 2026-11-16 18:00 |
| Sky News World | https://feeds.skynews.com/feeds/rss/world.xml | global-world | 8 | 2026-11-16 18:11 |
| Politico | https://rss.politico.com/politics-news.xml | global-world | 8 | 2026-11-16 18:45 |
| CNBC World | https://www.cnbc.com/id/100727362/device/rss/rss.html | global-world | 8 | 2026-11-16 18:44 |
| WSJ World News | https://feeds.content.dowjones.io/public/rss/RSSWorldNews | global-world | 8 | 2026-11-16 18:57 |
| Slashdot | https://rss.slashdot.org/Slashdot/slashdotMain | global-world | 8 | 2026-11-16 16:34 |
| MIT Technology Review | https://www.technologyreview.com/feed/ | ai | 8 | 2026-11-13 21:10 |
| MarkTechPost | https://www.marktechpost.com/feed/ | ai | 8 | 2026-11-16 18:39 |
| The Decoder | https://the-decoder.com/feed/ | ai | 8 | 2026-11-15 23:42 |
| TechCrunch | https://techcrunch.com/feed/ | ai | 8 | 2026-11-16 15:00 |
| Ars Technica | https://feeds.arstechnica.com/arstechnica/index | ai | 8 | 2026-11-16 07:11 |
| Nature | https://www.nature.com/nature.rss | ai | 8 | 2026-11-16 08:00 |
| Hackaday | https://hackaday.com/feed/ | ai | 7 | 2026-11-16 17:00 |
| CNBC Technology | https://www.cnbc.com/id/19854910/device/rss/rss.html | ai | 8 | 2026-11-16 18:33 |
| LessWrong（含大量书评序列） | https://lesswrong.com/feed.xml?view=recent-rss | books | 8 | 2026-11-16 14:56 |
| Quanta Magazine | https://www.quantamagazine.org/feed/ | books | 5 | 2026-11-13 03:40 |

> 说明：经济观察网低频（当日仅 1 条）、阮一峰与 Quanta 本身是低频博客，所以条数小于 8 属正常，不是抓取失败。

## 三、GitHub 近 7 天高星新仓库（实测 5 个）

Search API：`GET https://api.github.com/search/repositories?q=created:>YYYY-MM-DD+stars:>N&sort=stars&order=desc`
令牌来自 `gh auth token`（`C:\Program Files\GitHub CLI\gh.exe`，实测取到 40 位令牌，认证后 core 限额 5000/小时、search 30/分钟）；令牌不可用时自动退化为未授权调用（60 次/小时，够每日任务）。令牌只进 `Authorization` 头，不落日志、不落文档。

实测输出（since = 2026-11-09T11:48:02Z）：

| 仓库 | star | 创建时间（UTC） | 语言 | 许可证 | README 摘录 |
|---|---|---|---|---|---|
| deepseek-ai/chat-demo | 3796 | 2026-11-12T08:08:19Z | TypeScript | MIT | 4000 字符 |
| apex-compute/ANR | 2349 | 2026-11-11T04:27:17Z | C++ | - | 4000 字符 |
| Kianuni/Erosion-CN | 2174 | 2026-11-10T02:37:31Z | Swift | GPL-3.0 | 4000 字符 |
| hitkeeen/blender-ai-mcp-addon | 1920 | 2026-11-12T14:32:15Z | - | MIT | 4000 字符 |
| FrigadeHQ/yogurt | 1759 | 2026-11-10T20:01:01Z | TypeScript | MIT | 4000 字符 |

- **createdAt 全部晚于 since：已验证**（代码里二次过滤，不会返回窗口外的仓库；传入未来时间时返回空数组）。
- README 走 `GET /repos/{fullName}/readme`（`Accept: application/vnd.github.raw`），截断到 4000 字符；返回 JSON 时自动 base64 解码。
- 星数阈值按 `50 → 20 → 10 → 5 → 1` 逐级放宽，直到凑够目标数量（新仓库星数普遍偏低，硬用高阈值会颗粒无收）。

## 四、行情（实测 21 个标的 + 6 条日线）

三条数据通道：

| 通道 | 接口 | 覆盖 |
|---|---|---|
| 东方财富（主） | `push2.eastmoney.com/api/qt/ulist.np/get`（报价）、`push2his.eastmoney.com/api/qt/stock/kline/get`（日线） | A 股 / 港股 / 美股 / 全球指数 / 期货 / 美元指数 |
| CBOE 官方（VIX） | `cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv` | 标普500波动率指数 |
| Gate.io（加密货币） | `api.gateio.ws/api/v4/spot/tickers`、`.../candlesticks` | 比特币 / 以太坊 / Solana |

Yahoo Finance `query1.finance.yahoo.com` **在本网络返回 403**（中文拦截页），代码里保留为兜底通道，实测不作为主力。

### 4.1 实时报价（21/21 全部返回，21 个非零价格，21 个互不相同）

| symbol | 名称 | 价格 | 涨跌幅 | 币种 |
|---|---|---|---|---|
| ^GSPC | 标普500 | 7561.67 | -0.40% | USD |
| ^IXIC | 纳斯达克 | 25136.27 | -0.91% | USD |
| ^DJI | 道琼斯 | 52347.55 | +0.10% | USD |
| ^HSI | 恒生指数 | 23753.84 | +0.49% | HKD |
| 000001.SS | 上证指数 | 3602.57 | -0.87% | CNY |
| 399001.SZ | 深证成指 | 10690.78 | -2.53% | CNY |
| 399006.SZ | 创业板指 | 2320.02 | -4.37% | CNY |
| 000300.SS | 沪深300 | 3979.80 | -0.91% | CNY |
| 600519.SS | 贵州茅台 | 1453.90 | +1.30% | CNY |
| 300750.SZ | 宁德时代 | 240.50 | +1.18% | CNY |
| 0700.HK | 腾讯控股 | 390.40 | +0.98% | HKD |
| AAPL | 苹果 | 356.27 | +0.39% | USD |
| MSFT | 微软 | 523.88 | +0.17% | USD |
| NVDA | 英伟达 | 162.85 | -2.01% | USD |
| BABA | 阿里巴巴 | 94.38 | +0.02% | USD |
| TSLA | 特斯拉 | 390.22 | -1.82% | USD |
| ^VIX | 标普500波动率指数(VIX) | 19.30 | +3.21% | USD |
| GC=F | COMEX黄金 | 3878.20 | -0.21% | USD |
| CL=F | NYMEX原油 | 88.19 | -0.42% | USD |
| DX-Y.NYB | 美元指数 | 103.54 | +0.13% | USD |
| BTC-USD | 比特币 | 64535.70 | -1.50% | USD |

> 不会把同一个数当成全部结果：21 个标的 21 个不同价格。

### 4.2 历史日线（t/c 长度一致且非空）

| symbol | 点数 | 首值 | 末值 | 末点日期 |
|---|---|---|---|---|
| ^GSPC | 30 | 7773.95 | 7561.67 | 2026-11-13 |
| 000001.SS | 30 | 3830.45 | 3602.57 | 2026-11-16 |
| AAPL | 30 | 332.62 | 356.27 | 2026-11-13 |
| 0700.HK | 30 | 423.00 | 390.40 | 2026-11-16 |
| ^VIX | 30 | 15.52 | 19.30 | 2026-11-13 |
| BTC-USD | 30 | 82110.80 | 64506.90 | 2026-11-16 |

### 4.3 symbol 解析规则

- 内置映射表：`^GSPC→100.SPX`、`^IXIC→100.NDX`、`^DJI→100.DJIA`、`^HSI→100.HSI`、`000001.SS→1.000001`、`399001.SZ→0.399001`、`600519.SS→1.600519`、`0700.HK→116.00700`、`AAPL→105.AAPL`、`BABA→106.BABA`、`GC=F→101.GC00Y`、`CL=F→102.CL00Y`、`DX-Y.NYB→100.UDI` 等。
- 规则解析：`600519.SS→上海`、`002594.SZ→深圳`、`0700.HK→港股（补零）`、`600519→按代码首位判市场`。
- 未收录的代码按美股处理，一次请求同时带 `105./106./107.` 三个市场前缀探测，谁有数据用谁；全都查不到就跳过（返回空数组，不抛错）。
- 东方财富市场前缀：`0`=深圳、`1`=上海、`100`=全球指数、`101`=COMEX 期货、`102`=NYMEX 期货、`105`=纳斯达克、`106`=纽交所、`107`=美交所、`116`=港股、`133`=外汇。

## 五、失败源与失败原因

### 5.1 中文源

| 名称 | URL | 失败原因 | 可行替代方案 |
|---|---|---|---|
| 新浪财经·滚动 | https://rss.sina.com.cn/roll/finance/hot_roll.xml | HTTP 200 但返回 **2480 字节空壳 XML**（整段版权注释，无 `<item>`），源已废弃 | 改用中新网财经 / 东方财富 / 华尔街见闻 / 界面新闻 |
| 新浪·滚动要闻 | https://rss.sina.com.cn/news/marquee/ddt.xml | 只有 1 条且为旧闻，无 `pubDate` | 同上 |
| 新浪·科技滚动 | https://rss.sina.com.cn/tech/rollnews.xml | 最新一条 **2018-09-23**，早已停更 | 改用 IT 之家 / Solidot / 爱范儿 |
| 虎嗅 | https://www.huxiu.com/rss/0.xml | **阿里云 WAF 拦截**（返回 `meta aliyun_waf_aa` 的 JS 质询页，非 RSS） | 需带 Cookie 或走浏览器渲染后用 cheerio 解析质询页；本次未做，暂缺 |
| 财新 | https://www.caixin.com/rss/all.xml | 返回 HTML 落地页（无 RSS），路径已废弃 | 需解析 `www.caixin.com` 列表页 HTML（cheerio） |
| 第一财经 | https://www.yicai.com/api/ajax/getRssFeed?type=news | 返回 HTML（带 `yc_autologin.js` 登录脚本），接口已改版 | 需改用其列表页 JSON 接口并带登录态 |
| 36 氪 | https://36kr.com/feed | 返回 SPA 空壳 HTML（25361 字节），无 RSS；`/api/newsflash` 同样返回 SPA | 需解析其 `gateway.36kr.com` JSON 网关 |
| 机器之心 | https://www.jiqizhixin.com/rss | 返回 SPA HTML；`/api/v4/articles.json` 返回 **404「没有权限访问的页面」** | 需带鉴权头或改用其 Web 页面解析 |
| 人民网·时政 | http://www.people.com.cn/rss/politics.xml | 源仍可访问但 **最新一条 2025-06-05**，已停更 | 改用中新网滚动 / 界面新闻 |
| 新华网·时政 | http://www.xinhuanet.com/politics/news_politics.xml | 源仍可访问但 **最新一条 2022-12-14**；且日期是裸文本节点（`Wed,14-Dec-2022 ... GMT`）而非 `<pubDate>` 标签 | 改用中新网滚动 |
| 央视新闻 | https://news.cctv.com/rss/world.xml | **404** | 可行的官方接口（已实测返回数据）：`https://news.cctv.com/2019/07/gaiban/cmsdatainterface/page/world_1.jsonp?cb=world`，返回 JSONP，解析需剥掉 `world(` 包裹 |
| 华尔街见闻 API | https://api.wallstreetcn.com/apiv1/content/lives?channel=global-channel&limit=20 | **403** | 已改用 `https://dedicated.wallstreetcn.com/rss.xml`（实测 8 条、实时） |
| 同花顺 / 金十 / 证券之星 / 环球网 | news.10jqka.com.cn / www.jin10.com / stock.stockstar.com / rss.huanqiu.com | 解析结果 0 条（返回 JSON/HTML，非 RSS，或结构不匹配） | 需按各自 JSON 接口单独写解析器 |
| 豆瓣读书 | https://book.douban.com/feed/ | **403**（豆瓣反爬） | 需带 Cookie |

### 5.2 国际源

以下站点在本机网络（经本地代理出网）**连接超时 / 被重置**，实测无法抓取：
BBC（`feeds.bbci.co.uk`）、The Guardian（`www.theguardian.com/world/rss`）、纽约时报（`rss.nytimes.com`、`cn.nytimes.com`）、
Hacker News（`news.ycombinator.com/rss`、`hnrss.org`）、Financial Times（`www.ft.com/rss/home`）、Al Jazeera、
The Economist、TIME、CBC、ABC Australia、CNA、Nikkei Asia、Taipei Times、Japan Times、The Hindu、Euronews、Deutsche Welle、
Reuters、ScMP、Google News、China Daily 等。
其中 `hnrss.org`、`news.google.com`、`rss.cnn.com`、`cn.nytimes.com`、`www.euronews.com`、`asia.nikkei.com` 的 DNS 返回被污染的 IP，握手后 5 秒内断开。

已找到并采用的替代：NPR、Sky News、France 24、联合国新闻、Politico、CNBC、WSJ、MarketWatch、Seeking Alpha、ECB、Fed、MIT Tech Review、MarkTechPost、The Decoder、TechCrunch、Ars Technica、Nature、Hackaday、Slashdot、LessWrong、Quanta。

## 六、踩到的坑与绕过办法

1. **本机走本地代理，且代理并发很弱**
   环境变量 `HTTP_PROXY / HTTPS_PROXY = http://127.0.0.1:7899`、`NODE_USE_ENV_PROXY=1`。
   并发超过 3 个连接就会随机报 `connect EADDRINUSE 127.0.0.1:7899`——这是代理端的连接 backlog 不够，不是目标站点的问题。
   **绕过**：`http.ts` 里做了全局并发闸门（上限 **2**）+ 指数退避重试（默认重试 3 次，`800ms×2^n`，上限 5 秒，带随机抖动；遇到 EADDRINUSE 额外多退 1.2 秒）。
   曾用并发 12 批量探测时，sina / chinanews 等国内源成片失败；降到并发 2~3 后同一个 URL 立刻成功。

2. **代理偶发抽风，同一个源会时好时坏**
   同一轮实测里，`eastmoney-rss` / `wallstreetcn` / `jiemian` / `eeo` 四个中文源在某一轮全部失败（并发 3 + 重试 2），单独复测却全部 200 且耗时 < 600ms——原因是当时本机还有其它任务同时出网，代理被打满。
   **绕过**：把并发降到 2、重试提到 3 次并加退避与抖动；并在自检脚本里对失败源补打一次「失败原因」，避免下次只能靠猜。加固后连续两轮 43/43 全通过。

3. **必须带浏览器 User-Agent**
   部分站点对 Node 默认 UA 直接 403。统一在 `http.ts` 固定 UA + `Accept-Language`，所有请求必带。

4. **「声明 utf-8、实际 GBK」的国内源**
   中国新闻网 / IT 之家 / 极客公园 / InfoQ / 新华网 等返回的字节其实是 GBK/GB2312，但 XML 声明写的是 utf-8。
   直接按 utf-8 解会得到一堆 `�`。
   **绕过**：`decodeBuffer()` 先按声明解码，若替换字符 `U+FFFD` 超过 4 个，就改用 `gb18030`（Node 24 自带 full-ICU，`new TextDecoder('gbk')` 可用）重解，取替换字符更少的那个。
   另外 `东方财富` 的 XML 带 UTF-8 BOM，已在解码前剥离。

5. **UTF-16 / Latin-1 源**
   `Slashdot` 声明 `ISO-8859-1`、`Nature` 是 RDF 1.0；已把 `iso-8859-1` 映射到 `windows-1252`，并用 `removeNSPrefix: true` 把 `dc:date` / `content:encoded` 归一化成 `date` / `encoded`。

6. **三种订阅格式要一起处理**
   RSS 2.0（`rss.channel.item`）、Atom（`feed.entry`，且 `link` 是带 `rel/href` 的数组）、RSS 1.0/RDF（`RDF.item`，日期在 `dc:date`）。
   `fast-xml-parser` 开了 `parseTagValue: false`（避免把日期、版本号转成数字）、`htmlEntities: true`（否则 `&nbsp;` 之类会解析失败）。

7. **XML 里混进裸文本节点**
   新华网的 RSS 把日期直接写成文本节点 `Wed,14-Dec-2022 11:37:37 GMT`，不包在任何标签里——这不是合法 RSS，但 XML 仍能解析；处理方式是要么忽略、要么用正则兜底。

8. **死源与僵尸源要一起筛**
   HTTP 200 ≠ 源还能用。实测中新浪财经（空壳 XML）、新浪科技（停在 2018 年）、新浪要闻（1 条旧闻）、人民网（停在 2025-06）、新华网（停在 2022-12）、华尔街见闻 `feeds.a.dj.com`（停在 2025-01）、Nature Books（0 条）都返回 200。
   **绕过**：自检脚本强制输出每个源的「条数 + 最新发布时间」，任何一条最新时间早于一周都要当成失败源处理并替换。WSJ 的可用品在 `feeds.content.dowjones.io`，不在 `feeds.a.dj.com`。

9. **Yahoo Finance 在本网络被 403**
   `query1.finance.yahoo.com` / `query2.finance.yahoo.com` 全部返回 403 中文拦截页，带 Cookie/Crumb 流程也拿不到（`fc.yahoo.com` 返回 404）。
   **绕过**：主通道改用东方财富（覆盖 A 股 / 港股 / 美股 / 全球指数 / 期货 / 美元指数），Yahoo 保留为兜底。

10. **VIX 与比特币在东方财富都没有现货 secid**
    试过 `100.VIX`、`118/119/120.BTCUSD` 全部 `rc=102`（无效代码）；`searchapi.eastmoney.com/api/suggest/get` 搜「VIX」「比特币」只能搜到 ETF（VIXY / IBIT），不是指数与现货。
    **绕过**：VIX 改用 **CBOE 官方** `VIX_History.csv`（权威、可直接算涨跌幅与日线）；比特币改用 **Gate.io 公开行情接口**（币安 / OKX / Coinbase / Huobi / MEXC / Kraken / CoinGecko 在本网络全部超时或断连，只有 Gate.io 通）。

11. **GitHub 令牌在 Windows 上要单独取**
    `gh auth token` 的可执行文件是 `C:\Program Files\GitHub CLI\gh.exe`；PATH 上还有一个 `gh.cmd` 包装器，用 `execFileSync` 直接跑 `.cmd` 会失败，必须落到 `execSync('gh auth token')`。代码里三种方式依次兜底，且令牌只进 `Authorization` 头，不落日志、不落文档。

12. **GitHub 搜索的星数阈值不能一次定死**
    近 7 天新建的仓库普遍只有几十星，`stars:>100` 会返回空。按 `50 → 20 → 10 → 5 → 1` 逐级放宽既省调用（search 限额 30/分钟）又能凑够数。

13. **别把「没有权限」当成「没有内容」**
    机器之心的 `/api/v4/articles.json` 返回 404 且正文是「没有权限访问的页面」——这类需要鉴权，不能当公开源用。

14. **请求预算**
    单次自检 43 个源 + GitHub（1 次搜索 + 5 次 README）+ 行情（1 次批量报价 + 2 次 VIX + 1 次 Gate 报价 + 6 次日线 + 失败源补诊断）= **70 次请求 / 104 秒**，单请求超时 15~20 秒，在预算内。

## 七、后续维护

- 源失效的信号：自检输出里「条数 = 0」或「最新发布时间」明显过旧。把该源从 `FEEDS` 里去掉并替换，替换源必须先在本机跑过一次确认条数与时间。
- 新增源时优先选官方 RSS（`/feed`、`/rss`、`/atom.xml`），本项目实测过的可用路径见上表。
- 行情侧新增标的时，先用 `https://searchapi.eastmoney.com/api/suggest/get?input=<关键词>&type=14` 查 secid，再写进 `market.ts` 的 `SECID_MAP`；指数/加密货币不在东方财富的，用 CBOE / Gate.io 那两条通道。
- 如果换网络环境（不走代理），需要重新验证第五节里那批被墙的国际源。
