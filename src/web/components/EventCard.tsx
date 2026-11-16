import type { Article } from '@shared/types';

export function EventCard({ event, index }: { event: Record<string, any>; index: number }) {
  const conf = String(event.confidence ?? "中");
  const confClass =
    conf === "高"
      ? "bg-jade-soft text-jade"
      : conf === "低"
        ? "bg-accent-soft text-accent-ink"
        : "bg-surface-2 text-muted";
  const rows: Array<[string, string]> = [
    ["发生了什么", String(event.whatHappened ?? "")],
    ["为什么重要", String(event.whyItMatters ?? "")],
    ["影响", String(event.impact ?? "")],
    ["接下来观察", String(event.watchNext ?? "")],
  ];
  return (
    <article className="border-t border-line py-6 first:border-t-0 first:pt-0">
      <div className="flex items-start gap-4">
        <span className="display mt-0.5 shrink-0 text-[24px] font-bold leading-[1.15] text-accent">
          {String(index + 1).padStart(2, "0")}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="display text-[20px] font-bold leading-snug">{String(event.title ?? "")}</h3>
            {event.region && (
              <span className="rounded-full bg-azure-soft px-2.5 py-0.5 text-[12px] text-azure">{String(event.region)}</span>
            )}
            <span className={"rounded-full px-2.5 py-0.5 text-[12px] " + confClass}>置信度 {conf}</span>
          </div>
          <dl className="mt-3 space-y-2">
            {rows.map(([k, v]) =>
              v ? (
                <div key={k} className="flex gap-3 text-[14px] leading-relaxed">
                  <dt className="w-[68px] shrink-0 text-[12px] leading-[1.9] text-muted">{k}</dt>
                  <dd className="text-ink-soft">{v}</dd>
                </div>
              ) : null
            )}
          </dl>
        </div>
      </div>
    </article>
  );
}