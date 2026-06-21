/**
 * discover-service.ts — orchestrates reverse-search discovery → persistence.
 *
 * Runs the per-platform slug discovery for a set of seed keyword themes, then
 * upserts the validated boards into the discovered-board store so the next
 * search benefits. Designed for the background cron (it's throttled + bounded),
 * NOT the request path.
 *
 * SERVER-ONLY.
 */

import { discoverAllPlatforms, type DiscoverablePlatform } from "./discovery";
import { upsertDiscoveredBoards, type DiscoveredBoard } from "./discovered-store";
import type { Industry } from "./registry";

/**
 * Seed themes to sweep each run. Broad enough to surface companies across
 * industries; the validated boards then serve ALL future queries (a board found
 * via "engineer" still answers a "marketing" search once it's in the registry).
 */
const SEED_THEMES: { keywords: string; industries: Industry[] }[] = [
  { keywords: "software engineer", industries: ["devtools", "saas", "ai"] },
  { keywords: "data scientist", industries: ["data", "ai"] },
  { keywords: "product manager", industries: ["saas"] },
  { keywords: "sales", industries: ["saas", "enterprise"] },
  { keywords: "marketing", industries: ["consumer", "saas"] },
  { keywords: "finance", industries: ["fintech"] },
  { keywords: "nurse healthcare", industries: ["healthtech"] },
  { keywords: "operations", industries: ["logistics", "enterprise"] },
];

export interface DiscoverRunSummary {
  themesSwept: number;
  boardsFound: number;
  boardsAdded: number;
  totalKnown: number;
  byPlatform: Record<string, number>;
}

/** Run one discovery sweep across themes + platforms and persist the results. */
export async function runDiscoverySweep(
  opts: { maxValidatePerPlatform?: number } = {},
): Promise<DiscoverRunSummary> {
  const byPlatform: Record<string, number> = {};
  const collected: DiscoveredBoard[] = [];
  const now = new Date().toISOString();

  for (const theme of SEED_THEMES) {
    const results = await discoverAllPlatforms(theme.keywords, {
      maxValidate: opts.maxValidatePerPlatform ?? 15,
      throttleMs: 500,
    });
    for (const r of results) {
      byPlatform[r.platform] = (byPlatform[r.platform] ?? 0) + r.boards.length;
      for (const b of r.boards) {
        collected.push({
          company: prettifySlug(b.slug),
          platform: r.platform as DiscoverablePlatform,
          slug: b.slug,
          regions: ["global"], // unknown at discovery; broad so selection still considers it
          industries: theme.industries,
          jobCount: b.jobCount,
          discoveredAt: now,
        });
      }
    }
  }

  const { added, total } = await upsertDiscoveredBoards(collected);
  return {
    themesSwept: SEED_THEMES.length,
    boardsFound: collected.length,
    boardsAdded: added,
    totalKnown: total,
    byPlatform,
  };
}

/** Turn an ATS slug into a readable company label ("koboldmetals" → "Koboldmetals"). */
function prettifySlug(slug: string): string {
  const cleaned = slug.replace(/[-_.]+/g, " ").replace(/\d+$/, "").trim();
  return cleaned
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ") || slug;
}
