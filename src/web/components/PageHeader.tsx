export function PageHeader({
  kicker,
  title,
  desc,
}: {
  kicker: string;
  title: string;
  desc?: string;
}) {
  return (
    <div className="mb-9 border-b border-line pb-6">
      <span className="kicker">{kicker}</span>
      <h1 className="display mt-2.5 max-w-[20ch] text-[32px] font-bold leading-[1.16] md:text-[40px]">{title}</h1>
      {desc && <p className="mt-3.5 max-w-[58ch] text-[14px] leading-relaxed text-muted md:text-[16px]">{desc}</p>}
    </div>
  );
}