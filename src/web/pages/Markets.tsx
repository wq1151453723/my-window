import { useEffect, useMemo, useState } from 'react';
import type { TodayResponse } from '../lib/api';
import { api } from '../lib/api';
import { ArticleView } from '../components/ArticleView';
import { PageHeader } from '../components/PageHeader';
import { Empty } from '../components/Empty';
import { MarketStrip, type QuoteView } from '../components/MarketStrip';
import { TrendChart } from '../components/TrendChart';
import { formatPct } from '../lib/format';

export function Markets({
  today,
  onGenerate,
  generating,
}: {
  today: TodayResponse | null;
  onGenerate: () => void;
  generating: boolean;
}) {
  const article = today?.markets;
  const [series, setSeries] = useState<{ t: number[]; c: number[] } | null>(null);
  useEffect(() => {
    api.history("^GSPC", 30).then(setSeries).catch(() => setSeries(null));
  }, []);
  const chartData = useMemo(
    () => (series?.t ?? []).map((t, i) => ({ time: t, value: series!.c[i] })),
    [series]
  );
  if (!article) {
    return (
      <div>
        <PageHeader kicker="全球与中国金融" title="今天的市场，数字先说话" desc="接入真实报价后再解读，涨跌幅一律来自真实接口。" />
        <Empty title="今日市场分析还没生成" desc="生成后会带真实指数报价、走势图、驱动因素与风险点。" onGenerate={onGenerate} generating={generating} />
      </div>
    );
  }
  const meta = article.meta as Record<string, any>;
  const quotes = (meta.quotes ?? []) as QuoteView[];
  const drivers: string[] = meta.drivers ?? [];
  const risks: string[] = meta.riskPoints ?? [];
  const mood = String(meta.marketMood ?? "");
  return (
    <div>
      <PageHeader
        kicker="全球与中国金融 · 每日拆解"
        title="今天的市场，数字先说话"
        desc="所有涨跌都来自真实报价接口，解读只做因果分析，不给投资建议。"
      />
      <section className="mb-9">
        <MarketStrip quotes={quotes} />
      </section>
      <ArticleView article={article} kicker="市场解读" badge={mood ? <span className="rounded-full bg-accent-soft px-3.5 py-1.5 text-[12px] text-accent-ink">{mood}</span> : undefined}>
        {chartData.length > 2 && (
          <section className="rounded-[var(--radius-card)] border border-line bg-surface p-4 md:p-5">
            <div className="flex items-baseline justify-between">
              <h3 className="display text-[17px] font-bold">标普 500 · 近 30 个交易日</h3>
              <span className="text-[12px] text-muted">来源 Yahoo Finance</span>
            </div>
            <div className="mt-2">
              <TrendChart data={chartData} />
            </div>
          </section>
        )}
        {drivers.length > 0 && (
          <section className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
              <div className="kicker">主要驱动</div>
              <ul className="mt-2.5 space-y-2 text-[14px] leading-relaxed text-ink-soft">
                {drivers.map((d, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-[9px] h-[5px] w-[5px] shrink-0 rounded-full bg-jade" />
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
              <div className="kicker">风险提示</div>
              <ul className="mt-2.5 space-y-2 text-[14px] leading-relaxed text-ink-soft">
                {risks.map((d, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-[9px] h-[5px] w-[5px] shrink-0 rounded-full bg-accent" />
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}
      </ArticleView>
    </div>
  );
}