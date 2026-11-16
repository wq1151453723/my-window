import { z } from 'zod';

/** 模型偶尔把数字写成字符串（如 "lessonNo": "1"），这里统一容错 */
const flexInt = z
  .union([z.number().int(), z.string().trim().regex(/^\d+$/).transform((v) => Number(v))])
  .catch(0);

export const BasePayloadSchema = z.object({
  title: z.string().min(2),
  subtitle: z.string().default(''),
  summary: z.string().min(20),
  takeaways: z.array(z.string().min(2)).min(3).max(6),
  body: z.string().min(200),
  script: z.string().min(200),
});

export const BooksPayloadSchema = BasePayloadSchema.extend({
  meta: z.object({
    discipline: z.enum(['社会学', '经济', '历史', '哲学', '金融', 'AI']),
    book: z.string().default(''),
    author: z.string().default(''),
    coreIdea: z.string().default(''),
    whyItMatters: z.string().default(''),
  }),
});

export const AiToolPayloadSchema = BasePayloadSchema.extend({
  meta: z.object({
    repoFullName: z.string(),
    repoUrl: z.string(),
    stars: flexInt,
    language: z.string().default(''),
    whatItIs: z.string(),
    whoIsItFor: z.string(),
    howToStart: z.string(),
    whyNow: z.string(),
    license: z.string().default(''),
  }),
});

export const CoursePayloadSchema = BasePayloadSchema.extend({
  meta: z.object({
    lessonNo: flexInt,
    stage: z.string().default(''),
    stageTitle: z.string().default(''),
    anchor: z.string().default(''),
    latestTieIn: z.string().default(''),
    exercise: z.string().default(''),
    keywords: z.array(z.string()).default([]),
  }),
});

export const WeeklyPayloadSchema = BasePayloadSchema.extend({
  meta: z.object({
    weekKey: z.string().default(''),
    period: z.string().default(''),
    highlights: z
      .array(
        z.object({
          whatChanged: z.string(),
          whyItMatters: z.string(),
          impactOnYou: z.string(),
          source: z.string().default(''),
          url: z.string().default(''),
        }),
      )
      .min(3)
      .max(6),
    techList: z
      .array(
        z
          .object({
            term: z.string(),
            explain: z.string().optional(),
            plainMeaning: z.string().optional(),
            meaning: z.string().optional(),
          })
          .transform((v) => ({
            term: v.term,
            explain: v.explain ?? v.plainMeaning ?? v.meaning ?? "",
          })),
      )
      .min(2)
      .max(5),
  }),
});

export const MarketsPayloadSchema = BasePayloadSchema.extend({
  meta: z.object({
    marketMood: z.string(),
    quotes: z.array(z.object({
      symbol: z.string(),
      name: z.string(),
      price: z.number(),
      changePct: z.number(),
    })).default([]),
    indices: z.array(z.object({
      symbol: z.string(),
      name: z.string(),
      changePct: z.number(),
    })).default([]),
    drivers: z.array(z.string()).default([]),
    riskPoints: z.array(z.string()).default([]),
  }),
});

export const WorldPayloadSchema = BasePayloadSchema.extend({
  meta: z.object({
    events: z.array(z.object({
      rank: flexInt,
      title: z.string(),
      region: z.string(),
      whatHappened: z.string(),
      whyItMatters: z.string(),
      impact: z.string(),
      watchNext: z.string(),
      confidence: z.enum(['高', '中', '低']),
    })).min(5).max(5),
  }),
});

export const PAYLOAD_SCHEMAS = {
  books: BooksPayloadSchema,
  'ai-tools': AiToolPayloadSchema,
  'ai-course': CoursePayloadSchema,
  'ai-weekly': WeeklyPayloadSchema,
  markets: MarketsPayloadSchema,
  world: WorldPayloadSchema,
} as const;