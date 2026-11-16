import type { ReactNode } from 'react';
import { IconBook, IconSpark, IconTrend, IconGlobe, IconCap } from './Icons';

const NAV = [
  { href: "/", label: "今日", icon: null },
  { href: "/books", label: "书籍学习", icon: IconBook },
  { href: "/course", label: "AI 学习", icon: IconCap },
  { href: "/ai", label: "前沿 AI", icon: IconSpark },
  { href: "/markets", label: "全球金融", icon: IconTrend },
  { href: "/world", label: "全球局势", icon: IconGlobe },
] as const;

export function Shell({
  children,
  active,
  onGenerate,
  generating,
}: {
  children: ReactNode;
  active: string;
  onGenerate: () => void;
  generating: boolean;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-paper/92 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1120px] items-center gap-6 px-5 md:px-8">
          <a href="/" className="flex min-h-[24px] shrink-0 items-baseline gap-2">
            <span className="display text-[20px] font-bold tracking-tight">我的窗口</span>
            <span className="kicker hidden sm:inline">Daily Digest</span>
          </a>
          <nav className="ml-auto hidden items-center gap-1 md:flex">
            {NAV.map((item) => {
              const on = active === item.href;
              return (
                <a
                  key={item.href}
                  href={item.href}
                  className={
                    `rounded-full px-3.5 py-2 text-[14px] transition-colors ${
                      on
                        ? "bg-ink text-paper font-medium"
                        : "text-ink-soft hover:bg-surface-2"
                    }`
                  }
                >
                  {item.label}
                </a>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-2.5 md:ml-0">
            <a
              href="/wechat"
              className="hidden h-9 items-center rounded-full border border-line-strong px-3.5 text-[14px] text-ink-soft transition-colors hover:border-accent hover:text-accent sm:inline-flex"
            >
              公众号
            </a>
            <button
              onClick={onGenerate}
              disabled={generating}
              className={
                `flex h-9 items-center gap-2 rounded-full border border-line-strong px-3.5 text-[14px] text-ink-soft transition-colors ${
                  generating ? "opacity-50" : "hover:bg-surface"
                }`
              }
            >
              {generating ? "生成中…" : "立即生成"}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1120px] flex-1 px-5 pb-40 pt-8 md:px-8 md:pb-32">
        {children}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-40 grid grid-cols-6 border-t border-line bg-surface/97 backdrop-blur md:hidden">
        {NAV.map((item) => {
          const on = active === item.href;
          const Icon = item.icon;
          return (
            <a
              key={item.href}
              href={item.href}
              className={
                `flex min-h-[60px] flex-col items-center justify-center gap-1 text-[12px] ${
                  on ? "text-accent" : "text-muted"
                }`
              }
            >
              {Icon ? <Icon size={19} /> : <span className="h-[19px] w-[19px] rounded-full border-[1.5px] border-current" />}
              <span>{item.label}</span>
            </a>
          );
        })}
      </nav>
    </div>
  );
}