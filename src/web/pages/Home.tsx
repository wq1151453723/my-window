import type { TodayResponse } from '../lib/api';
import type { Article, SectionId } from '@shared/types';
import { formatDateCN, formatNumber } from '../lib/format';
import { ReadButton } from '../components/ReadButton';
import { IconChevron } from '../components/Icons';

interface CardSpec {
  id: SectionId;
  index: number;
  href: string;
  label: string;
  title: string;
  summary: string;
  meta: string;
  articles: Article[];
}

function brief(text: string, max = 62): string {
  return text.length > max ? text.slice(0, max).trim() + "…" : text;
}

export function Home({ today }: { today: TodayResponse | null }) {
  if (!today) {
    return (
      <div className="py-24 text-center text-muted">
        <p className="text-[14px]">正在读取今日内容…</p>
      </div>
    );
  }
  const aiTools = today["ai-tools"] ?? [];
  const lead = today.world ?? today.markets ?? today.books;
  const courseLesson = today["ai-course"] ?? null;
  const cards: CardSpec[] = [
    {
      id: "books",
      index: 1,
      href: "#/books",
      label: "书籍学习",
      title: today.books?.title ?? "今天这一篇还没生成",
      summary: today.books?.summary ?? "点右上角「立即生成」，几分钟内出一篇能读懂的讲解。",
      meta: today.books ? `${today.books.readingMinutes || 1} 分钟 · ${String((today.books.meta as any)?.discipline ?? "")}` : "待生成",
      articles: today.books ? [today.books] : [],
    },
    {
      id: "ai-tools",
      index: 2,
      href: "#/ai",
      label: "前沿 AI 应用",
      title: aiTools.length ? `本周 ${aiTools.length} 个 GitHub 高星 AI 工具` : "本周高星工具还没生成",
      summary: aiTools.length
        ? aiTools.map((a) => a.title).join(" · ")
        : "从 GitHub 每周挑五个真能用的开源 AI 项目，用普通人听得懂的话讲清楚。",
      meta: aiTools.length ? `本周已收录 ${aiTools.length} 个` : "待生成",
      articles: aiTools,
    },
    {
      id: "markets",
      index: 3,
      href: "#/markets",
      label: "全球与中国金融",
      title: today.markets?.title ?? "今日市场分析还没生成",
      summary: today.markets?.summary ?? "接入真实行情数据后，这里是每天的市场拆解。",
      meta: today.markets ? `${today.markets.readingMinutes || 1} 分钟` : "待生成",
      articles: today.markets ? [today.markets] : [],
    },
    {
      id: "world",
      index: 4,
      href: "#/world",
      label: "全球局势",
      title: today.world?.title ?? "今日五件大事还没生成",
      summary: today.world?.summary ?? "每天五件正在发生的事，讲清影响和下一步看什么。",
      meta: today.world ? `${today.world.readingMinutes || 1} 分钟` : "待生成",
      articles: today.world ? [today.world] : [],
    },
  ];

  return (
    <div>
      <section className="border-b border-line pb-7">
        <div className="flex flex-wrap items-center gap-3 text-[12px] text-muted">
          <span className="kicker">今日订阅</span>
          <span className="h-[3px] w-[3px] rounded-full bg-line-strong" />
          <span>{formatDateCN(today.date)}</span>
        </div>
        <h1 className="display mt-3 max-w-[16ch] text-[36px] font-bold leading-[1.14] md:text-[56px]">
          每天四份，十五分钟读完世界
        </h1>
        <p className="mt-4 max-w-[62ch] text-[14px] leading-relaxed text-muted md:text-[16px]">
          {lead?.summary ??
            "一本书里最该知道的那个概念、五个本周值得用的开源工具、一次市场拆解、五件正在发生的大事 —— 都有来源，都能朗读。"}
        </p>
      </section>

      {courseLesson && (
        <section className="mt-8 flex flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface-2 px-5 py-5 md:flex-row md:items-center md:px-6">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="kicker">AI 学习</span>
              <span className="text-[12px] text-muted">
                第 {String((courseLesson.meta as any)?.lessonNo ?? 1)} 讲 / 40 · {String((courseLesson.meta as any)?.stageTitle ?? "")}
              </span>
            </div>
            <h2 className="display mt-2 text-[20px] font-bold">{courseLesson.title}</h2>
            <p className="mt-1.5 max-w-[62ch] text-[14px] leading-relaxed text-muted">{brief(courseLesson.summary, 78)}</p>
            <div className="mt-3 h-1 w-full max-w-[320px] rounded-full bg-line">
              <div
                className="h-1 rounded-full bg-accent"
                style={{ width: `${Math.min(100, (Number((courseLesson.meta as any)?.lessonNo ?? 1) / 40) * 100)}%` }}
              />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <ReadButton
              id={courseLesson.id}
              title={courseLesson.title}
              script={courseLesson.script}
              audioPath={courseLesson.audioPath}
              section="ai-course"
              size="sm"
              label="朗读本讲"
            />
            <a
              href="/course"
              className="rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-paper transition-opacity hover:opacity-90"
            >
              继续学习
            </a>
          </div>
        </section>
      )}

      <section className="mt-8 grid gap-4 md:grid-cols-2">
        {cards.map((card) => {
          const a = card.articles[0];
          return (
            <div
              key={card.id}
              className="group relative flex flex-col rounded-[var(--radius-card)] border border-line bg-surface p-5 transition-shadow hover:shadow-[var(--shadow-lift)] md:p-6"
            >
              <div className="flex items-baseline gap-3">
                <span className="display text-[22px] font-bold text-[#978A75]">{String(card.index).padStart(2, "0")}</span>
                <span className="kicker">{card.label}</span>
              </div>
              <a href={card.href} className="mt-3 block">
                <h2 className="display text-[20px] font-bold leading-snug transition-colors group-hover:text-accent">
                  {card.title}
                </h2>
              </a>
              <p className="mt-2.5 min-h-[68px] text-[14px] leading-relaxed text-muted">{brief(card.summary)}</p>
              <div className="mt-4 flex items-center gap-3 border-t border-line pt-3.5">
                <span className="text-[12px] text-muted">{card.meta}</span>
                {a && (
                  <ReadButton
                    id={a.id}
                    title={a.title}
                    script={a.script}
                    audioPath={a.audioPath}
                    section={card.id}
                    size="sm"
                    label="朗读"
                  />
                )}
                <a
                  href={card.href}
                  aria-label={`打开${card.label}`}
                  className="ml-auto flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-accent"
                >
                  <IconChevron size={16} />
                </a>
              </div>
            </div>
          );
        })}
      </section>

      {aiTools.length > 0 && (
        <section className="mt-10">
          <div className="flex items-baseline justify-between border-b border-line pb-3">
            <h2 className="display text-[20px] font-bold">本周开源工具榜</h2>
            <span className="text-[12px] text-muted">GitHub 新建仓库 · 按星标排序</span>
          </div>
          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            {aiTools.map((tool, i) => (
              <li key={tool.id} className="flex items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface px-4 py-3">
                <span className="display text-[20px] font-bold text-muted">{String(i + 1).padStart(2, "0")}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-medium">{tool.title}</div>
                  <div className="truncate text-[12px] text-muted">
                    {String((tool.meta as any)?.fullName ?? "")} · {formatNumber(Number((tool.meta as any)?.stars ?? 0))} 星
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}