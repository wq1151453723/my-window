import type { TodayResponse } from '../lib/api';
import { ArticleView } from '../components/ArticleView';
import { PageHeader } from '../components/PageHeader';
import { Empty } from '../components/Empty';

export function Books({
  today,
  onGenerate,
  generating,
}: {
  today: TodayResponse | null;
  onGenerate: () => void;
  generating: boolean;
}) {
  const article = today?.books;
  if (!article) {
    return (
      <div>
        <PageHeader kicker="书籍学习" title="每天一本书里最该知道的那个概念" desc="社会学、经济、历史、哲学、金融、AI 六个学科轮换，用普通人能懂的话讲透。" />
        <Empty title="今天这一篇还没生成" desc="生成后可以读完整讲解，也可以直接听朗读稿。" onGenerate={onGenerate} generating={generating} />
      </div>
    );
  }
  const meta = article.meta as Record<string, any>;
  return (
    <div>
      <PageHeader
        kicker="书籍学习 · 每日一读"
        title="一本书里最该知道的那个概念"
        desc="把一本书压缩成一个普通人能带走、用得上的判断。"
      />
      <ArticleView
        article={article}
        kicker={`${meta.discipline ?? "读书"} · ${meta.author ?? ""}`.trim()}
        badge={
          meta.book ? (
            <span className="rounded-full border border-line-strong bg-surface px-3.5 py-1.5 text-[12px] text-ink-soft">
              《{String(meta.book)}》
            </span>
          ) : undefined
        }
      >
        {meta.coreIdea ? (
          <section className="rounded-[var(--radius-card)] border border-line bg-surface-2 px-5 py-4">
            <div className="kicker">核心观点</div>
            <p className="mt-2 font-serif text-[16px] leading-relaxed text-ink-soft">{String(meta.coreIdea)}</p>
            {meta.whyItMatters ? (
              <p className="mt-3 border-t border-line pt-3 text-[14px] leading-relaxed text-muted">
                <span className="text-ink-soft">为什么与你有关：</span>
                {String(meta.whyItMatters)}
              </p>
            ) : null}
          </section>
        ) : null}
      </ArticleView>
    </div>
  );
}