export type SectionId = 'books' | 'ai-tools' | 'ai-course' | 'ai-weekly' | 'markets' | 'world';

export const SECTION_ORDER: SectionId[] = ['books', 'ai-course', 'ai-tools', 'markets', 'world'];

export interface SectionInfo {
  title: string;
  subtitle: string;
  blurb: string;
}

export const SECTION_META: Record<SectionId, SectionInfo> = {
  books: {
    title: '书籍学习',
    subtitle: '社会学 · 经济 · 历史 · 哲学 · 金融 · AI 轮换',
    blurb: '每天一篇，把一本书里普通人用得上的那部分讲透',
  },
  'ai-course': {
    title: 'AI 学习',
    subtitle: '0 基础补原理 · 每天一讲',
    blurb: '从你每天都在调的那个 API 出发，把大模型的里子外子讲明白',
  },
  'ai-weekly': {
    title: '本周技术速递',
    subtitle: '每周一篇 · AI 技术动态解读',
    blurb: '这一周 AI 技术上发生了什么，为什么重要，和你有什么关系',
  },
  'ai-tools': {
    title: '前沿 AI 应用',
    subtitle: 'GitHub 每周高星开源工具',
    blurb: '每周五个真能用的开源 AI 工具，讲人话',
  },
  markets: {
    title: '全球与中国金融',
    subtitle: '股市与宏观最新分析',
    blurb: '真实行情数据打底，讲清楚钱往哪儿走',
  },
  world: {
    title: '全球局势',
    subtitle: '每天五件大事',
    blurb: '正在发生的事，说清影响和下一步看什么',
  }
};

export interface ArticleSource {
  title: string;
  url: string;
  publishedAt?: string;
  source?: string;
}

export interface Article {
  id: string;
  section: SectionId;
  date: string;
  title: string;
  subtitle: string;
  summary: string;
  takeaways: string[];
  body: string;
  script: string;
  readingMinutes: number;
  audioPath?: string | null;
  meta: Record<string, unknown>;
  sources: ArticleSource[];
  generatedAt: string;
}

export interface PromptSpec<TInput = any, TPayload = any> {
  id: string;
  section: SectionId;
  system: string;
  buildUser: (input: TInput) => string;
  schema: { parse: (data: unknown) => TPayload };
  temperature: number;
  maxTokens: number;
}

export interface RunRecord {
  id: number;
  section: SectionId;
  date: string;
  startedAt: string;
  finishedAt?: string | null;
  status: 'running' | 'ok' | 'error';
  message?: string | null;
  articleId?: string | null;
}

export const DISCIPLINES = ['社会学', '经济', '历史', '哲学', '金融', 'AI'] as const;
export type Discipline = (typeof DISCIPLINES)[number];