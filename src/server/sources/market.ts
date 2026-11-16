import { fetchJson, fetchText } from './http.js';

/** 一条实时报价 */
export interface Quote {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  currency?: string;
}

/** 一条时间序列（t 为毫秒时间戳，c 为收盘价） */
export interface Series {
  t: number[];
  c: number[];
}

const EM_UT = 'bd1d9ddb04089700cf9c27f6f7426281';
const EM_KLINE_UT = 'fa5fd1943c7b386f172d6893dbfba10b';

/**
 * 东方财富 secid 映射表。
 * 市场前缀：0=深圳 1=上海 100=全球指数 105=纳斯达克 106=纽交所 107=美交所 116=港股
 */
const SECID_MAP: Record<string, string> = {
  // 全球指数
  '^GSPC': '100.SPX',
  SPX: '100.SPX',
  GSPC: '100.SPX',
  '标普500': '100.SPX',
  '^IXIC': '100.NDX',
  IXIC: '100.NDX',
  NDX: '100.NDX',
  NASDAQ: '100.NDX',
  '纳斯达克': '100.NDX',
  '^DJI': '100.DJIA',
  DJI: '100.DJIA',
  DJIA: '100.DJIA',
  '道琼斯': '100.DJIA',
  '^HSI': '100.HSI',
  HSI: '100.HSI',
  '恒生指数': '100.HSI',
  '^N225': '100.N225',
  N225: '100.N225',
  '日经225': '100.N225',
  '^KS11': '100.KS11',
  KS11: '100.KS11',
  '^FTSE': '100.FTSE',
  FTSE: '100.FTSE',
  '^GDAXI': '100.GDAXI',
  GDAXI: '100.GDAXI',
  '^STOXX50': '100.STOXX50',

  // A 股指数
  '000001.SS': '1.000001',
  SHCOMP: '1.000001',
  '上证指数': '1.000001',
  '399001.SZ': '0.399001',
  '深证成指': '0.399001',
  '399006.SZ': '0.399006',
  '创业板指': '0.399006',
  '000300.SS': '1.000300',
  '沪深300': '1.000300',
  '399905.SZ': '0.399905',
  '中证500': '0.399905',
  '000016.SS': '1.000016',
  '上证50': '1.000016',

  // A 股个股
  '600519.SS': '1.600519',
  '贵州茅台': '1.600519',
  '000858.SZ': '0.000858',
  '五粮液': '0.000858',
  '601318.SS': '1.601318',
  '中国平安': '1.601318',
  '300750.SZ': '0.300750',
  '宁德时代': '0.300750',
  '002594.SZ': '0.002594',
  '比亚迪': '0.002594',
  '688981.SS': '1.688981',
  '中芯国际': '1.688981',
  '000001.SZ': '0.000001',
  '平安银行': '0.000001',

  // 港股
  '0700.HK': '116.00700',
  '腾讯控股': '116.00700',
  '09988.HK': '116.09988',
  '阿里巴巴-W': '116.09988',

  // 美股
  AAPL: '105.AAPL',
  MSFT: '105.MSFT',
  NVDA: '105.NVDA',
  GOOGL: '105.GOOGL',
  AMZN: '105.AMZN',
  TSLA: '105.TSLA',
  META: '105.META',
  AMD: '105.AMD',
  NFLX: '105.NFLX',
  INTC: '105.INTC',
  CSCO: '105.CSCO',
  BABA: '106.BABA',
  DIS: '106.DIS',
  XOM: '106.XOM',
  V: '106.V',
  JPM: '106.JPM',
  KO: '106.KO',
  WMT: '106.WMT',
  BRK_B: '106.BRK.B',

  // 期货 / 汇率 / 美元指数
  'GC=F': '101.GC00Y',
  'XAUUSD=X': '101.GC00Y',
  'CL=F': '102.CL00Y',
  'SI=F': '101.SI00Y',
  'HG=F': '101.HG00Y',
  'DX-Y.NYB': '100.UDI',
  UDI: '100.UDI',
  '美元指数': '100.UDI',
};


/** 标普500波动率指数：走 CBOE 官方历史 CSV */
const CBOE_VIX_CSV = 'https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv';

/** 加密货币：走 Gate.io 公开行情接口（币安 / OKX / Coinbase 在本网络不可达） */
const GATE_API = 'https://api.gateio.ws/api/v4/spot';

