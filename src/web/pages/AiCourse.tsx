import { useEffect, useMemo, useState } from 'react';
import type { Article } from '@shared/types';
import { api, type CourseInfo, type TodayResponse } from '../lib/api';
import { ArticleView } from '../components/ArticleView';
import { PageHeader } from '../components/PageHeader';
import { Empty } from '../components/Empty';
import { ReadButton } from '../components/ReadButton';
import { Markdown } from '../lib/markdown';

export function AiCourse({
  today,
  onGenerate,
  generating,
}: {
  today: TodayResponse | null;
  onGenerate: () => void;
  generating: boolean;
}) {
  const lesson = today?.["ai-course"] ?? null;
  const weekly = today?.["ai-weekly"] ?? null;
  const [course, setCourse] = useState<CourseInfo | null>(null);
  const [view, setView] = useState<Article | null>(null);
  const [busy, setBusy] = useState(false);
  const [weeklyOpen, setWeeklyOpen] = useState(false);

  useEffect(() => {
    api.course().then(setCourse).catch(() => setCourse(null));
  }, []);

  const shown = view ?? lesson;
  const meta = (shown?.meta ?? {}) as Record<string, any>;
  const lessonNo = Number(meta.lessonNo ?? 0);
  const total = course?.totalLessons ?? 40;
  const doneSet = useMemo(() => new Set((course?.done ?? []).map((d) => d.lessonNo)), [course]);
  const titles = course?.titles ?? [];

  const openLesson = async (no: number) => {
    if (!doneSet.has(no)) return;
    setBusy(true);
    try {
      const a = await api.courseLesson(no);
      setView(a);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setView(null);
    } finally {
      setBusy(false);
    }
  };

  const infoBlocks: Array<[string, string]> = [
    ["这一讲要弄懂", String(meta.goal ?? "")],
    ["从哪儿看起", String(meta.anchor ?? "")],
    ["动手练一下", String(meta.exercise ?? "")],
  ];

  return (
    <div>
      <PageHeader
        kicker="AI 学习 · 每天一讲"
        title="从你每天调的那个 API 出发，把大模型的里子讲明白"
        desc="四十讲补完原理：一次请求的旅程 → 模型怎么来的 → 应用原理 → 看得懂前沿 → 动手做。每讲都用当周真实的东西举例。"
      />

      {!shown ? (
        <Empty
          title="今天这一讲还没生成"
          desc="生成后会给你一讲讲透的原理课，外加一份本周技术动态速递。"
          onGenerate={onGenerate}
          generating={generating}
        />
      ) : (
        <>
          <ArticleView
            article={shown}
            kicker={`第 ${lessonNo} 讲 · ${String(meta.stageTitle ?? "")}`}
            badge={
              <span className="rounded-full border border-line-strong bg-surface px-3.5 py-1.5 text-[12px] text-ink-soft">
                进度 {lessonNo} / {total}
              </span>
            }
          >
            <section className="grid gap-3 md:grid-cols-3">
              {infoBlocks.map(([k, v]) =>
                v ? (
                  <div key={k} className="rounded-[var(--radius-card)] border border-line bg-surface-2 px-4 py-3">
                    <div className="text-[12px] text-muted">{k}</div>
                    <div className="mt-1.5 text-[14px] leading-relaxed text-ink-soft">{v}</div>
                  </div>
                ) : null
              )}
            </section>
            {meta.latestTieIn ? (
              <p className="mt-4 border-l-[3px] border-line-strong bg-surface-2 px-4 py-3 text-[13px] leading-relaxed text-muted">
                <span className="text-ink-soft">和这周的真实动态：</span>
                {String(meta.latestTieIn)}
              </p>
            ) : null}
          </ArticleView>

          <nav className="mt-8 flex max-w-[720px] items-center gap-3 border-t border-line pt-5">
            <button
              onClick={() => void openLesson(lessonNo - 1)}
              disabled={busy || !doneSet.has(lessonNo - 1)}
              className="rounded-full border border-line-strong bg-surface px-3.5 py-2 text-[13px] text-ink-soft disabled:opacity-40"
            >
              ← 上一讲
            </button>
            <span className="text-[12px] text-muted">
              {titles.find((t) => t.no === lessonNo + 1)?.title ?? "今天是这一讲的最后一讲"}
            </span>
            <button
              onClick={() => void openLesson(lessonNo + 1)}
              disabled={busy || !doneSet.has(lessonNo + 1)}
              className="ml-auto rounded-full border border-line-strong bg-surface px-3.5 py-2 text-[13px] text-ink-soft disabled:opacity-40"
            >
              下一讲 →
            </button>
          </nav>

          {course && course.stages.length > 0 && (
            <section className="mt-12">
              <div className="flex items-baseline justify-between border-b border-line pb-3">
                <h2 className="display text-[20px] font-bold">课程目录</h2>
                <span className="text-[12px] text-muted">
                  已学 {doneSet.size} / {total} 讲
                </span>
              </div>
              <div className="mt-6 space-y-8">
                {course.stages.map((stage) => (
                  <div key={stage.stage}>
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="kicker">{stage.stage}</span>
                      <h3 className="display text-[18px] font-bold">{stage.title}</h3>
                      <span className="text-[12px] text-muted">{stage.blurb}</span>
                    </div>
                    <ol className="mt-3 grid gap-2 md:grid-cols-2">
                      {course.titles
                        .filter((t) => t.stage === stage.stage)
                        .map((t) => {
                          const done = doneSet.has(t.no);
                          const current = t.no === lessonNo;
                          return (
                            <li key={t.no}>
                              <button
                                onClick={() => void openLesson(t.no)}
                                disabled={!done}
                                className={
                                  `flex w-full items-center gap-3 rounded-[var(--radius-card)] border px-4 py-2.5 text-left transition-colors ${
                                    current
                                      ? "border-accent bg-accent-soft"
                                      : done
                                        ? "border-line bg-surface hover:border-line-strong"
                                        : "border-dashed border-line bg-transparent text-muted"
                                  }`
                                }
                              >
                                <span className="w-6 shrink-0 font-serif text-[13px] tabular-nums text-muted">
                                  {String(t.no).padStart(2, "0")}
                                </span>
                                <span className="min-w-0 flex-1 truncate text-[14px]">{t.title}</span>
                                {current && (
                                  <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[11px] text-paper">
                                    本讲
                                  </span>
                                )}
                              </button>
                            </li>
                          );
                        })}
                    </ol>
                  </div>
                ))}
              </div>
            </section>
          )}

          {weekly && (
            <section className="mt-12 max-w-[720px]">
              <div className="flex items-baseline justify-between border-b border-line pb-3">
                <h2 className="display text-[20px] font-bold">本周技术速递</h2>
                <span className="text-[12px] text-muted">每周一篇 · 与课程并行</span>
              </div>
              <div className="mt-5 rounded-[var(--radius-card)] border border-line bg-surface p-5 md:p-6">
                <h3 className="display text-[20px] font-bold leading-snug">{weekly.title}</h3>
                {weekly.subtitle && (
                  <p className="mt-2 text-[15px] text-muted">{weekly.subtitle}</p>
                )}
                <p className="mt-3 max-w-[40em] text-[14px] leading-relaxed text-ink-soft">{weekly.summary}</p>
                {weekly.takeaways.length > 0 && (
                  <ul className="mt-4 space-y-2 border-t border-line pt-4">
                    {weekly.takeaways.map((t, i) => (
                      <li key={i} className="flex gap-2.5 text-[14px] leading-relaxed text-ink-soft">
                        <span className="mt-[2px] shrink-0 font-serif text-[12px] text-accent">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span>{t}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {weeklyOpen && <Markdown text={weekly.body} className="article-body mt-5" />}
                <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
                  <ReadButton
                    id={weekly.id}
                    title={weekly.title}
                    script={weekly.script}
                    audioPath={weekly.audioPath}
                    section={weekly.section}
                    size="sm"
                    label="朗读速递"
                  />
                  <button
                    onClick={() => setWeeklyOpen((v) => !v)}
                    className="rounded-full border border-line-strong bg-surface px-3 py-2 text-[12px] text-ink-soft hover:border-accent hover:text-accent"
                  >
                    {weeklyOpen ? "收起全文" : "展开全文"}
                  </button>
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}