import type { SectionId } from '../../shared/types.js';
import { generateBooks } from './books.js';
import { generateAiTools } from './aiTools.js';
import { generateAiCourse } from './aiCourse.js';
import { generateAiWeekly } from './aiWeekly.js';
import { generateMarkets } from './markets.js';
import { generateWorld } from './world.js';
import { isoWeekKey } from './common.js';
import { getLatest, listAiToolsByWeek, listAiWeeklyByWeek } from '../db.js';

export interface DailyOptions {
  sections?: SectionId[];
  force?: boolean;
}

export interface DailyReport {
  date: string;
  ok: string[];
  failed: Array<{ section: string; error: string }>;
}

export async function generateDaily(date: string, opts: DailyOptions = {}): Promise<DailyReport> {
  const wanted = opts.sections ?? ["books", "ai-course", "ai-tools", "ai-weekly", "markets", "world"];
  const weekKey = isoWeekKey(new Date(`${date}T12:00:00+08:00`));
  const report: DailyReport = { date, ok: [], failed: [] };
  for (const section of wanted) {
    try {
      if (!opts.force) {
        if (section === "ai-tools") {
          if (listAiToolsByWeek(weekKey).length >= 5) {
            report.ok.push("ai-tools(本周已有5个，跳过)");
            continue;
          }
        } else if (section === "ai-weekly") {
          if (listAiWeeklyByWeek(weekKey).length >= 1) {
            report.ok.push("ai-weekly(本周已有，跳过)");
            continue;
          }
        } else {
          const existing = getLatest(section);
          if (existing && existing.date === date) {
            report.ok.push(`${section}(已有，跳过)`);
            continue;
          }
        }
      }
      if (section === "books") {
        await generateBooks(date);
      } else if (section === "ai-course") {
        await generateAiCourse(date);
      } else if (section === "ai-tools") {
        await generateAiTools(date, weekKey);
      } else if (section === "ai-weekly") {
        await generateAiWeekly(date, weekKey);
      } else if (section === "markets") {
        await generateMarkets(date);
      } else if (section === "world") {
        await generateWorld(date);
      }
      report.ok.push(section);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      report.failed.push({ section, error: msg });
      console.error(`[daily] ${section} 生成失败：${msg}`);
    }
  }
  return report;
}