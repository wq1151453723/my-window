import { useAudio } from './AudioProvider';
import { IconPlay, IconPause, IconClose } from './Icons';

function fmtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

const RATES = [0.75, 1, 1.25, 1.5];

export function AudioDock() {
  const { current, playing, progress, duration, rate, toggle, stop, seek, setRate, usingFallback } = useAudio();
  if (!current) return null;
  const nextRate = () => {
    const idx = RATES.indexOf(rate);
    setRate(RATES[(idx + 1) % RATES.length]);
  };
  return (
    <div className="fixed bottom-16 left-0 right-0 z-50 border-t border-line bg-surface/97 shadow-[var(--shadow-dock)] backdrop-blur md:bottom-0">
      <div className="mx-auto flex h-[68px] max-w-[1120px] items-center gap-3 px-4 md:px-8">
        <button
          onClick={toggle}
          aria-label={playing ? "暂停朗读" : "开始朗读"}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-paper transition-transform active:scale-95"
        >
          {playing ? <IconPause size={20} /> : <IconPlay size={20} />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[14px] font-medium">{current.title}</span>
            {usingFallback && (
              <span className="shrink-0 rounded-full bg-azure-soft px-2 py-0.5 text-[11px] text-azure">浏览器语音</span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={1000}
              value={Math.round(progress * 1000)}
              onChange={(e) => seek(Number(e.target.value) / 1000)}
              aria-label="播放进度"
              className="h-1 w-full max-w-[420px] cursor-pointer appearance-none rounded-full bg-line accent-[var(--color-accent)]"
            />
            <span className="shrink-0 text-[12px] text-muted tabular-nums">
              {fmtTime(progress * duration)} / {fmtTime(duration)}
            </span>
          </div>
        </div>
        <button
          onClick={nextRate}
          className="hidden h-9 shrink-0 rounded-full border border-line-strong px-3 text-[12px] text-ink-soft hover:bg-surface-2 sm:block"
        >
          {rate}×
        </button>
        <button
          onClick={stop}
          aria-label="关闭朗读"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-ink"
        >
          <IconClose size={18} />
        </button>
      </div>
    </div>
  );
}