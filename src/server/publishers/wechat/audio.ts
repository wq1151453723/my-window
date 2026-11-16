import fs from 'node:fs';
import path from 'node:path';
import { AUDIO_DIR } from '../../config.js';
import { synthesize, estimateDurationSeconds } from '../../tts/edge.js';
import type { WechatDoc } from './html.js';

/** 公众号语音单条上限约 2 分钟，稿子控制在 90 秒左右 */
export const AUDIO_TARGET_SECONDS = 90;
export const AUDIO_HARD_LIMIT_SECONDS = 115;

const CN_DIGITS = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

function cnNumber(n: number): string {
  if (!Number.isFinite(n) || n < 0) return String(n);
  if (n < 10) return CN_DIGITS[n];
  if (n < 20) return n === 10 ? "十" : `十${CN_DIGITS[n % 10]}`;
  if (n < 100) {
    const tens = Math.floor(n / 10);
    const ones = n % 10;
    return `${CN_DIGITS[tens]}十${ones ? CN_DIGITS[ones] : ""}`;
  }
  return String(n);
}

export function numbersToChinese(text: string): string {
  return text.replace(/\d+/g, (m) => cnNumber(Number(m)));
}

function clip(text: string, max: number): string {
  const s = (text ?? "").replace(/\s+/g, " ").trim();
  if (s.length <= max) return s.replace(/[。！？；，、\s]+$/, "");
  let cut = s.slice(0, max);
  const stop = Math.max(cut.lastIndexOf("。"), cut.lastIndexOf("；"), cut.lastIndexOf("，"), cut.lastIndexOf(" "));
  if (stop > max * 0.5) cut = cut.slice(0, stop);
  return cut.replace(/[。！？；，、\s]+$/, "");
}

export function buildDigestScript(doc: WechatDoc): string {
  const parts: string[] = [];
  parts.push(`早上好，这里是《我的窗口》的 AI 学习，今天是第${doc.lessonNo}讲。`);
  parts.push(`这一讲的主题是，${doc.lessonTitle.slice(0, 30)}。`);
  if (doc.goal) parts.push(`要弄懂的是，${clip(doc.goal, 62)}。`);
  if (doc.anchor) parts.push(`可以这样理解，${clip(doc.anchor, 74)}。`);
  if (doc.exercise) parts.push(`听完动手做一件事，${clip(doc.exercise, 62)}。`);
  parts.push("想听完整版，可以打开网页版。今天就到这里。");
  let text = numbersToChinese(parts.join(""));
  while (estimateDurationSeconds(text) > AUDIO_TARGET_SECONDS && text.length > 120) {
    text = text.slice(0, Math.floor(text.length * 0.92)).replace(/[，。、]$/, "") + "。";
  }
  return text;
}

export interface WechatAudio {
  filePath: string;
  relativePath: string;
  bytes: number;
  seconds: number;
  script: string;
}

export async function buildWechatAudio(doc: WechatDoc, date: string): Promise<WechatAudio> {
  const script = buildDigestScript(doc);
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
  const filePath = path.join(AUDIO_DIR, `wechat-${date}.mp3`);
  const res = await synthesize(script, filePath);
  const seconds = Math.round(estimateDurationSeconds(script));
  if (seconds > AUDIO_HARD_LIMIT_SECONDS) {
    console.warn(`[wechat] 摘要音频 ${seconds} 秒，超过建议上限`);
  }
  return {
    filePath,
    relativePath: `wechat-${date}.mp3`,
    bytes: res.bytes,
    seconds,
    script,
  };
}