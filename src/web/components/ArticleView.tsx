import type { ReactNode } from 'react';
import type { Article } from '@shared/types';
import { Markdown } from '../lib/markdown';
import { formatDateCN, relativeTime } from '../lib/format';
import { ReadButton } from './ReadButton';
import { IconLink, IconClock } from './Icons';

export function ArticleView({
  article,
  kicker,
  badge,
  children,
}: {
  article: Article;
  kicker: string;
  badge?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <article className="max-w-[720px]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-muted">
        <span className="kicker">{kicker}</span>
        <span className="h-[3px] w-[3px] rounded-full bg-line-strong" />
        <span>{formatDateCN(article.date)}</span>
        <span className="inline-flex items-center gap-1">
          <IconClock size={13} />
          {article.readingMinutes || 1} 分钟
        </span>
      </div>

      <h1 className="display mt-3 text-[32px] font-bold leading-[1.16] md:text-[40px]">{article.title}</h1>
      {article.subtitle && (
        <p className="mt-3 text-[14px] leading-relaxed text-muted md:text-[16px]">{article.subtitle}</p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {badge}
        <ReadButton
          id={article.id}
          title={article.title}
          script={article.script}
          audioPath={article.audioPath}
          section={article.section}
        />
      </div>

      {article.takeaways.length > 0 && (
        <section className="mt-8 border-l-[3px] border-accent bg-surface px-5 py-4">
          <div className="kicker">要点速览</div>
          <ul className="mt-2.5 space-y-2">
            {article.takeaways.map((t, i) => (
              <li key={i} className="flex gap-2.5 text-[14px] leading-relaxed text-ink-soft">
                <span className="mt-[2px] shrink-0 font-serif text-[12px] text-accent">{String(i + 1).padStart(2, "0")}</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {children && <div className="mt-9">{children}</div>}

      <Markdown text={article.body} className="article-body mt-9" />

      {article.sources.length > 0 && (
        <section className="mt-10 border-t border-line pt-5">
          <div className="kicker">来源</div>
          <ul className="mt-3 space-y-1.5">
            {article.sources.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-[12px] leading-relaxed text-muted">
                <IconLink size={13} className="mt-[3px] shrink-0" />
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-block py-1 underline decoration-line-strong underline-offset-2 hover:text-accent"
                >
                  {s.title}
                </a>
                {s.publishedAt && <span className="shrink-0 text-[12px] text-muted">{relativeTime(s.publishedAt)}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-8 text-[12px] text-muted">
        内容由模型基于上述来源生成，生成于 {relativeTime(article.generatedAt)}
      </p>
    </article>
  );
}