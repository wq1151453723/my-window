import fs from 'node:fs';
import path from 'node:path';
import { AUDIO_DIR } from '../config.js';
import { synthesize, estimateDurationSeconds } from '../tts/edge.js';
import type { Article } from '../../shared/types.js';

export function todayStr(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(d);
}

export function isoWeekKey(d = new Date()): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function dayIndex(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Math.floor(Date.UTC(y, (m ?? 1) - 1, d ?? 1) / 86400000);
}

export function readingMinutes(script: string): number {
  return Math.max(1, Math.round(estimateDurationSeconds(script) / 60));
}

export async function attachAudio(article: Article): Promise<Article> {
  const minutes = readingMinutes(article.script);
  try {
    fs.mkdirSync(AUDIO_DIR, { recursive: true });
    const file = path.join(AUDIO_DIR, `${article.id}.mp3`);
    await synthesize(article.script, file);
    return { ...article, audioPath: `${article.id}.mp3`, readingMinutes: minutes };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[tts] ${article.id} 合成失败（保留无音频版本）：${msg}`);
    return { ...article, audioPath: null, readingMinutes: minutes };
  }
}