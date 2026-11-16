/**
 * 数据源自检脚本：一条命令跑完所有源与标的的实测结果。
 * 用法：npx tsx src/server/sources/_check.ts
 */
import { FEEDS, fetchFeed } from './rss.js';
import { fetchWeeklyHotRepos, hasGitHubToken } from './github.js';
import { fetchHistory, fetchQuotes } from './market.js';
import { fetchText, getRequestCount } from './http.js';

/** 中文按两个字符宽度计算，保证表格对齐 */
function displayWidth(text: string): number {
  let width = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    width += (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe30 && code <= 0xfe6f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6)
      ? 2
      : 1;
  }
  return width;
}

function pad(text: string, width: number): string {
  const diff = width - displayWidth(text);
  return diff > 0 ? text + ' '.repeat(diff) : text;
}

function truncate(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length <= max ? text : chars.slice(0, max - 1).join('') + '…';
}

function line(char = '-', width = 120): string {
  return char.repeat(width);
}

function section(title: string): void {
  console.log('');
  console.log('='.repeat(120));
  console.log(title);
  console.log('='.repeat(120));
}

const FEED_LIMIT = 8;
const QUOTE_SYMBOLS = [
  '^GSPC',
  '^IXIC',
  '^DJI',
  '^HSI',
  '000001.SS',
  '399001.SZ',
  '399006.SZ',
  '000300.SS',
  '600519.SS',
  '300750.SZ',
  '0700.HK',
  'AAPL',
  'MSFT',
  'NVDA',
  'BABA',
  'TSLA',
  '^VIX',
  'GC=F',
  'CL=F',
  'DX-Y.NYB',
  'BTC-USD',
];
const HISTORY_SYMBOLS = ['^GSPC', '000001.SS', 'AAPL', '0700.HK', '^VIX', 'BTC-USD'];
const HISTORY_DAYS = 30;

