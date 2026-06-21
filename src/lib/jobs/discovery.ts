/**
 * discovery.ts — reverse-search company-slug discovery for the per-company
 * platforms (Greenhouse / Lever / Ashby / SmartRecruiters), which expose NO
 * cross-company API. This is the "find which companies posted on a platform,
 * then scan them" idea — implemented as a ROBUST BACKGROUND mechanism, not on
 * the request path:
 *
 *   1. Query a search engine's HTML endpoint with a `site:` filter per platform
 *      (e.g. `site:job-boards.greenhouse.io <keywords>`).
 *   2. Extract the company slug from each result URL.
 *   3. Validate the slug against the platform's real board API (cheap, exact).
 *   4. Return the live ones so a caller can persist them into the registry.
 *
 * Why background-only: search-engine HTML endpoints rate-limit aggressively
 * (observed `202` after a few rapid calls), so this is throttled and meant to
 * run from a cron, with results cached/persisted. The request path uses the
 * stable breadth providers (Workable/The Muse search) + the existing registry.
 *
 * SERVER-ONLY (network + slug validation against ATS APIs).
 */

import { fetchText, fetchJson, ProviderHttpError } from "./providers/http";

export type DiscoverablePlatform = "greenhouse" | "lever" | "ashby" | "smartrecruiters";

interface PlatformSpec {
  /** Host used in the `site:` filter. */
  host: string;
  /** Extract candidate slugs from a blob of result HTML (raw + decoded links). */
  extract(hay: string): string[];
  /** Validate a slug against the platform's board API; resolve job count or null. */
  validate(slug: string): Promise<number | null>;
}

/** Slugs that are never real company boards (platform infra paths). */
const RESERVED = new Set(["api", "b", "meeting", "embed", "l", "jobs", "job", "careers", "search", "company"]);

function dedupe(slugs: string[]): string[] {
  return [...new Set(slugs.map((s) => s.trim()).filter((s) => s && !RESERVED.has(s.toLowerCase())))];
}

const PLATFORMS: Record<DiscoverablePlatform, PlatformSpec> = {
  greenhouse: {
    host: "job-boards.greenhouse.io",
    extract(hay) {
      return dedupe([...hay.matchAll(/(?:job-boards|boards)\.greenhouse\.io\/([A-Za-z0-9-]+)/g)].map((m) => m[1]));
    },
    async validate(slug) {
      try {
        const j = await fetchJson<{ jobs?: unknown[] }>(
          `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs`,
          { redirect: "error", timeoutMs: 8000 },
        );
        return Array.isArray(j?.jobs) ? j.jobs.length : null;
      } catch {
        return null;
      }
    },
  },
  lever: {
    host: "jobs.lever.co",
    extract(hay) {
      return dedupe([...hay.matchAll(/jobs\.lever\.co\/([A-Za-z0-9-]+)/g)].map((m) => m[1]));
    },
    async validate(slug) {
      try {
        const j = await fetchJson<unknown[]>(`https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`, {
          redirect: "error",
          timeoutMs: 8000,
        });
        return Array.isArray(j) ? j.length : null;
      } catch {
        return null;
      }
    },
  },
  ashby: {
    host: "jobs.ashbyhq.com",
    extract(hay) {
      return dedupe([...hay.matchAll(/jobs\.ashbyhq\.com\/([A-Za-z0-9._-]+)/g)].map((m) => m[1]));
    },
    async validate(slug) {
      try {
        const j = await fetchJson<{ jobs?: unknown[] }>(
          `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}`,
          { redirect: "error", timeoutMs: 8000 },
        );
        return Array.isArray(j?.jobs) ? j.jobs.length : null;
      } catch {
        return null;
      }
    },
  },
  smartrecruiters: {
    host: "jobs.smartrecruiters.com",
    extract(hay) {
      return dedupe([...hay.matchAll(/jobs\.smartrecruiters\.com\/([A-Za-z0-9._-]+)/g)].map((m) => m[1]));
    },
    async validate(slug) {
      try {
        const j = await fetchJson<{ totalFound?: number }>(
          `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(slug)}/postings?limit=1`,
          { redirect: "error", timeoutMs: 8000 },
        );
        return typeof j?.totalFound === "number" ? j.totalFound : null;
      } catch {
        return null;
      }
    },
  },
};

/** Decode DuckDuckGo redirect wrappers (`/l/?uddg=<encoded>`) so we see real URLs. */
function decodeResultLinks(html: string): string {
  const decoded = [...html.matchAll(/uddg=([^&"']+)/g)]
    .map((m) => {
      try {
        return decodeURIComponent(m[1]);
      } catch {
        return "";
      }
    })
    .join(" ");
  return `${html} ${decoded}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface DiscoveryResult {
  platform: DiscoverablePlatform;
  /** Newly validated boards: slug → open job count. */
  boards: { slug: string; jobCount: number }[];
  /** Slugs seen but not validated (dead/private/unparseable). */
  rejected: number;
}

/**
 * Discover live company boards on one platform for a keyword set. Validates
 * each candidate slug against the platform API so only real, open boards are
 * returned. Throttled internally; intended for background/cron use.
 */
export async function discoverBoards(
  platform: DiscoverablePlatform,
  keywords: string,
  opts: { maxValidate?: number; throttleMs?: number } = {},
): Promise<DiscoveryResult> {
  const spec = PLATFORMS[platform];
  const maxValidate = opts.maxValidate ?? 25;
  const throttleMs = opts.throttleMs ?? 400;

  // 1. Reverse search.
  const q = `site:${spec.host} ${keywords}`.trim();
  let html = "";
  try {
    html = await fetchText(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}&kl=us-en`, {
      timeoutMs: 9000,
      redirect: "follow",
      headers: { accept: "text/html" },
    });
  } catch (err) {
    if (err instanceof ProviderHttpError) {
      console.warn(`[jobs.discovery] ${platform} search failed: ${err.message}`);
    }
    return { platform, boards: [], rejected: 0 };
  }

  // 2. Extract candidate slugs.
  const candidates = spec.extract(decodeResultLinks(html)).slice(0, maxValidate);

  // 3. Validate each (sequential + throttled — be a polite client).
  const boards: { slug: string; jobCount: number }[] = [];
  let rejected = 0;
  for (const slug of candidates) {
    const count = await spec.validate(slug);
    if (count != null && count > 0) boards.push({ slug, jobCount: count });
    else rejected++;
    await sleep(throttleMs);
  }

  return { platform, boards, rejected };
}

/** Run discovery across every per-company platform for a keyword set. */
export async function discoverAllPlatforms(
  keywords: string,
  opts?: { maxValidate?: number; throttleMs?: number },
): Promise<DiscoveryResult[]> {
  const platforms = Object.keys(PLATFORMS) as DiscoverablePlatform[];
  const results: DiscoveryResult[] = [];
  // Sequential across platforms too — one search engine, avoid tripping rate limits.
  for (const platform of platforms) {
    results.push(await discoverBoards(platform, keywords, opts));
    await sleep(opts?.throttleMs ?? 1500);
  }
  return results;
}
