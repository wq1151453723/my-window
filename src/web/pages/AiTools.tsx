import type { TodayResponse } from '../lib/api';
import { ToolCard } from '../components/ToolCard';
import { PageHeader } from '../components/PageHeader';
import { Empty } from '../components/Empty';

export function AiTools({
  today,
  onGenerate,
  generating,
}: {
  today: TodayResponse | null;
  onGenerate: () => void;
  generating: boolean;
}) {
  const tools = today?.["ai-tools"] ?? [];
  return (
    <div>
      <PageHeader
        kicker="前沿 AI 应用 · 每周五个"
        title="本周 GitHub 上最值得看的开源 AI 工具"
        desc="从近七天新建的高星仓库里挑五个，讲清楚它是什么、适合谁、怎么在你自己的电脑上跑起来。"
      />
      {tools.length === 0 ? (
        <Empty title="本周工具榜还没生成" desc="生成后会列出五个仓库的真实星标数、语言和上手路径。" onGenerate={onGenerate} generating={generating} />
      ) : (
        <div className="space-y-4">
          {tools.map((t, i) => (
            <ToolCard key={t.id} article={t} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}