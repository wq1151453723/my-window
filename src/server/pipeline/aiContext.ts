import { FEEDS, fetchFeed, type FeedSource } from '../sources/rss.js';
import { fetchWeeklyHotRepos, type RepoInfo } from '../sources/github.js';

export interface LatestItem {
  title: string;
  url: string;
  source: string;
  publishedAt?: string;
  note?: string;
}

export async function collectAiContext(limit = 14): Promise<LatestItem[]> {
  const out: LatestItem[] = [];
  const feeds = FEEDS.filter((f: FeedSource) => f.category === "ai");
  for (const feed of feeds) {
    try {
      const items = await fetchFeed(feed, 3);
      for (const it of items) {
        out.push({
          title: it.title,
          url: it.url,
          source: it.source || feed.name,
          publishedAt: it.publishedAt,
        });
      }
    } catch {
      /* 单个源失败不影响整体 */
    }
  }
  out.sort((a, b) => (Date.parse(b.publishedAt ?? "") || 0) - (Date.parse(a.publishedAt ?? "") || 0));
  return out.slice(0, limit);
}

export async function collectAiRepos(count = 8): Promise<RepoInfo[]> {
  const since = new Date(Date.now() - 7 * 86400000);
  try {
    return await fetchWeeklyHotRepos(since, count);
  } catch {
    return [];
  }
}