async function main(): Promise<void> {
  const startedAt = Date.now();
  console.log('我的窗口 · 数据源实测自检');
  console.log(`开始时间: ${new Date(startedAt).toISOString()}`);
  console.log(`GitHub 令牌: ${hasGitHubToken() ? '已获取（gh auth token）' : '不可用，退化为未授权调用（60 次/小时）'}`);

  // ---------------- 1. RSS / Atom 源 ----------------
  section('一、RSS / Atom 订阅源实测');
  const feedRows: Array<{ id: string; name: string; category: string; count: number; latest: string; status: string; sample: string; error: string }> = [];
  for (const feed of FEEDS) {
    const items = await fetchFeed(feed, FEED_LIMIT);
    const latest = items[0]?.publishedAt ?? '-';
    let error = '';
    if (items.length === 0) {
      const probe = await fetchText(feed.url, { timeoutMs: 18000, retries: 1 });
      error = probe.ok ? '解析出 0 条（源为空壳或结构不匹配）' : (probe.error ?? '未知错误');
    }
    feedRows.push({
      id: feed.id,
      name: feed.name,
      category: feed.category,
      count: items.length,
      latest,
      status: items.length > 0 ? 'OK' : 'FAIL',
      sample: items[0]?.title ?? '',
      error,
    });
    console.log(
      `[${items.length > 0 ? 'OK  ' : 'FAIL'}] ${pad(feed.id, 18)} ${pad(feed.category, 15)} 条数=${String(items.length).padStart(3)} 最新=${latest}  ${truncate(items[0]?.title ?? '', 46)}${items.length === 0 ? '  原因: ' + error : ''}`,
    );
  }
  const okFeeds = feedRows.filter((r) => r.status === 'OK');
  const failFeeds = feedRows.filter((r) => r.status === 'FAIL');
  console.log('');
  console.log(`订阅源汇总: 通过 ${okFeeds.length} / ${FEEDS.length}，失败 ${failFeeds.length}`);
  if (failFeeds.length) {
    console.log(`失败源: ${failFeeds.map((r) => r.id).join(', ')}`);
    for (const row of failFeeds) console.log(`  - ${row.id}: ${row.error}`);
  }

  // ---------------- 2. GitHub ----------------
  section('二、GitHub 近 7 天高星新仓库实测');
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  console.log(`since = ${since.toISOString()}，目标数量 5`);
  const repos = await fetchWeeklyHotRepos(since, 5);
  if (repos.length === 0) {
    console.log('[FAIL] 没有取到任何仓库');
  }
  for (const repo of repos) {
    const created = new Date(repo.createdAt).getTime();
    const fresh = created > since.getTime();
    console.log(
      `[${fresh ? 'OK  ' : 'FAIL'}] ${pad(repo.fullName, 34)} star=${String(repo.stars).padStart(6)} 创建=${repo.createdAt} 语言=${repo.language ?? '-'} 许可证=${repo.license ?? '-'} README=${repo.readmeExcerpt?.length ?? 0}字符`,
    );
    console.log(`        ${repo.description || '(无描述)'}`);
    console.log(`        ${repo.url}`);
  }
  const allFresh = repos.length > 0 && repos.every((r) => new Date(r.createdAt).getTime() > since.getTime());
  const withReadme = repos.filter((r) => (r.readmeExcerpt?.length ?? 0) > 0).length;
  console.log('');
  console.log(`仓库汇总: ${repos.length} 个，createdAt 全部晚于 since: ${allFresh ? '是' : '否'}，带 README 摘录: ${withReadme}/${repos.length}`);

  // ---------------- 3. 行情 ----------------
  section('三、实时行情实测');
  const quotes = await fetchQuotes(QUOTE_SYMBOLS);
  for (const quote of quotes) {
    console.log(
      `[OK  ] ${pad(quote.symbol, 12)} ${pad(quote.name, 12)} 价格=${String(quote.price).padStart(11)} 涨跌幅=${String(quote.changePct).padStart(7)}% 币种=${quote.currency ?? '-'}`,
    );
  }
  const missing = QUOTE_SYMBOLS.filter((s) => !quotes.some((q) => q.symbol === s));
  const prices = new Set(quotes.map((q) => q.price));
  const nonZero = quotes.filter((q) => q.price > 0).length;
  console.log('');
  console.log(`行情汇总: ${quotes.length}/${QUOTE_SYMBOLS.length} 个标的返回报价，非零价格 ${nonZero} 个，不同价格 ${prices.size} 个`);
  if (missing.length) console.log(`未返回: ${missing.join(', ')}`);

  section('四、历史日线实测');
  for (const symbol of HISTORY_SYMBOLS) {
    const series = await fetchHistory(symbol, HISTORY_DAYS);
    const consistent = series.t.length === series.c.length && series.t.length > 0;
    const last = series.c.length ? series.c[series.c.length - 1] : 0;
    const first = series.c.length ? series.c[0] : 0;
    console.log(
      `[${consistent ? 'OK  ' : 'FAIL'}] ${pad(symbol, 12)} 点数=${String(series.t.length).padStart(4)} 首值=${first} 末值=${last} 末点时间=${series.t.length ? new Date(series.t[series.t.length - 1]).toISOString().slice(0, 10) : '-'}`,
    );
  }

  section('五、异常输入降级验证（必须全部返回空数组且不抛错）');
  const bogusFeed = { id: 'bogus', name: '不存在的源', category: 'global-world' as const, url: 'https://example.invalid/definitely-not-a-feed.xml' };
  const badFeedItems = await fetchFeed(bogusFeed, 5);
  const badQuotes = await fetchQuotes(['__NOT_A_SYMBOL__', 'ZZZZZ', '']);
  const badHistory = await fetchHistory('__NOT_A_SYMBOL__', 10);
  const futureRepos = await fetchWeeklyHotRepos(new Date(Date.now() + 30 * 24 * 3600 * 1000), 5);
  console.log(`失效源 fetchFeed -> 条数 ${badFeedItems.length}（期望 0）`);
  console.log(`无效代码 fetchQuotes -> 条数 ${badQuotes.length}（期望 0）`);
  console.log(`无效代码 fetchHistory -> 点数 ${badHistory.t.length}（期望 0）`);
  console.log(`未来时间 fetchWeeklyHotRepos -> 仓库数 ${futureRepos.length}（期望 0）`);
  const negativesPass =
    badFeedItems.length === 0 &&
    badQuotes.length === 0 &&
    badHistory.t.length === 0 &&
    badHistory.c.length === 0 &&
    futureRepos.length === 0;
  console.log(`负向用例全部通过: ${negativesPass ? '是' : '否'}`);

  section('六、总计');
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`耗时: ${elapsed} 秒`);
  console.log(`出网请求次数（含重试）: ${getRequestCount()}`);
  console.log(`订阅源通过率: ${okFeeds.length}/${FEEDS.length}`);
  console.log(`GitHub 仓库数: ${repos.length}`);
  console.log(`行情标的数: ${quotes.length}`);
}

main().then(
  () => {
    console.log('');
    console.log('自检结束：正常退出');
    process.exit(0);
  },
  (err) => {
    console.error('自检异常：', err);
    process.exit(1);
  },
);
