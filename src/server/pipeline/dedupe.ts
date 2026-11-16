import type { SectionId } from '../../shared/types.js';
import { listArticles } from '../db.js';

export interface RecentItem {
  id: string;
  date: string;
  title: string;
  summary: string;
  keys: string[];
}

export type DuplicateLevel = "none" | "topic" | "copy";

export interface DedupVerdict {
  level: DuplicateLevel;
  score: number;
  matched: RecentItem[];
}

/** 去标点、空白与符号，只留中英文与数字，避免标点差异干扰相似度 */
export function normalize(text: string): string {
  return (text ?? "").replace(/[\s\p{P}\p{S}]+/gu, "").toLowerCase();
}

export function bigrams(text: string): Set<string> {
  const s = normalize(text);
  const out = new Set<string>();
  if (s.length === 1) {
    out.add(s);
    return out;
  }
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
}

/** 中文按二元组 Jaccard：同义改写会偏高，完全不同主题会很低 */
export function similarity(a: string, b: string): number {
  const A = bigrams(a);
  const B = bigrams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

export function titleSimilarity(a: string, b: string): number {
  return similarity(a, b);
}

/** 抄写级：整段几乎照搬 */
export const COPY_SUMMARY = 0.62;
export const COPY_TITLE = 0.72;
/** 同一话题：主题重合但可能只是角度不同 */
export const TOPIC_SUMMARY = 0.42;
export const TOPIC_TITLE = 0.5;
/** 局势板块：事件标题相似即视为讲过 */
export const EVENT_TITLE = 0.6;

function keysOf(section: SectionId, meta: Record<string, unknown>): string[] {
  const out: string[] = [];
  if (section === "books") {
    if (meta.book) out.push(String(meta.book));
    if (meta.discipline) out.push(String(meta.discipline));
  } else if (section === "ai-tools" || section === "ai-course") {
    if (meta.repoFullName) out.push(String(meta.repoFullName));
    if (meta.lessonTitle) out.push(String(meta.lessonTitle));
  } else if (section === "world") {
    const events = Array.isArray(meta.events) ? (meta.events as Array<Record<string, unknown>>) : [];
    for (const e of events) if (e?.title) out.push(String(e.title));
  } else if (section === "markets") {
    if (meta.marketMood) out.push(String(meta.marketMood));
  }
  return out;
}

export function collectRecent(section: SectionId, limit = 21): RecentItem[] {
  const articles = listArticles(section, limit);
  return articles.map((a) => ({
    id: a.id,
    date: a.date,
    title: a.title,
    summary: a.summary,
    keys: keysOf(section, a.meta as Record<string, unknown>),
  }));
}

export interface DraftShape {
  title: string;
  summary: string;
  takeaways?: string[];
  body?: string;
}

export function checkDuplicate(section: SectionId, draft: DraftShape, recent: RecentItem[]): DedupVerdict {
  const draftText = [draft.title, draft.summary, (draft.takeaways ?? []).join(" ")].join(" ");
  let best: DedupVerdict = { level: "none", score: 0, matched: [] };
  for (const item of recent) {
    const sSim = similarity(draft.summary, item.summary);
    const tSim = titleSimilarity(draft.title, item.title);
    const bodySim = draft.body ? similarity(draft.body.slice(0, 600), item.summary) : 0;
    const score = Math.max(sSim, tSim * 0.95, bodySim * 0.9);
    let level: DuplicateLevel = "none";
    if (sSim >= COPY_SUMMARY || (tSim >= COPY_TITLE && sSim >= 0.45)) level = "copy";
    else if (sSim >= TOPIC_SUMMARY || tSim >= TOPIC_TITLE) level = "topic";
    if (level === "none") continue;
    if (level === "copy" || best.level === "none" || score > best.score) {
      best = {
        level: level === "copy" ? "copy" : best.level === "copy" ? "copy" : level,
        score: Math.max(score, best.score),
        matched: best.matched.some((m) => m.id === item.id) ? best.matched : [...best.matched, item],
      };
    }
  }
  return best;
}

export function levelRank(level: DuplicateLevel): number {
  return level === "none" ? 0 : level === "topic" ? 1 : 2;
}

export function buildNoRepeatInstruction(verdict: DedupVerdict, sectionLabel: string): string {
  if (!verdict.matched.length) {
    return `【避免重复（硬性）】${sectionLabel}栏目最近的内容不要照搬。请换一个角度讲，或说明相比上次新增了什么。`;
  }
  const lines = verdict.matched
    .slice(0, 8)
    .map((m) => `- ${m.date}《${m.title}》：${m.summary.slice(0, 110)}`)
    .join("\n");
  return [
    "【避免重复（硬性）】下面这些" + sectionLabel + "内容最近已经发布过：",
    lines,
    "",
    "要求：",
    "1. 不要照搬上面的主题、结论、论据与措辞，也不要换个标题重讲同一段话。",
    "2. 如果同一件事确实又有了新进展（例如新的数据、新的官方动作、新的时间节点），可以再讲，但必须在正文里明确写出「相比上次新增了什么」，并以新进展为主线。",
    "3. 如果这几天其实没有实质变化，就换一个更值得讲的角度切入，不要重复上次的判断。",
  ].join("\n");
}

export interface WorldEventItem {
  date: string;
  title: string;
  whatHappened: string;
}

export function collectRecentWorldEvents(days = 10): WorldEventItem[] {
  const out: WorldEventItem[] = [];
  for (const a of listArticles("world", days)) {
    const meta = a.meta as Record<string, unknown>;
    const events = Array.isArray(meta.events) ? (meta.events as Array<Record<string, unknown>>) : [];
    for (const e of events) {
      if (e?.title) {
        out.push({
          date: a.date,
          title: String(e.title),
          whatHappened: String(e.whatHappened ?? ""),
        });
      }
    }
  }
  return out;
}

export function findDuplicateEvents(draft: { meta: Record<string, unknown> }, past: WorldEventItem[]): {
  duplicates: Array<{ title: string; matched: WorldEventItem }>;
  count: number;
} {
  const events = Array.isArray(draft.meta.events) ? (draft.meta.events as Array<Record<string, unknown>>) : [];
  const duplicates: Array<{ title: string; matched: WorldEventItem }> = [];
  for (const e of events) {
    const title = String(e?.title ?? "");
    if (!title) continue;
    for (const p of past) {
      if (titleSimilarity(title, p.title) >= EVENT_TITLE) {
        duplicates.push({ title, matched: p });
        break;
      }
    }
  }
  return { duplicates, count: duplicates.length };
}

export function buildEventNoRepeatInstruction(past: WorldEventItem[]): string {
  const lines = past
    .slice(0, 12)
    .map((p) => `- ${p.date}：${p.title}`)
    .join("\n");
  return [
    "【事件去重（硬性）】下面这些事件最近几天已经讲过：",
    lines,
    "",
    "要求：",
    "1. 这五条里不要再出现同样的事件。",
    "2. 如果某个事件确实有新进展（例如新的官方动作、新的数据、时间点推进），可以保留，但必须把「新增了什么」写清楚，并且只占一条。",
    "3. 找不到五条新事件时，请放宽到全球其他正在发生的要事，不要用旧事件凑数。",
  ].join("\n");
}