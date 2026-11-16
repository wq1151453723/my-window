import fs from 'node:fs';
import { readSecret } from '../../secrets.js';

export interface WechatCredentials {
  appId: string;
  appSecret: string;
}

export interface WechatStatus {
  configured: boolean;
  appId?: string;
  reason?: string;
}

export function wechatCredentials(): WechatCredentials | null {
  const appId = readSecret("WECHAT_APP_ID");
  const appSecret = readSecret("WECHAT_APP_SECRET");
  return appId && appSecret ? { appId, appSecret } : null;
}

export function wechatStatus(): WechatStatus {
  const cred = wechatCredentials();
  if (!cred) {
    return {
      configured: false,
      reason:
        "未配置 WECHAT_APP_ID / WECHAT_APP_SECRET。个人主体订阅号无法认证，也没有草稿箱 API 权限；现在请用「复制 HTML / 下载音频」手动发布。",
    };
  }
  return { configured: true, appId: cred.appId.slice(0, 6) + "****" };
}

const API = "https://api.weixin.qq.com/cgi-bin";

function redact(text: string): string {
  return text.replace(/[A-Za-z0-9_-]{24,}/g, "***");
}

export async function getAccessToken(cred: WechatCredentials): Promise<string> {
  const url = `${API}/token?grant_type=client_credential&appid=${encodeURIComponent(cred.appId)}&secret=${encodeURIComponent(cred.appSecret)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  const data = (await res.json()) as { access_token?: string; errcode?: number; errmsg?: string };
  if (!data.access_token) {
    throw new Error(`取 access_token 失败：${data.errcode ?? "?"} ${redact(data.errmsg ?? "未知错误")}`);
  }
  return data.access_token;
}

export async function uploadVoiceMaterial(token: string, filePath: string): Promise<string> {
  const buf = fs.readFileSync(filePath);
  const form = new FormData();
  form.append("media", new Blob([new Uint8Array(buf)], { type: "audio/mpeg" }), "voice.mp3");
  const res = await fetch(`${API}/material/add_material?access_token=${token}&type=voice`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(60000),
  });
  const data = (await res.json()) as { media_id?: string; errcode?: number; errmsg?: string };
  if (!data.media_id) {
    throw new Error(`上传语音素材失败：${data.errcode ?? "?"} ${redact(data.errmsg ?? "未知错误")}`);
  }
  return data.media_id;
}

export interface WechatDraftPayload {
  title: string;
  author: string;
  digest: string;
  content: string;
  audioMediaId?: string;
  thumbMediaId?: string;
}

export async function createDraft(token: string, draft: WechatDraftPayload): Promise<{ mediaId: string }> {
  const article: Record<string, unknown> = {
    title: draft.title,
    author: draft.author,
    digest: draft.digest,
    content: draft.content,
    content_source_url: "",
    need_open_comment: 0,
    only_fans_can_comment: 0,
  };
  if (draft.thumbMediaId) article.thumb_media_id = draft.thumbMediaId;
  if (draft.audioMediaId) article.audio_mediaid = draft.audioMediaId;
  const res = await fetch(`${API}/draft/add?access_token=${token}`, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ articles: [article] }),
    signal: AbortSignal.timeout(60000),
  });
  const data = (await res.json()) as { media_id?: string; errcode?: number; errmsg?: string };
  if (!data.media_id) {
    throw new Error(`写入草稿箱失败：${data.errcode ?? "?"} ${redact(data.errmsg ?? "未知错误")}`);
  }
  return { mediaId: data.media_id };
}