const CRYPTO_NAMES: Record<string, string> = {
  BTC_USDT: '比特币',
  ETH_USDT: '以太坊',
  SOL_USDT: 'Solana',
};

function isVixSymbol(symbol: string): boolean {
  const s = symbol.trim().toUpperCase();
  return s === '^VIX' || s === 'VIX' || s === 'VIXCLS';
}

function cryptoPair(symbol: string): string {
  const s = symbol.trim().toUpperCase().replace(/[-_]/, '');
  if (s.startsWith('BTC')) return 'BTC_USDT';
  if (s.startsWith('ETH')) return 'ETH_USDT';
  if (s.startsWith('SOL')) return 'SOL_USDT';
  return '';
}

interface CboeRow {
  date: string;
  close: number;
}

/** CBOE 行情缓存（同一轮任务里 VIX 报价与日线会各取一次） */
let cboeRowsCache: { at: number; rows: CboeRow[] } | null = null;
const CBOE_CACHE_MS = 5 * 60 * 1000;

/** 解析 CBOE 官方 VIX 历史 CSV（DATE,OPEN,HIGH,LOW,CLOSE） */
async function fetchCboeRows(): Promise<CboeRow[]> {
  if (cboeRowsCache && Date.now() - cboeRowsCache.at < CBOE_CACHE_MS) return cboeRowsCache.rows;
  const res = await fetchText(CBOE_VIX_CSV, {
    timeoutMs: 20000,
    retries: 3,
    accept: 'text/csv, text/plain, */*',
  });
  if (!res.ok || !res.body) return [];
  const rows: CboeRow[] = [];
  for (const line of res.body.split(/\r?\n/)) {
    const parts = line.split(',');
    if (parts.length < 5) continue;
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(parts[0].trim());
    if (!m) continue;
    const close = Number(parts[4]);
    if (!Number.isFinite(close)) continue;
    rows.push({ date: `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`, close });
  }
  cboeRowsCache = { at: Date.now(), rows };
  return rows;
}

async function fetchCboeVixQuote(symbol: string): Promise<Quote | null> {
  const rows = await fetchCboeRows();
  if (rows.length < 2) return null;
  const last = rows[rows.length - 1];
  const prev = rows[rows.length - 2];
  const changePct = prev.close ? ((last.close - prev.close) / prev.close) * 100 : 0;
  return {
    symbol,
    name: '标普500波动率指数(VIX)',
    price: last.close,
    changePct: Math.round(changePct * 100) / 100,
    currency: 'USD',
  };
}

async function fetchCboeVixSeries(days: number): Promise<Series> {
  const rows = await fetchCboeRows();
  if (rows.length === 0) return { t: [], c: [] };
  const slice = rows.slice(-Math.max(2, Math.min(1000, Math.floor(days) || 30)));
  const t: number[] = [];
  const c: number[] = [];
  for (const row of slice) {
    const ts = Date.parse(`${row.date}T00:00:00Z`);
    if (!Number.isFinite(ts)) continue;
    t.push(ts);
    c.push(row.close);
  }
  if (t.length === 0 || t.length !== c.length) return { t: [], c: [] };
  return { t, c };
}

async function fetchGateQuote(symbol: string): Promise<Quote | null> {
  const pair = cryptoPair(symbol);
  if (!pair) return null;
  const res = await fetchJson<Array<{ last?: string; change_percentage?: string }>>(
    `${GATE_API}/tickers?currency_pair=${pair}`,
    { timeoutMs: 15000, retries: 2 },
  );
  if (!res.ok || !res.data || !Array.isArray(res.data) || res.data.length === 0) return null;
  const row = res.data[0];
  const price = Number(row.last);
  if (!Number.isFinite(price) || price <= 0) return null;
  const changePct = Number(row.change_percentage ?? 0);
  return {
    symbol,
    name: CRYPTO_NAMES[pair] ?? pair,
    price,
    changePct: Number.isFinite(changePct) ? changePct : 0,
    currency: 'USD',
  };
}

