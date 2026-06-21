/**
 * index.ts — the job-search service (SERVER-ONLY).
 *
 * Aggregates live job postings across a registry of company ATS boards
 * (Greenhouse / Lever / Ashby / Workable / SmartRecruiters) plus cross-company
 * platform search, via the `aggregatorProvider`.
 *
 * Flow: the live provider returns the full filtered+deduped candidate set
 * (already geo/keyword/recency-gated, unsorted, unpaginated). The service then
 * scores every candidate and sorts:
 *   - "relevance" (Best match) → composite of keyword fit + profile fit + recency
 *   - "date" (Newest)          → strictly newest first (undated last)
 *   - "salary"                 → highest pay first
 * …then paginates, so each sort ranks across ALL results, not within one page.
 *
 * Every listing is, by default, a real live posting. The live scan is the
 * source of truth. As a robustness backstop, if the live scan throws or returns
 * nothing (e.g. the host has no outbound network, or every board is transiently
 * down), the service falls back to a deterministic, filter-coherent set from
 * `mock.ts` so the feed never silently collapses to an empty "0 of 0" screen.
 * The result's `source` is `"live"` or `"mock"` so callers can be honest about it.
 */

import { getProfile } from "@/lib/services/profile-service";
import { aggregatorProvider } from "./aggregator";
import { profileSignature, scoreJob } from "./match";
import { keywordRelevance } from "./keywords";
import { mockJobs } from "./mock";
import type { JobListing, JobSearchFilters, JobSearchResult } from "./types";

export { DEFAULT_FILTERS } from "./types";

function paginate<T>(items: T[], page: number, perPage: number): T[] {
  const start = (page - 1) * perPage;
  return items.slice(start, start + perPage);
}

/**
 * Freshness factor 0..1 from an ISO date. Brand-new ≈1.0, decaying linearly to
 * ~0.45 at the 60-day ceiling. Undated postings get a neutral 0.55 so a dated-
 * fresh role outranks them, but they're not buried beneath stale ones.
 */
function recencyFactor(createdAt: string): number {
  if (!createdAt) return 0.55;
  const t = Date.parse(createdAt);
  if (Number.isNaN(t)) return 0.55;
  const days = (Date.now() - t) / (24 * 3600 * 1000);
  if (days <= 2) return 1;
  if (days >= 60) return 0.45;
  return 1 - (days / 60) * 0.55;
}

export async function searchJobs(
  filters: JobSearchFilters,
  userId?: string,
): Promise<JobSearchResult> {
  const page = filters.page ?? 1;
  const perPage = filters.resultsPerPage ?? 20;

  // 1. Gather candidates from the live aggregator (full, unpaginated set).
  //    The live scan is the real source. But a job feed that can silently
  //    collapse to "0 of 0" — host with no outbound network, every board down,
  //    or a transient error — is broken. So if the live scan throws OR comes
  //    back empty, we fall back to the deterministic mock so the feed stays
  //    alive (clearly labelled `source: "mock"`), never a dead end.
  let candidates: JobListing[] = [];
  let source = aggregatorProvider.id; // "live"
  try {
    const result = await aggregatorProvider.search({ ...filters, page: 1, resultsPerPage: 10_000 });
    candidates = result.jobs;
  } catch (err) {
    console.error(`[jobs.search] live aggregator failed — falling back to mock:`, err);
  }

  if (candidates.length === 0) {
    if (source === aggregatorProvider.id) {
      console.warn("[jobs.search] live scan returned no jobs — serving deterministic fallback set.");
    }
    candidates = mockJobs(filters);
    source = "mock";
  }

  // 2. Score every candidate. `matchPct` (the "% match" badge) stays a pure
  //    profile-fit number; the composite rank below is used only for ordering.
  const profile = userId ? await getProfile(userId).catch(() => null) : null;
  const signature = profile ? profileSignature(profile.resume) : new Set<string>();
  const hasProfile = signature.size > 0;
  const keywords = filters.keywords || "";
  const scored = candidates.map((j) => {
    const matchPct = scoreJob(j, signature);
    const kw = keywordRelevance({ title: j.title, department: undefined, description: j.snippet }, keywords);
    const rec = recencyFactor(j.createdAt);
    const profileFactor = matchPct / 100;

    // Best-match weighting: search intent (keyword) leads, profile fit + recency
    // shape the rest. When there's no profile, redistribute its weight to keyword
    // relevance so ordering stays meaningful.
    const wKeyword = hasProfile ? 0.45 : 0.7;
    const wProfile = hasProfile ? 0.3 : 0;
    const wRecency = 0.25;
    const rankScore = wKeyword * kw + wProfile * profileFactor + wRecency * rec;

    return { ...j, matchPct, rankScore };
  });

  // 3. Sort the full set by the requested mode.
  const sortBy = filters.sortBy ?? "relevance";
  if (sortBy === "date") {
    // Newest first; undated sink to the bottom.
    scored.sort((a, b) => dateValue(b.createdAt) - dateValue(a.createdAt));
  } else if (sortBy === "salary") {
    scored.sort((a, b) => (b.salaryMax ?? b.salaryMin ?? 0) - (a.salaryMax ?? a.salaryMin ?? 0));
  } else {
    // Best match: composite, with recency as the tiebreaker.
    scored.sort((a, b) => b.rankScore - a.rankScore || dateValue(b.createdAt) - dateValue(a.createdAt));
  }

  // 4. Paginate across the full ranked set.
  const total = scored.length;
  const ranked = scored.map(({ rankScore: _rankScore, ...job }) => job);
  const jobs = paginate(ranked, page, perPage);

  return { jobs, total, page, source };
}

/** Epoch ms for sorting; missing/invalid dates sort last. */
function dateValue(iso: string): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

export type {
  JobListing,
  JobSearchFilters,
  JobSearchResult,
  JobType,
  WorkArrangement,
  ExperienceLevel,
  SortBy,
} from "./types";
