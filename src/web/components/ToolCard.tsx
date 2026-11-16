import type { Article } from '@shared/types';
import { IconStar, IconLink } from './Icons';
import { ReadButton } from './ReadButton';
import { formatNumber } from '../lib/format';

export function ToolCard({ article, index }: { article: Article; index: number }) {
  const meta = article.meta as Record<string, any>;
  const stars = Number(meta.stars ?? 0);
  const repo = String(meta.fullName ?? meta.repoFullName ?? "");
  const url = String(meta.url ?? meta.repoUrl ?? "");
  const language = String(meta.language ?? "");
  const fields: Array<[string, string]> = [
    ["这是什么", String(meta.whatItIs ?? "")],
    ["适合谁", String(meta.whoIsItFor ?? "")],
    ["怎么上手", String(meta.howToStart ?? "")],
    ["为什么现在火", String(meta.whyNow ?? "")],
  ];
  return (
    <article className="rounded-[var(--radius-card)] border border-line bg-surface p-5 md:p-6">
      <div className="flex items-start gap-4">
        <span className="display mt-1 text-[24px] font-bold text-[#978A75]">{String(index + 1).padStart(2, "0")}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="display text-[20px] font-bold leading-snug">{article.title}</h3>
            {language && (
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[12px] text-muted">{language}</span>
            )}
          </div>
          <p className="mt-2 max-w-[40em] text-[14px] leading-relaxed text-muted">{article.summary}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px] text-muted">
            {repo && <span className="font-mono text-[12px] text-ink-soft">{repo}</span>}
            {stars > 0 && (
              <span className="inline-flex items-center gap-1 text-gold">
                <IconStar size={13} />
                {formatNumber(stars)}
              </span>
            )}
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex min-h-[24px] items-center gap-1 underline decoration-line-strong underline-offset-2 hover:text-accent"
              >
                <IconLink size={13} />
                去看仓库
              </a>
            )}
          </div>
        </div>
      </div>

      <dl className="mt-5 grid gap-x-8 gap-y-3.5 border-t border-line pt-4 md:grid-cols-2">
        {fields.map(([k, v]) =>
          v ? (
            <div key={k}>
              <dt className="text-[12px] text-muted">{k}</dt>
              <dd className="mt-1 text-[14px] leading-relaxed text-ink-soft">{v}</dd>
            </div>
          ) : null
        )}
      </dl>

      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <ReadButton
          id={article.id}
          title={article.title}
          script={article.script}
          audioPath={article.audioPath}
          section={article.section}
          size="sm"
          label="朗读介绍"
        />
        {article.takeaways.length > 0 && (
          <span className="text-[12px] text-muted">{article.takeaways[0]}</span>
        )}
      </div>
    </article>
  );
}