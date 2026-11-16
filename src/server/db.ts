import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './config.js';
import type { Article, RunRecord, SectionId } from '../shared/types.js';

const DB_PATH = path.join(DATA_DIR, "app.db");
fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL;");
db.exec(`
CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY,
  section TEXT NOT NULL,
  date TEXT NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT "",
  summary TEXT NOT NULL DEFAULT "",
  takeaways TEXT NOT NULL DEFAULT "[]",
  body TEXT NOT NULL DEFAULT "",
  script TEXT NOT NULL DEFAULT "",
  reading_minutes INTEGER NOT NULL DEFAULT 0,
  audio_path TEXT,
  meta TEXT NOT NULL DEFAULT "{}",
  sources TEXT NOT NULL DEFAULT "[]",
  generated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_articles ON articles(section, date DESC);
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section TEXT NOT NULL,
  date TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  message TEXT,
  article_id TEXT
);
CREATE TABLE IF NOT EXISTS course_lessons (
  lesson_no INTEGER PRIMARY KEY,
  article_id TEXT NOT NULL,
  date TEXT NOT NULL,
  generated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS course_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  current_lesson INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);
`);

function safeParse<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

interface ArticleRow {
  id: string;
  section: string;
  date: string;
  title: string;
  subtitle: string;
  summary: string;
  takeaways: string;
  body: string;
  script: string;
  reading_minutes: number;
  audio_path: string | null;
  meta: string;
  sources: string;
  generated_at: string;
}

function rowToArticle(row: ArticleRow): Article {
  return {
    id: row.id,
    section: row.section as SectionId,
    date: row.date,
    title: row.title,
    subtitle: row.subtitle,
    summary: row.summary,
    takeaways: safeParse<string[]>(row.takeaways, []),
    body: row.body,
    script: row.script,
    readingMinutes: row.reading_minutes,
    audioPath: row.audio_path,
    meta: safeParse<Record<string, unknown>>(row.meta, {}),
    sources: safeParse<Article["sources"]>(row.sources, []),
    generatedAt: row.generated_at,
  };
}

export function saveArticle(a: Article): void {
  db.prepare(
    `INSERT INTO articles (id, section, date, title, subtitle, summary, takeaways, body, script, reading_minutes, audio_path, meta, sources, generated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title=excluded.title, subtitle=excluded.subtitle, summary=excluded.summary,
       takeaways=excluded.takeaways, body=excluded.body, script=excluded.script,
       reading_minutes=excluded.reading_minutes, audio_path=excluded.audio_path,
       meta=excluded.meta, sources=excluded.sources, generated_at=excluded.generated_at`
  ).run(
    a.id,
    a.section,
    a.date,
    a.title,
    a.subtitle,
    a.summary,
    JSON.stringify(a.takeaways),
    a.body,
    a.script,
    a.readingMinutes,
    a.audioPath ?? null,
    JSON.stringify(a.meta),
    JSON.stringify(a.sources),
    a.generatedAt
  );
}

export function getArticle(id: string): Article | undefined {
  const row = db.prepare("SELECT * FROM articles WHERE id = ?").get(id) as unknown as ArticleRow | undefined;
  return row ? rowToArticle(row) : undefined;
}

export function listArticles(section: SectionId, limit = 30): Article[] {
  const rows = db
    .prepare("SELECT * FROM articles WHERE section = ? ORDER BY date DESC, id ASC LIMIT ?")
    .all(section, limit) as unknown as ArticleRow[];
  return rows.map(rowToArticle);
}

export function getLatest(section: SectionId): Article | undefined {
  const row = db
    .prepare("SELECT * FROM articles WHERE section = ? ORDER BY date DESC LIMIT 1")
    .get(section) as unknown as ArticleRow | undefined;
  return row ? rowToArticle(row) : undefined;
}

export function listAiToolsByWeek(isoWeek: string): Article[] {
  const rows = db
    .prepare("SELECT * FROM articles WHERE section = ? AND id LIKE ? ORDER BY id ASC")
    .all("ai-tools", isoWeek + "%") as unknown as ArticleRow[];
  return rows.map(rowToArticle);
}

export function listAiWeeklyByWeek(isoWeek: string): Article[] {
  const rows = db
    .prepare("SELECT * FROM articles WHERE section = ? AND id LIKE ? ORDER BY id ASC")
    .all("ai-weekly", isoWeek + "%") as unknown as ArticleRow[];
  return rows.map(rowToArticle);
}

export function latestDate(): string | undefined {
  const row = db.prepare("SELECT MAX(date) AS d FROM articles").get() as { d: string | null };
  return row?.d ?? undefined;
}