async function fetchGateSeries(symbol: string, days: number): Promise<Series> {
  const pair = cryptoPair(symbol);
  if (!pair) return { t: [], c: [] };
  const limit = Math.max(2, Math.min(1000, Math.floor(days) || 30));
  const res = await fetchJson<Array<unknown>>(
    `${GATE_API}/candlesticks?currency_pair=${pair}&interval=1d&limit=${limit}`,
    { timeoutMs: 15000, retries: 2 },
  );
  if (!res.ok || !res.data || !Array.isArray(res.data)) return { t: [], c: [] };
  const pairs: Array<[number, number]> = [];
  for (const row of res.data) {
    if (!Array.isArray(row) || row.length < 3) continue;
    const ts = Number(row[0]);
    const close = Number(row[2]);
    if (!Number.isFinite(ts) || !Number.isFinite(close)) continue;
    pairs.push([ts * 1000, close]);
  }
  pairs.sort((a, b) => a[0] - b[0]);
  if (pairs.length === 0) return { t: [], c: [] };
  return { t: pairs.map((item) => item[0]), c: pairs.map((item) => item[1]) };
}

/** 把用户传入的 symbol 解析成东方财富 secid；解析不出来返回空串 */
export function resolveSecid(symbol: string): string {
  const raw = String(symbol ?? '').trim();
  if (!raw) return '';
  if (SECID_MAP[raw]) return SECID_MAP[raw];
  const upper = raw.toUpperCase();
  if (SECID_MAP[upper]) return SECID_MAP[upper];

  let m = /^(\d{6})\.(SS|SH|SZ|BJ)$/i.exec(raw);
  if (m) {
    const suffix = m[2].toUpperCase();
    return suffix === 'SZ' || suffix === 'BJ' ? `0.${m[1]}` : `1.${m[1]}`;
  }
  m = /^(\d{1,5})\.HK$/i.exec(raw);
  if (m) return `116.${m[1].padStart(5, '0')}`;
  m = /^(SH|SZ)?(\d{6})$/.exec(raw);
  if (m) {
    const prefix = (m[1] ?? '').toUpperCase();
    const code = m[2];
    if (prefix === 'SH') return `1.${code}`;
    if (prefix === 'SZ') return `0.${code}`;
    return code.startsWith('6') ? `1.${code}` : `0.${code}`;
  }
  return '';
}

/** 是否像一只美股代码（未映射时用来探测 105/106/107 三个市场） */
function looksLikeUsTicker(symbol: string): boolean {
  return /^[A-Z][A-Z.-]{0,6}$/.test(symbol.toUpperCase());
}

function currencyOf(secid: string): string {
  const market = secid.split('.')[0];
  if (market === '0' || market === '1') return 'CNY';
  if (market === '116') return 'HKD';
  if (secid === '100.HSI') return 'HKD';
  if (secid === '100.N225') return 'JPY';
  if (secid === '100.KS11') return 'KRW';
  return 'USD';
}

