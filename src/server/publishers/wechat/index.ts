import path from 'node:path';
import fs from 'node:fs';
import { AUDIO_DIR } from '../../config.js';
import { getLatest, listAiToolsByWeek } from '../../db.js';
import { isoWeekKey } from '../../pipeline/common.js';
import { fetchHistory } from '../../sources/market.js';
import { buildWechatDoc, renderWechatHtml, type WechatDoc } from './html.js';
import { buildWechatAudio } from './audio.js';
import { createDraft, getAccessToken, uploadVoiceMaterial, wechatCredentials, wechatStatus } from './api.js';
import { IMAGE_DIR, renderWechatImages, type RenderedImage } from './render.js';
import type { ImageInput } from './images.js';

export function dateLineOf(date: string): string {
  const d = new Date(`${date}T00:00:00+08:00`);
  const week = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][d.getDay()];
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 · ${week}`;
}

export function collectWechatDoc(date: string): WechatDoc {
  return buildWechatDoc({
    date,
    dateLine: dateLineOf(date),
    course: getLatest("ai-course") ?? null,
  });
}

async function imageInput(date: string): Promise<ImageInput> {
  const doc = collectWechatDoc(date);
  return {
    date,
    dateLine: doc.dateLine,
    course: getLatest("ai-course") ?? null,
  };
}

const manifestPath = (date: string) => path.join(IMAGE_DIR, `${date}-manifest.json`);

export async function ensureWechatImages(date: string, force = false): Promise<RenderedImage[]> {
  if (!force) {
    try {
      if (fs.existsSync(manifestPath(date))) {
        const cached = JSON.parse(fs.readFileSync(manifestPath(date), "utf8")) as RenderedImage[];
        const allExist = cached.every((img) => fs.existsSync(path.join(IMAGE_DIR, img.file)));
        if (allExist && cached.length) return cached;
      }
    } catch {
      /* 缓存损坏就重新生成 */
    }
  }
  const input = await imageInput(date);
  const rendered = renderWechatImages(input, date);
  fs.mkdirSync(IMAGE_DIR, { recursive: true });
  fs.writeFileSync(manifestPath(date), JSON.stringify(rendered, null, 2), "utf8");
  return rendered;
}

export interface WechatPreview {
  date: string;
  title: string;
  digest: string;
  contentHtml: string;
  sectionCount: number;
  audioPath: string | null;
  audioSeconds: number | null;
  images: RenderedImage[];
  status: ReturnType<typeof wechatStatus>;
}

export async function buildWechatPreview(date: string): Promise<WechatPreview> {
  const doc = collectWechatDoc(date);
  const images = await ensureWechatImages(date);
  const imageMap: Record<string, string> = {};
  for (const img of images) imageMap[img.kind] = img.url;
  const audioRel = `wechat-${date}.mp3`;
  const hasAudio = fs.existsSync(path.join(AUDIO_DIR, audioRel));
  return {
    date,
    title: doc.title,
    digest: doc.digest,
    contentHtml: renderWechatHtml(doc, imageMap),
    sectionCount: 1,
    audioPath: hasAudio ? `/audio/${audioRel}` : null,
    audioSeconds: null,
    images,
    status: wechatStatus(),
  };
}

export interface WechatAudioResult {
  audioPath: string;
  seconds: number;
  bytes: number;
  script: string;
}

export async function buildWechatAudioFor(date: string): Promise<WechatAudioResult> {
  const doc = collectWechatDoc(date);
  const audio = await buildWechatAudio(doc, date);
  return {
    audioPath: `/audio/${audio.relativePath}`,
    seconds: audio.seconds,
    bytes: audio.bytes,
    script: audio.script,
  };
}

export async function publishWechatDraft(date: string): Promise<{ mediaId: string; title: string; withAudio: boolean }> {
  const cred = wechatCredentials();
  if (!cred) throw new Error(wechatStatus().reason ?? "未配置公众号凭证");
  const doc = collectWechatDoc(date);
  const images = await ensureWechatImages(date);
  const imageMap: Record<string, string> = {};
  for (const img of images) imageMap[img.kind] = img.url;
  const contentHtml = renderWechatHtml(doc, imageMap);
  const token = await getAccessToken(cred);
  let audioMediaId: string | undefined;
  try {
    const audio = await buildWechatAudio(doc, date);
    audioMediaId = await uploadVoiceMaterial(token, audio.filePath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[wechat] 语音素材处理失败，先写无音频草稿：${msg}`);
  }
  const res = await createDraft(token, {
    title: doc.title,
    author: "我的窗口",
    digest: doc.digest,
    content: contentHtml,
    audioMediaId,
  });
  return { mediaId: res.mediaId, title: doc.title, withAudio: Boolean(audioMediaId) };
}