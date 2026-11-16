import { XMLParser } from 'fast-xml-parser';
import { fetchText } from './http.js';

/** 一条资讯条目（跨 RSS / Atom / RDF 统一后的形状） */
export interface FeedItem {
  title: string;
  url: string;
  publishedAt?: string;
  summary?: string;
  source: string;
}

/** 一个订阅源 */
export interface FeedSource {
  id: string;
  name: string;
  category: 'cn-finance' | 'cn-tech' | 'global-finance' | 'global-world' | 'ai' | 'books';
  url: string;
}

/**
 * 实测通过的订阅源清单（2026-11 于本机逐个跑过，详见 docs/SOURCES.md）。
 * 中文源 >= 6，国际源 >= 8；全部走标准 RSS/Atom。
 */
export const FEEDS: FeedSource[] = [
  // ---------- 中文 · 财经 ----------
  { id: 'chinanews-finance', name: '中国新闻网·财经', category: 'cn-finance', url: 'https://www.chinanews.com.cn/rss/finance.xml' },
  { id: 'chinanews-scroll', name: '中国新闻网·滚动新闻', category: 'global-world', url: 'https://www.chinanews.com.cn/rss/scroll-news.xml' },
  { id: 'eastmoney-rss', name: '东方财富·资讯', category: 'cn-finance', url: 'https://rss.eastmoney.com/rss_partener.xml' },
  { id: 'wallstreetcn', name: '华尔街见闻', category: 'cn-finance', url: 'https://dedicated.wallstreetcn.com/rss.xml' },
  { id: 'jiemian', name: '界面新闻', category: 'cn-finance', url: 'https://a.jiemian.com/index.php?m=article&a=rss' },
  { id: 'eeo', name: '经济观察网', category: 'cn-finance', url: 'https://www.eeo.com.cn/rss.xml' },

  // ---------- 中文 · 科技 ----------
  { id: 'qbitai', name: '量子位', category: 'cn-tech', url: 'https://www.qbitai.com/feed' },
  { id: 'sspai', name: '少数派', category: 'cn-tech', url: 'https://sspai.com/feed' },
  { id: 'infoq-cn', name: 'InfoQ 中文', category: 'cn-tech', url: 'https://www.infoq.cn/feed' },
  { id: 'tmtpost', name: '钛媒体', category: 'cn-tech', url: 'https://www.tmtpost.com/feed' },
  { id: 'geekpark', name: '极客公园', category: 'cn-tech', url: 'http://www.geekpark.net/rss' },
  { id: 'ifanr', name: '爱范儿', category: 'cn-tech', url: 'https://www.ifanr.com/feed' },
  { id: 'leiphone', name: '雷锋网', category: 'cn-tech', url: 'https://www.leiphone.com/feed' },
  { id: 'ithome', name: 'IT 之家', category: 'cn-tech', url: 'https://www.ithome.com/rss/' },
  { id: 'solidot', name: 'Solidot 奇客的资讯', category: 'cn-tech', url: 'https://www.solidot.org/index.rss' },

  // ---------- 国际 · 财经 ----------
  { id: 'cnbc-markets', name: 'CNBC Markets', category: 'global-finance', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664' },
  { id: 'cnbc-top', name: 'CNBC Top News', category: 'global-finance', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114' },
  { id: 'wsj-markets', name: 'WSJ Markets', category: 'global-finance', url: 'https://feeds.content.dowjones.io/public/rss/RSSMarketsMain' },
  { id: 'marketwatch', name: 'MarketWatch 头条', category: 'global-finance', url: 'https://www.marketwatch.com/rss/topstories' },
  { id: 'seekingalpha', name: 'Seeking Alpha 市场快讯', category: 'global-finance', url: 'https://seekingalpha.com/market_currents.xml' },
  { id: 'ecb', name: '欧洲央行 ECB 新闻', category: 'global-finance', url: 'https://www.ecb.europa.eu/rss/press.html' },
  { id: 'fed', name: '美联储 Fed 新闻', category: 'global-finance', url: 'https://www.federalreserve.gov/feeds/press_monetary.xml' },

  // ---------- 国际 · 时事 ----------
  { id: 'un-news-zh', name: '联合国新闻（中文）', category: 'global-world', url: 'https://news.un.org/feed/subscribe/zh/news/all/rss.xml' },
  { id: 'un-news-en', name: 'United Nations News', category: 'global-world', url: 'https://news.un.org/feed/subscribe/en/news/all/rss.xml' },
  { id: 'france24', name: 'France 24', category: 'global-world', url: 'https://www.france24.com/en/rss' },
  { id: 'npr-world', name: 'NPR World', category: 'global-world', url: 'https://feeds.npr.org/1004/rss.xml' },
  { id: 'npr-news', name: 'NPR News', category: 'global-world', url: 'https://feeds.npr.org/1001/rss.xml' },
  { id: 'skynews-world', name: 'Sky News World', category: 'global-world', url: 'https://feeds.skynews.com/feeds/rss/world.xml' },
  { id: 'politico', name: 'Politico', category: 'global-world', url: 'https://rss.politico.com/politics-news.xml' },
  { id: 'cnbc-world', name: 'CNBC World', category: 'global-world', url: 'https://www.cnbc.com/id/100727362/device/rss/rss.html' },
  { id: 'wsj-world', name: 'WSJ World News', category: 'global-world', url: 'https://feeds.content.dowjones.io/public/rss/RSSWorldNews' },
  { id: 'slashdot', name: 'Slashdot', category: 'global-world', url: 'https://rss.slashdot.org/Slashdot/slashdotMain' },

  // ---------- AI / 科技 ----------
  { id: 'mit-tech-review', name: 'MIT Technology Review', category: 'ai', url: 'https://www.technologyreview.com/feed/' },
  { id: 'marktechpost', name: 'MarkTechPost', category: 'ai', url: 'https://www.marktechpost.com/feed/' },
  { id: 'the-decoder', name: 'The Decoder', category: 'ai', url: 'https://the-decoder.com/feed/' },
  { id: 'techcrunch', name: 'TechCrunch', category: 'ai', url: 'https://techcrunch.com/feed/' },
  { id: 'arstechnica', name: 'Ars Technica', category: 'ai', url: 'https://feeds.arstechnica.com/arstechnica/index' },
  { id: 'nature', name: 'Nature', category: 'ai', url: 'https://www.nature.com/nature.rss' },
  { id: 'hackaday', name: 'Hackaday', category: 'ai', url: 'https://hackaday.com/feed/' },
  { id: 'cnbc-tech', name: 'CNBC Technology', category: 'ai', url: 'https://www.cnbc.com/id/19854910/device/rss/rss.html' },

  // ---------- 读书 ----------
  { id: 'ruanyifeng', name: '阮一峰的网络日志（科技爱好者周刊·读书笔记）', category: 'books', url: 'https://www.ruanyifeng.com/blog/atom.xml' },
  { id: 'lesswrong', name: 'LessWrong（含大量书评序列）', category: 'books', url: 'https://lesswrong.com/feed.xml?view=recent-rss' },
  { id: 'quanta', name: 'Quanta Magazine', category: 'books', url: 'https://www.quantamagazine.org/feed/' },
];

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  removeNSPrefix: true,
  processEntities: true,
  htmlEntities: true,
});

function toArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/** XML 节点可能是字符串、对象（带属性时为 {#text}）或数组 */
function textOf(node: unknown): string {
  if (node === undefined || node === null) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number' || typeof node === 'boolean') return String(node);
  if (Array.isArray(node)) return node.length ? textOf(node[0]) : '';
  if (typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    if (typeof obj['#text'] === 'string') return obj['#text'];
    if (typeof obj['#text'] === 'number') return String(obj['#text']);
  }
  return '';
}

const DATE_KEYS = ['pubDate', 'published', 'updated', 'date', 'publicationDate', 'created', 'modified', 'issued'];
const SUMMARY_KEYS = ['description', 'summary', 'subtitle', 'encoded', 'content', 'abstract'];

function pickDate(item: Record<string, unknown>): string {
  for (const key of DATE_KEYS) {
    const raw = textOf(item[key]).trim();
    if (raw) return raw;
  }
  return '';
}

function pickSummary(item: Record<string, unknown>): string {
  for (const key of SUMMARY_KEYS) {
    const raw = textOf(item[key]).trim();
    if (raw) return raw;
  }
  return '';
}

/** Atom 的 link 可能是数组且带 rel/href 属性，RSS 的是纯字符串 */
function pickLink(item: Record<string, unknown>): string {
  const link = item.link;
  if (typeof link === 'string' && link.trim()) return link.trim();
  if (Array.isArray(link)) {
    let fallback = '';
    for (const entry of link) {
      if (typeof entry === 'string' && entry.trim()) {
        if (!fallback) fallback = entry.trim();
        continue;
      }
      if (entry && typeof entry === 'object') {
        const obj = entry as Record<string, unknown>;
        const href = String(obj['@_href'] ?? '').trim();
        const rel = String(obj['@_rel'] ?? '').trim();
        if (href && (rel === 'alternate' || rel === '')) return href;
        if (href && !fallback) fallback = href;
      }
    }
    if (fallback) return fallback;
  }
  if (link && typeof link === 'object') {
    const href = String((link as Record<string, unknown>)['@_href'] ?? '').trim();
    if (href) return href;
  }
  const guid = textOf(item.guid).trim();
  if (/^https?:\/\//i.test(guid)) return guid;
  const id = textOf(item.id).trim();
  if (/^https?:\/\//i.test(id)) return id;
  return '';
}

/** 去掉 HTML 标签与常见实体，保留可读纯文本 */
export function stripHtml(input: string): string {
  return input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&mdash;/gi, '-')
    .replace(/&hellip;/gi, '...')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeDate(raw: string): string | undefined {
  if (!raw) return undefined;
  const ts = Date.parse(raw);
  if (!Number.isNaN(ts)) return new Date(ts).toISOString();
  const trimmed = raw.trim();
  return trimmed ? trimmed : undefined;
}

interface RawBundle {
  channelTitle: string;
  items: Record<string, unknown>[];
}

/** 同时兼容 RSS 2.0 / Atom / RSS 1.0(RDF) 三种结构 */
function extractItems(doc: unknown): RawBundle {
  const root = (doc ?? {}) as Record<string, unknown>;
  const rss = root.rss as Record<string, unknown> | undefined;
  if (rss) {
    const channel = (rss.channel ?? {}) as Record<string, unknown>;
    let items = toArray(channel.item) as Record<string, unknown>[];
    if (items.length === 0) items = toArray(rss.item) as Record<string, unknown>[];
    return { channelTitle: textOf(channel.title), items };
  }
  const atom = root.feed as Record<string, unknown> | undefined;
  if (atom) {
    return {
      channelTitle: textOf(atom.title),
      items: toArray(atom.entry) as Record<string, unknown>[],
    };
  }
  const rdf = (root.RDF ?? root['rdf:RDF']) as Record<string, unknown> | undefined;
  if (rdf) {
    const channel = (rdf.channel ?? {}) as Record<string, unknown>;
    return {
      channelTitle: textOf(channel.title),
      items: toArray(rdf.item) as Record<string, unknown>[],
    };
  }
  const channel = root.channel as Record<string, unknown> | undefined;
  if (channel) {
    return {
      channelTitle: textOf(channel.title),
      items: toArray(channel.item) as Record<string, unknown>[],
    };
  }
  return { channelTitle: '', items: [] };
}

/**
 * 抓取并解析一个订阅源。失效源一律返回空数组，绝不抛异常。
 */
export async function fetchFeed(feed: FeedSource, limit = 20): Promise<FeedItem[]> {
  try {
    if (!feed || !feed.url) return [];
    const res = await fetchText(feed.url, { timeoutMs: 18000, retries: 3 });
    if (!res.ok || !res.body) return [];

    let doc: unknown;
    try {
      doc = parser.parse(res.body);
    } catch {
      return [];
    }

    const { channelTitle, items } = extractItems(doc);
    const source = feed.name || channelTitle || feed.id;
    const out: FeedItem[] = [];

    for (const raw of items) {
      if (!raw || typeof raw !== 'object') continue;
      const title = stripHtml(textOf(raw.title)).slice(0, 300);
      const url = pickLink(raw);
      if (!title || !url) continue;
      const item: FeedItem = { title, url, source };
      const publishedAt = normalizeDate(pickDate(raw));
      if (publishedAt) item.publishedAt = publishedAt;
      const summary = stripHtml(pickSummary(raw));
      if (summary) item.summary = summary.slice(0, 1200);
      out.push(item);
    }

    out.sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));
    return limit > 0 ? out.slice(0, limit) : out;
  } catch {
    return [];
  }
}
