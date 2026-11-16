import { execFileSync, execSync } from 'node:child_process';
import { fetchJson, fetchText, USER_AGENT } from './http.js';
import { readSecret } from '../secrets.js';

/** 一个 GitHub 仓库的摘要信息 */
export interface RepoInfo {
  fullName: string;
  url: string;
  description: string;
  stars: number;
  language?: string;
  topics?: string[];
  createdAt: string;
  license?: string;
  homepage?: string;
  readmeExcerpt?: string;
}

const GH_API = 'https://api.github.com';
const README_MAX_CHARS = 4000;
const GH_EXE = 'C:\\Program Files\\GitHub CLI\\gh.exe';

let cachedToken: string | null | undefined;

/**
 * 取 GitHub 令牌：优先环境/凭据仓，其次 gh CLI。
 * 令牌只用于 Authorization 头，绝不写进日志或报告。
 */
function getToken(): string | undefined {
  if (cachedToken !== undefined) return cachedToken ?? undefined;

  for (const name of ['GITHUB_TOKEN', 'GH_TOKEN']) {
    const fromSecret = readSecret(name);
    if (fromSecret && fromSecret.length >= 20) {
      cachedToken = fromSecret;
      return cachedToken;
    }
  }

  const attempts: Array<() => string> = [
    () => execFileSync(GH_EXE, ['auth', 'token'], { encoding: 'utf8', timeout: 15000, windowsHide: true }),
    () => execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', timeout: 15000, windowsHide: true }),
    () => execSync('gh auth token', { encoding: 'utf8', timeout: 15000, windowsHide: true }),
  ];
  for (const run of attempts) {
    try {
      const raw = String(run()).trim();
      const token = raw.split(/\s+/).filter(Boolean).pop() ?? '';
      if (token.length >= 20) {
        cachedToken = token;
        return cachedToken;
      }
    } catch {
      /* 换下一种方式 */
    }
  }
  cachedToken = null;
  return undefined;
}

/** 是否拿到了令牌（用于自检脚本展示，不打印令牌本身） */
export function hasGitHubToken(): boolean {
  return Boolean(getToken());
}

function apiHeaders(token: string | undefined, accept = 'application/vnd.github+json'): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': USER_AGENT,
    Accept: accept,
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

interface GhRepo {
  full_name?: string;
  html_url?: string;
  description?: string | null;
  stargazers_count?: number;
  language?: string | null;
  topics?: string[];
  created_at?: string;
  license?: { spdx_id?: string | null } | null;
  homepage?: string | null;
}

async function fetchReadme(fullName: string, token: string | undefined): Promise<string> {
  const res = await fetchText(`${GH_API}/repos/${fullName}/readme`, {
    timeoutMs: 15000,
    retries: 1,
    headers: apiHeaders(token, 'application/vnd.github.raw'),
    accept: 'application/vnd.github.raw',
  });
  if (!res.ok || !res.body) return '';
  const body = res.body;
  // 某些情况下服务端仍返回 JSON（content 为 base64）
  if (body.trimStart().startsWith('{')) {
    try {
      const parsed = JSON.parse(body) as { content?: string; encoding?: string };
      if (parsed.content && parsed.encoding === 'base64') {
        return Buffer.from(parsed.content.replace(/\n/g, ''), 'base64').toString('utf8');
      }
    } catch {
      return body;
    }
  }
  return body;
}

/**
 * 取「since 之后新建且高星」的仓库，按 star 排序。
 * 每个仓库的 createdAt 一定晚 than since；失败返回空数组。
 */
export async function fetchWeeklyHotRepos(since: Date, count: number): Promise<RepoInfo[]> {
  try {
    if (!(since instanceof Date) || Number.isNaN(since.getTime())) return [];
    const limit = Math.max(1, Math.min(50, Math.floor(count) || 5));
    const token = getToken();
    const sinceDay = new Date(since.getTime()).toISOString().slice(0, 10);

    // 新仓库星数普遍偏低，阈值逐级放宽直到够数
    const thresholds = [50, 20, 10, 5, 1];
    let picked: GhRepo[] = [];

    for (const minStars of thresholds) {
      const query = `created:>${sinceDay} stars:>${minStars}`;
      const url =
        `${GH_API}/search/repositories?q=${encodeURIComponent(query)}` +
        `&sort=stars&order=desc&per_page=${Math.min(100, Math.max(limit * 3, 10))}`;
      const res = await fetchJson<{ items?: GhRepo[] }>(url, {
        timeoutMs: 15000,
        retries: 2,
        headers: apiHeaders(token),
      });
      if (!res.ok || !res.data) continue;
      const items = Array.isArray(res.data.items) ? res.data.items : [];
      const fresh = items.filter(
        (item) => item?.created_at && new Date(item.created_at).getTime() > since.getTime(),
      );
      if (fresh.length > picked.length) picked = fresh;
      if (fresh.length >= limit) break;
    }

    const repos = picked.slice(0, limit);
    const out: RepoInfo[] = [];
    for (const repo of repos) {
      const fullName = String(repo.full_name ?? '');
      if (!fullName) continue;
      const info: RepoInfo = {
        fullName,
        url: String(repo.html_url ?? `https://github.com/${fullName}`),
        description: String(repo.description ?? ''),
        stars: Number(repo.stargazers_count ?? 0),
        createdAt: String(repo.created_at ?? ''),
      };
      if (repo.language) info.language = String(repo.language);
      if (Array.isArray(repo.topics) && repo.topics.length > 0) {
        info.topics = repo.topics.map((topic) => String(topic));
      }
      const license = repo.license?.spdx_id;
      if (license && license !== 'NOASSERTION') info.license = String(license);
      if (repo.homepage) info.homepage = String(repo.homepage);
      const readme = await fetchReadme(fullName, token);
      if (readme) info.readmeExcerpt = readme.slice(0, README_MAX_CHARS);
      out.push(info);
    }
    return out;
  } catch {
    return [];
  }
}