export function startRun(section: SectionId, date: string): number {
  const info = db
    .prepare("INSERT INTO runs (section, date, started_at, status) VALUES (?, ?, ?, ?)")
    .run(section, date, new Date().toISOString(), "running");
  return Number(info.lastInsertRowid);
}

export function finishRun(id: number, status: "ok" | "error", message: string | null, articleId: string | null): void {
  db.prepare("UPDATE runs SET finished_at = ?, status = ?, message = ?, article_id = ? WHERE id = ?").run(
    new Date().toISOString(),
    status,
    message,
    articleId,
    id
  );
}

export function listRuns(limit = 30): RunRecord[] {
  const rows = db.prepare("SELECT * FROM runs ORDER BY id DESC LIMIT ?").all(limit) as unknown as Array<{
    id: number;
    section: string;
    date: string;
    started_at: string;
    finished_at: string | null;
    status: string;
    message: string | null;
    article_id: string | null;
  }>;
  return rows.map((r) => ({
    id: r.id,
    section: r.section as SectionId,
    date: r.date,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    status: r.status as RunRecord["status"],
    message: r.message,
    articleId: r.article_id,
  }));
}

export function countArticles(): number {
  const row = db.prepare("SELECT COUNT(*) AS c FROM articles").get() as { c: number };
  return row.c;
}

export interface CourseLessonRow {
  lessonNo: number;
  articleId: string;
  date: string;
  generatedAt: string;
}

export function listCourseLessons(): CourseLessonRow[] {
  const rows = db
    .prepare("SELECT lesson_no, article_id, date, generated_at FROM course_lessons ORDER BY lesson_no ASC")
    .all() as unknown as Array<{ lesson_no: number; article_id: string; date: string; generated_at: string }>;
  return rows.map((r) => ({
    lessonNo: r.lesson_no,
    articleId: r.article_id,
    date: r.date,
    generatedAt: r.generated_at,
  }));
}

export function linkCourseLesson(lessonNo: number, articleId: string, date: string): void {
  db.prepare(
    "INSERT INTO course_lessons (lesson_no, article_id, date, generated_at) VALUES (?, ?, ?, ?) ON CONFLICT(lesson_no) DO UPDATE SET article_id=excluded.article_id, date=excluded.date, generated_at=excluded.generated_at"
  ).run(lessonNo, articleId, date, new Date().toISOString());
}

export function getCourseArticle(lessonNo: number): Article | undefined {
  const row = db
    .prepare("SELECT article_id FROM course_lessons WHERE lesson_no = ?")
    .get(lessonNo) as { article_id: string } | undefined;
  return row ? getArticle(row.article_id) : undefined;
}

export function getCourseState(): { currentLesson: number; updatedAt: string } {
  const row = db.prepare("SELECT current_lesson, updated_at FROM course_state WHERE id = 1").get() as
    | { current_lesson: number; updated_at: string }
    | undefined;
  if (!row) {
    setCurrentLesson(1);
    return { currentLesson: 1, updatedAt: new Date().toISOString() };
  }
  return { currentLesson: row.current_lesson, updatedAt: row.updated_at };
}

db.exec(
  "CREATE TABLE IF NOT EXISTS topic_usage (topic_key TEXT PRIMARY KEY, kind TEXT NOT NULL, used_at TEXT NOT NULL)"
);

export function markTopicUsed(kind: string, key: string): void {
  db.prepare(
    "INSERT INTO topic_usage (topic_key, kind, used_at) VALUES (?, ?, ?) ON CONFLICT(topic_key) DO UPDATE SET used_at=excluded.used_at"
  ).run(`${kind}::${key}`, kind, new Date().toISOString());
}

export function listUsedTopics(kind: string): Array<{ key: string; usedAt: string }> {
  const rows = db
    .prepare("SELECT topic_key, used_at FROM topic_usage WHERE kind = ? ORDER BY used_at ASC")
    .all(kind) as unknown as Array<{ topic_key: string; used_at: string }>;
  return rows.map((r) => ({ key: r.topic_key, usedAt: r.used_at }));
}

export function isTopicUsed(kind: string, key: string): boolean {
  const row = db.prepare("SELECT 1 AS x FROM topic_usage WHERE topic_key = ?").get(`${kind}::${key}`);
  return Boolean(row);
}

export function clearTopicUsage(kind?: string): void {
  if (kind) db.prepare("DELETE FROM topic_usage WHERE kind = ?").run(kind);
  else db.prepare("DELETE FROM topic_usage").run();
}

export function setCurrentLesson(n: number): void {
  db.prepare(
    "INSERT INTO course_state (id, current_lesson, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET current_lesson=excluded.current_lesson, updated_at=excluded.updated_at"
  ).run(n, new Date().toISOString());
}