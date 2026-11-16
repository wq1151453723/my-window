import { useAudio } from './AudioProvider';
import { IconVolume, IconPause } from './Icons';

const BASE = "inline-flex items-center gap-1.5 rounded-full border transition-colors";

export function ReadButton({
  id,
  title,
  script,
  audioPath,
  section,
  label = "朗读本文",
  size = "md",
}: {
  id: string;
  title: string;
  script: string;
  audioPath?: string | null;
  section: string;
  label?: string;
  size?: "md" | "sm";
}) {
  const { current, playing, play, toggle } = useAudio();
  const isCurrent = current?.id === id;
  const active = isCurrent && playing;
  const sizeCls = size === "sm" ? "h-8 px-3 text-[12px]" : "h-10 px-4 text-[14px]";
  const toneCls = active
    ? "border-accent bg-accent text-paper"
    : "border-line-strong bg-surface text-ink-soft hover:border-accent hover:text-accent";
  return (
    <button
      onClick={() => (isCurrent ? toggle() : play({ id, title, script, audioPath, section }))}
      className={`${BASE} ${sizeCls} ${toneCls}`}
    >
      {active ? <IconPause size={size === "sm" ? 14 : 16} /> : <IconVolume size={size === "sm" ? 14 : 16} />}
      {active ? "暂停" : label}
    </button>
  );
}