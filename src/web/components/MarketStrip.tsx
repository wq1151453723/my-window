import { formatPct, formatPrice } from '../lib/format';

export interface QuoteView {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  currency?: string;
}

export function MarketStrip({ quotes }: { quotes: QuoteView[] }) {
  if (!quotes.length) return null;
  return (
    <div className="-mx-5 overflow-x-auto px-5 md:mx-0 md:px-0">
      <div className="flex gap-2.5">
        {quotes.map((q) => {
          const up = q.changePct >= 0;
          return (
            <div
              key={q.symbol}
              className="min-w-[132px] shrink-0 rounded-[var(--radius-card)] border border-line bg-surface px-3.5 py-3"
            >
              <div className="truncate text-[12px] text-muted">{q.name}</div>
              <div className="mt-1 text-[18px] font-semibold tabular-nums">{formatPrice(q.price, q.currency)}</div>
              <div
                className={`mt-0.5 text-[12px] font-medium tabular-nums ${up ? "text-accent" : "text-jade"}`}
              >
                {formatPct(q.changePct)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}