import { generateDaily } from '../pipeline/daily.js';
import { todayStr } from '../pipeline/common.js';
import type { SectionId } from '../../shared/types.js';

const date = process.argv[2] ?? todayStr();
const sectionsArg = process.argv[3];
const sections = sectionsArg
  ? (sectionsArg.split(",").map((s) => s.trim()).filter(Boolean) as SectionId[])
  : undefined;

generateDaily(date, { sections, force: process.argv.includes("--force") })
  .then((report) => {
    console.log("[daily] 完成：", JSON.stringify(report, null, 2));
    process.exit(report.failed.length ? 1 : 0);
  })
  .catch((err) => {
    console.error("[daily] 整体失败：", err instanceof Error ? err.message : err);
    process.exit(1);
  });