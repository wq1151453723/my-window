import type { Article, SectionId } from '@shared/types';

export interface TodayResponse {
  date: string;
  weekKey: string;
  books: Article | null;
  'ai-course': Article | null;
  'ai-tools': Article[];
  'ai-weekly': Article | null;
  markets: Article | null;
  world: Article | null;
}

export interface HealthResponse {
  ok: boolean;
  now: string;
  today: string;
  articles: number;
  providers: Array<{ id: string; baseUrl: string; model: string; hasKey: boolean }>;
}

export interface LessonTitle {
  no: number;
  stage: string;
  stageTitle: string;
  title: string;
}

export interface StageInfo {
  stage: string;
  title: string;
  from: number;
  to: number;
  blurb: string;
}

export interface CourseInfo {
  currentLesson: number;
  latestLessonNo: number;
  totalLessons: number;
  stages: StageInfo[];
  titles: LessonTitle[];
  done: Array<{ lessonNo: number; date: string; articleId: string }>;
  latest: Article | null;
}

export interface WechatPreview {
  date: string;
  title: string;
  digest: string;
  contentHtml: string;
  sectionCount: number;
  audioPath: string | null;
  audioSeconds: number | null;
  images: Array<{ kind: string; label: string; url: string; width: number; height: number; bytes: number }>;
  status: { configured: boolean; appId?: string; reason?: string };
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return (await res.json()) as T;
}

async function getJson<T>(url: string, timeoutMs = 20000): Promise<T> {
  const attempt = async (): Promise<T> =>
    Promise.race([
      fetchJson<T>(url),
      new Promise<never>((_, reject) =>
        window.setTimeout(() => reject(new Error(`请求超时（${timeoutMs / 1000} 秒）：${url}`)), timeoutMs),
      ),
    ]);
  try {
    return await attempt();
  } catch (err) {
    // 网络类抖动（连接被重置/代理吞包）自动重试一次
    await new Promise((r) => window.setTimeout(r, 800));
    return attempt();
  }
}

export const api = {
  today: () => getJson<TodayResponse>("/api/today"),
  section: (s: SectionId) => getJson<{ section: string; articles: Article[] }>(`/api/articles/${s}`),
  article: (id: string) => getJson<Article>(`/api/article/${id}`),
  course: () => getJson<CourseInfo>("/api/course"),
  courseLesson: (no: number) => getJson<Article>(`/api/course/lesson/${no}`),
  history: (symbol: string, days = 30) =>
    getJson<{ symbol: string; t: number[]; c: number[] }>(`/api/history?symbol=${encodeURIComponent(symbol)}&days=${days}`),
  health: () => getJson<HealthResponse>("/api/health"),
  wechatPreview: () => getJson<WechatPreview>("/api/wechat/preview"),
  wechatImages: () =>
    fetch("/api/wechat/images", { method: "POST" }).then((r) => r.json()) as Promise<{
      ok: boolean;
      images: Array<{ kind: string; label: string; url: string; width: number; height: number; bytes: number }>;
    }>,
  wechatAudio: () =>
    fetch("/api/wechat/audio", { method: "POST" }).then((r) => r.json()) as Promise<{
      audioPath: string;
      seconds: number;
      bytes: number;
      script: string;
    }>,
  wechatPublish: () =>
    fetch("/api/wechat/publish", { method: "POST" }).then((r) => r.json()) as Promise<{
      ok: boolean;
      mediaId?: string;
      title?: string;
      withAudio?: boolean;
      error?: string;
    }>,
  generate: (section?: string, force = false) =>
    fetch("/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ section, force }),
    }).then((r) => r.json()),
};