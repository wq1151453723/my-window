import type { Article } from '../../shared/types.js';
import { CURRICULUM } from '../course/curriculum.js';
import { TOTAL_LESSONS } from '../course/types.js';
import { aiCoursePrompt, type AiCourseInput, type CoursePayload } from '../llm/prompts/ai-course.js';
import { runPrompt } from '../llm/client.js';
import {
  saveArticle,
  startRun,
  finishRun,
  getCourseState,
  setCurrentLesson,
  linkCourseLesson,
} from '../db.js';
import { attachAudio } from './common.js';
import { collectAiContext } from './aiContext.js';

export async function generateAiCourse(date: string): Promise<Article> {
  const runId = startRun("ai-course", date);
  try {
    const state = getCourseState();
    const lessonNo = Math.min(Math.max(state.currentLesson, 1), TOTAL_LESSONS);
    const lesson = CURRICULUM.find((l) => l.no === lessonNo);
    if (!lesson) throw new Error(`课程大纲里没有第 ${lessonNo} 讲`);
    const latestContext = await collectAiContext(14);
    const res = await runPrompt<AiCourseInput, CoursePayload>(aiCoursePrompt, { lesson, date, latestContext });
    const p = res.payload;
    let article: Article = {
      id: `${date}-ai-course-L${lessonNo}`,
      section: "ai-course",
      date,
      title: p.title,
      subtitle: p.subtitle,
      summary: p.summary,
      takeaways: p.takeaways,
      body: p.body,
      script: p.script,
      readingMinutes: 0,
      audioPath: null,
      meta: {
        ...p.meta,
        lessonNo,
        stage: lesson.stage,
        stageTitle: lesson.stageTitle,
        lessonTitle: lesson.title,
        goal: lesson.goal,
        prerequisite: lesson.prerequisite,
      },
      sources: latestContext.slice(0, 8).map((i) => ({
        title: i.title,
        url: i.url,
        source: i.source,
        publishedAt: i.publishedAt,
      })),
      generatedAt: new Date().toISOString(),
    };
    article = await attachAudio(article);
    saveArticle(article);
    linkCourseLesson(lessonNo, article.id, date);
    if (lessonNo < TOTAL_LESSONS) setCurrentLesson(lessonNo + 1);
    finishRun(runId, "ok", null, article.id);
    console.log(`[ai-course] 第 ${lessonNo} 讲生成完成（${res.provider}/${res.model}）`);
    return article;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    finishRun(runId, "error", msg, null);
    throw err;
  }
}