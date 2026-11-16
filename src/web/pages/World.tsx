import type { TodayResponse } from '../lib/api';
import { ArticleView } from '../components/ArticleView';
import { PageHeader } from '../components/PageHeader';
import { Empty } from '../components/Empty';
import { EventCard } from '../components/EventCard';

export function World({
  today,
  onGenerate,
  generating,
}: {
  today: TodayResponse | null;
  onGenerate: () => void;
  generating: boolean;
}) {
  const article = today?.world;
  if (!article) {
    return (
      <div>
        <PageHeader kicker="全球局势" title="今天正在发生的五件事" desc="每件事说清：发生了什么、为什么重要、影响是什么、接下来观察什么。" />
        <Empty title="今日五件大事还没生成" desc="生成后每条都带来源链接与置信度标注。" onGenerate={onGenerate} generating={generating} />
      </div>
    );
  }
  const meta = article.meta as Record<string, any>;
  const events = (meta.events ?? []) as Array<Record<string, any>>;
  return (
    <div>
      <PageHeader
        kicker="全球局势 · 每日五件"
        title="今天正在发生的五件事"
        desc="只讲能查到出处的事，推断会标明是推断。"
      />
      {events.length > 0 && (
        <section className="mb-10 max-w-[720px] rounded-[var(--radius-card)] border border-line bg-surface px-5 py-2 md:px-6">
          {events.map((e, i) => (
            <EventCard key={i} event={e} index={i} />
          ))}
        </section>
      )}
      <ArticleView article={article} kicker="深度解读" />
    </div>
  );
}