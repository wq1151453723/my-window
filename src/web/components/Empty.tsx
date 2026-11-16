export function Empty({
  title,
  desc,
  onGenerate,
  generating,
}: {
  title: string;
  desc: string;
  onGenerate: () => void;
  generating: boolean;
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-dashed border-line-strong bg-surface px-6 py-14 text-center">
      <h2 className="display text-[22px] font-bold">{title}</h2>
      <p className="mx-auto mt-2 max-w-[46ch] text-[14px] leading-relaxed text-muted">{desc}</p>
      <button
        onClick={onGenerate}
        disabled={generating}
        className="mt-6 h-10 rounded-full bg-accent px-5 text-[12px] font-medium text-paper transition-opacity disabled:opacity-50"
      >
        {generating ? "正在生成…" : "生成这一板块"}
      </button>
    </div>
  );
}