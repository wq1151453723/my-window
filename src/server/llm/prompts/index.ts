import type { PromptSpec, SectionId } from '../../../shared/types.js';

import { aiToolsPrompt } from './ai-tools.js';
import { booksPrompt } from './books.js';
import { marketsPrompt } from './markets.js';
import { worldPrompt } from './world.js';

export { aiToolsPrompt, booksPrompt, marketsPrompt, worldPrompt };

export type { AiToolRepoInput, AiToolPayload, AiToolsPromptInput } from './ai-tools.js';
export type { BooksPayload, BooksPromptInput } from './books.js';
export type { MarketsPayload, MarketsPromptInput } from './markets.js';
export type { WorldPayload, WorldPromptInput } from './world.js';

/** 四个板块的提示词登记表，板块 id 与 src/shared/types.ts 的 SectionId 一致。 */
export const PROMPTS: Record<'books' | 'ai-tools' | 'markets' | 'world', PromptSpec> = {
  books: booksPrompt,
  'ai-tools': aiToolsPrompt,
  markets: marketsPrompt,
  world: worldPrompt,
};

/** 按板块 id 取提示词。 */
export function getPrompt(section: 'books' | 'ai-tools' | 'markets' | 'world'): PromptSpec {
  return PROMPTS[section];
}

export default PROMPTS;