interface EmQuoteRow {
  f2?: number | string;
  f3?: number | string;
  f12?: string;
  f13?: number | string;
  f14?: string;
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/** 拉一批 secid 的实时报价，返回 secid -> 行 的映射 */
async function fetchEmQuotes(secids: string[]): Promise<Map<string, EmQuoteRow>> {
  const out = new Map<string, EmQuoteRow>();
  const unique = Array.from(new Set(secids.filter(Boolean)));
  for (let i = 0; i < unique.length; i += 40) {
    const chunk = unique.slice(i, i + 40);
    const url =
      `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&invt=2&secids=${chunk.join(',')}` +
      `&fields=f1,f2,f3,f4,f12,f13,f14&ut=${EM_UT}`;
    const res = await fetchJson<{ data?: { diff?: EmQuoteRow[] } }>(url, { timeoutMs: 15000, retries: 2 });
    if (!res.ok || !res.data?.data) continue;
    const rows = Array.isArray(res.data.data.diff) ? res.data.data.diff : [];
    for (const row of rows) {
      const secid = `${row.f13}.${row.f12}`;
      if (row.f12) out.set(secid, row);
    }
  }
  return out;
}

/**
 * 批量取实时报价。无效 symbol 自动跳过；全部无效时返回空数组，绝不抛异常。
 */
export async function fetchQuotes(symbols: string[]): Promise<Quote[]> {
  try {
    if (!Array.isArray(symbols) || symbols.length === 0) return [];
    const wanted = symbols.map((s) => String(s).trim()).filter(Boolean);
    if (wanted.length === 0) return [];

    const resolved = new Map<string, string>();
    const unresolved: string[] = [];
    const special = new Map<string, Quote>();

    for (const symbol of wanted) {
      if (isVixSymbol(symbol)) {
        const quote = await fetchCboeVixQuote(symbol);
        if (quote) special.set(symbol, quote);
        continue;
      }
      if (cryptoPair(symbol)) {
        const quote = await fetchGateQuote(symbol);
        if (quote) special.set(symbol, quote);
        continue;
      }
      const secid = resolveSecid(symbol);
      if (secid) resolved.set(symbol, secid);
      else unresolved.push(symbol);
    }

    // 未知代码：一次请求带 105/106/107 三个市场前缀，谁有数据用谁
    const probes: Array<{ symbol: string; secid: string }> = [];
    for (const symbol of unresolved) {
      if (!looksLikeUsTicker(symbol)) continue;
      const ticker = symbol.toUpperCase();
      for (const market of ['105', '106', '107']) {
        probes.push({ symbol, secid: `${market}.${ticker}` });
      }
    }

    const rows = await fetchEmQuotes([...resolved.values(), ...probes.map((p) => p.secid)]);

    const quotes: Quote[] = [];
    for (const symbol of wanted) {
      const already = special.get(symbol);
      if (already) {
        quotes.push(already);
        continue;
      }
      let secid = resolved.get(symbol);
      if (!secid) {
        const hit = probes.find((p) => p.symbol === symbol && rows.has(p.secid));
        if (!hit) continue;
        secid = hit.secid;
      }
      const row = rows.get(secid);
      if (!row) continue;
      const price = toNumber(row.f2);
      if (!price) continue;
      quotes.push({
        symbol,
        name: String(row.f14 ?? symbol),
        price,
        changePct: toNumber(row.f3),
        currency: currencyOf(secid),
      });
    }
    return quotes;
  } catch {
    return [];
  }
}

/** Yahoo Finance 兜底：当前网络下多数返回 403，仅作备用通道 */
async function yahooHistory(symbol: string, days: number): Promise<Series> {
  const empty: Series = { t: [], c: [] };
  const range = days <= 30 ? '1mo' : days <= 90 ? '3mo' : days <= 180 ? '6mo' : days <= 365 ? '1y' : '2y';
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`;
  const res = await fetchJson<{
    chart?: { result?: Array<{ timestamp?: number[]; indicators?: { quote?: Array<{ close?: (number | null)[] }> } }> };
  }>(url, { timeoutMs: 15000, retries: 1 });
  if (!res.ok || !res.data?.chart?.result?.length) return empty;
  const result = res.data.chart.result[0];
  const ts = result.timestamp ?? [];
  const closes = result.indicators?.quote?.[0]?.close ?? [];
  const t: number[] = [];
  const c: number[] = [];
  for (let i = 0; i < Math.min(ts.length, closes.length); i += 1) {
    const close = closes[i];
    if (typeof ts[i] !== 'number' || close === null || close === undefined) continue;
    t.push(ts[i] * 1000);
    c.push(Number(close));
  }
  if (t.length === 0 || t.length !== c.length) return empty;
  return { t, c };
}

/**
 * 取历史日线序列。t 与 c 长度一致且非空；无效 symbol 返回空数组，绝不抛异常。
 */
export async function fetchHistory(symbol: string, days = 30): Promise<Series> {
  const empty: Series = { t: [], c: [] };
  try {
    if (isVixSymbol(symbol)) return await fetchCboeVixSeries(Math.floor(days) || 30);
    if (cryptoPair(symbol)) return await fetchGateSeries(symbol, Math.floor(days) || 30);
    const secid = resolveSecid(symbol);
    if (secid) {
      const limit = Math.max(2, Math.min(1000, Math.floor(days) || 30));
      const url =
        `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}` +
        `&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61` +
        `&klt=101&fqt=1&end=20500101&lmt=${limit}&ut=${EM_KLINE_UT}`;
      const res = await fetchJson<{ data?: { klines?: string[] } }>(url, { timeoutMs: 15000, retries: 2 });
      if (res.ok && res.data?.data && Array.isArray(res.data.data.klines)) {
        const t: number[] = [];
        const c: number[] = [];
        for (const line of res.data.data.klines) {
          const parts = String(line).split(',');
          const ts = Date.parse(`${parts[0]}T00:00:00Z`);
          const close = Number(parts[2]);
          if (!Number.isFinite(ts) || !Number.isFinite(close)) continue;
          t.push(ts);
          c.push(close);
        }
        if (t.length > 0 && t.length === c.length) return { t, c };
      }
    }
    return await yahooHistory(String(symbol ?? ''), Math.floor(days) || 30);
  } catch {
    return empty;
  }
}
