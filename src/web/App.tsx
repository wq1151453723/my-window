import { useCallback, useEffect, useState } from 'react';
import { api, type TodayResponse } from './lib/api';
import { AudioProvider } from './components/AudioProvider';
import { AudioDock } from './components/AudioDock';
import { Shell } from './components/Shell';
import { Home } from './pages/Home';
import { Books } from './pages/Books';
import { AiCourse } from './pages/AiCourse';
import { AiTools } from './pages/AiTools';
import { Markets } from './pages/Markets';
import { World } from './pages/World';
import { Wechat } from './pages/Wechat';

function routeFromLocation(): string {
  const path = window.location.pathname;
  if (path && path !== "/" && !path.includes(".")) return path.replace(/\/$/, "");
  const raw = (window.location.hash || "#/").replace(/^#/, "");
  return raw.startsWith("/") ? raw : `/${raw}`;
}

function Root() {
  const [route, setRoute] = useState(routeFromLocation());
  const [today, setToday] = useState<TodayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.today();
      setToday(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onHash = () => setRoute(routeFromLocation());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!generating) return;
    const timer = window.setInterval(() => {
      void load();
    }, 10000);
    return () => window.clearInterval(timer);
  }, [generating, load]);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    try {
      await api.generate();
      window.setTimeout(() => setGenerating(false), 240000);
    } catch {
      setGenerating(false);
    }
  }, []);

  const active =
    route === "/books"
      ? "/books"
      : route === "/course"
        ? "/course"
        : route === "/ai"
          ? "/ai"
          : route === "/markets"
            ? "/markets"
            : route === "/world"
              ? "/world"
              : route === "/wechat"
                ? "/wechat"
                : "/";

  return (
    <Shell active={active} onGenerate={handleGenerate} generating={generating}>
      {error && (
        <div className="mb-6 rounded-[var(--radius-card)] border border-accent bg-accent-soft px-4 py-3 text-[13.5px] text-accent-ink">
          读取失败：{error}　（若是后端没启动，先在项目目录跑 pnpm dev）
        </div>
      )}
      {loading && !today ? (
        <div className="py-20 text-center text-[14px] text-muted">正在读取今日内容…</div>
      ) : route === "/books" ? (
        <Books today={today} onGenerate={handleGenerate} generating={generating} />
      ) : route === "/course" ? (
        <AiCourse today={today} onGenerate={handleGenerate} generating={generating} />
      ) : route === "/ai" ? (
        <AiTools today={today} onGenerate={handleGenerate} generating={generating} />
      ) : route === "/markets" ? (
        <Markets today={today} onGenerate={handleGenerate} generating={generating} />
      ) : route === "/world" ? (
        <World today={today} onGenerate={handleGenerate} generating={generating} />
      ) : route === "/wechat" ? (
        <Wechat />
      ) : (
        <Home today={today} />
      )}
    </Shell>
  );
}

export function App() {
  return (
    <AudioProvider>
      <Root />
      <AudioDock />
    </AudioProvider>
  );
}