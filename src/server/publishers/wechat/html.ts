import type { Article } from '../../../shared/types.js';
import { markdownToHtml } from './markdown.js';

const INK = "#3f3f3f";
const ACCENT = "#b0341f";
const MUTED = "#767676";
const RULE = "#e8e4dc";

function esc(t: string): string {
  return (t ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function label(text: string): string {
  return `<p style="margin:1.9em 0 0.6em;font-size:13px;font-weight:700;color:${ACCENT};letter-spacing:1px;">${esc(text)}</p>`;
}

function rule(): string {
  return `<p style="margin:1.8em 0 1.4em;border-top:1px solid ${RULE};font-size:13px;line-height:1;line-height:0;">&nbsp;</p>`;
}

function figure(src: string): string {
  return `<p style="margin:0.4em 0 1.2em;"><img src="${src}" data-wx-img="1" style="width:100%;max-width:100%;display:block;border-radius:4px;" /></p>`;
}

function infoBlock(k: string, v: string): string {
  if (!v) return "";
  return (
    `<p style="margin:0 0 0.9em;max-width:680px;max-width:680px;font-size:16px;line-height:1.8;color:${INK};">` +
    `<strong style="color:${ACCENT};font-weight:700;">${esc(k)}　</strong>${esc(v)}` +
    `</p>`
  );
}

export interface WechatDoc {
  title: string;
  digest: string;
  dateLine: string;
  lessonNo: number;
  stageTitle: string;
  lessonTitle: string;
  goal: string;
  anchor: string;
  exercise: string;
  bodyHtml: string;
  takeaways: string[];
  imageKind?: string;
  posterKind?: string;
  note: string;
}

export function renderWechatHtml(doc: WechatDoc, images: Record<string, string> = {}): string {
  const parts: string[] = [];
  parts.push(`<p style="margin:0 0 0.8em;font-size:13px;color:${MUTED};letter-spacing:0.5px;">${esc(doc.dateLine)}</p>`);
  parts.push(`<p style="margin:0 0 1.2em;max-width:680px;max-width:680px;font-size:16px;line-height:1.8;color:${INK};">${esc(doc.digest)}</p>`);
  if (doc.posterKind && images[doc.posterKind]) parts.push(figure(images[doc.posterKind]));
  parts.push(label(`AI 学习 · 第 ${doc.lessonNo} 讲 · ${doc.stageTitle}`));
  parts.push(`<p style="margin:0 0 0.7em;font-size:18px;font-weight:700;line-height:1.5;color:#1a1a1a;">${esc(doc.lessonTitle)}</p>`);
  if (doc.imageKind && images[doc.imageKind]) parts.push(figure(images[doc.imageKind]));
  parts.push(infoBlock("这一讲要弄懂", doc.goal));
  parts.push(infoBlock("从哪儿看起", doc.anchor));
  if (doc.takeaways.length) {
    parts.push(
      `<ul style="margin:0.2em 0 1.3em;padding-left:1.1em;list-style:none;">` +
        doc.takeaways
          .map((t) => `<li style="margin:0 0 0.6em;max-width:680px;font-size:16px;line-height:1.75;color:${INK};">· ${esc(t)}</li>`)
          .join("") +
        `</ul>`
    );
  }
  parts.push(rule());
  parts.push(doc.bodyHtml);
  parts.push(rule());
  parts.push(label("动手练一下"));
  parts.push(infoBlock("", doc.exercise));
  parts.push(`<p style="margin:1.4em 0 0;font-size:13px;line-height:1.7;color:${MUTED};">${esc(doc.note)}</p>`);
  return parts.join("\n");
}

export function buildWechatDoc(input: {
  date: string;
  dateLine: string;
  course?: Article | null;
}): WechatDoc {
  const course = input.course;
  const meta = (course?.meta ?? {}) as Record<string, unknown>;
  const lessonNo = Number(meta.lessonNo ?? 1);
  const stageTitle = String(meta.stageTitle ?? "");
  const lessonTitle = String(meta.lessonTitle ?? course?.title ?? "");
  const goal = String(meta.goal ?? "");
  const anchor = String(meta.anchor ?? "");
  const exercise = String(meta.exercise ?? "");
  const title = `我的窗口 · AI 学习第 ${lessonNo} 讲`;
  return {
    title,
    digest: goal ? `今天讲的是《${lessonTitle}》。${goal}` : `今天讲的是《${lessonTitle}》。`,
    dateLine: input.dateLine,
    lessonNo,
    stageTitle,
    lessonTitle,
    goal,
    anchor,
    exercise,
    bodyHtml: markdownToHtml(course?.body ?? ""),
    takeaways: (course?.takeaways ?? []).slice(0, 3),
    imageKind: "course",
    posterKind: "poster",
    note: "本栏目由「我的窗口」自动生成，只讲一讲，配一张图和一段朗读。内容基于公开资料与常见工程实践，仅供参考。",
  };
}