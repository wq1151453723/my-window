import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from '../src/server/config.js';

const KEEP_DAYS = Number(process.env.KEEP_DAYS ?? 30);
const exportRoot = path.join(DATA_DIR, "exports");

if (!fs.existsSync(exportRoot)) {
  console.log("没有导出目录，跳过");
  process.exit(0);
}

const dirs = fs
  .readdirSync(exportRoot, { withFileTypes: true })
  .filter((d) => d.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(d.name))
  .map((d) => d.name)
  .sort();

let removed = 0;

// 1) 历史目录：超出保留天数的整目录删掉（音频最占地方）
const keep = new Set(dirs.slice(-KEEP_DAYS));
for (const d of dirs) {
  if (keep.has(d)) continue;
  const audioDir = path.join(exportRoot, d, "audio");
  if (fs.existsSync(audioDir)) {
    for (const f of fs.readdirSync(audioDir)) {
      fs.unlinkSync(path.join(audioDir, f));
      removed++;
    }
  }
}

// 2) 站点快照：音频只保留最近若干个（每天约 13 个文件）
const siteAudio = path.join(exportRoot, "site", "audio");
if (fs.existsSync(siteAudio)) {
  const files = fs.readdirSync(siteAudio).sort();
  const keepCount = KEEP_DAYS * 14;
  if (files.length > keepCount) {
    for (const f of files.slice(0, files.length - keepCount)) {
      fs.unlinkSync(path.join(siteAudio, f));
      removed++;
    }
  }
}

console.log(`清理旧音频 ${removed} 个，保留最近 ${KEEP_DAYS} 天`);
