/**
 * providers/types.ts — the ATS provider plugin contract (server-only).
 *
 * Mirrors career-ops `providers/_types.js`: every provider knows how to turn a
 * board reference (a slug on its platform) into a list of normalized raw jobs.
 * The aggregator (`index.ts`) maps `RawJob` → the UI `JobListing`, so providers
 * stay small and only speak their own platform's JSON.
 */

import type { FetchOpts } from "./http";

/** A company board tracked in the registry, resolved to one ATS platform. */
export interface BoardRef {
  /** Display name, e.g. "Monzo". */
  company: string;
  /** Provider id this board lives on (greenhouse | lever | ashby | workable | smartrecruiters). */
  platform: string;
  /** The platform-specific board slug/identifier. */
  slug: string;
}

/** A job as emitted by a provider — pre-normalization, platform-agnostic shape. */
export interface RawJob {
  title: string;
  /** Public apply/listing URL — also the dedup key. */
  url: string;
  company: string;
  location: string;
  /** Whether the posting is explicitly remote (provider-supplied when known). */
  remote?: boolean;
  /** ISO date the posting was published/updated, when the platform exposes it. */
  postedAt?: string;
  /** Plain-text description / snippet when cheaply available at list level. */
  description?: string;
  /** Human salary string when the platform exposes compensation. */
  salary?: string;
  salaryMin?: number;
  salaryMax?: number;
  /** Department/function label when available (used as a display tag). */
  department?: string;
  /** Employment type label (Full-time, Contract…) when available. */
  employmentType?: string;
}

export interface ProviderContext {
  fetchJson: <T = unknown>(url: string, opts?: FetchOpts) => Promise<T>;
  fetchText: (url: string, opts?: FetchOpts) => Promise<string>;
}

/** A pluggable ATS source that exposes per-company boards (depth layer). */
export interface AtsProvider {
  id: string;
  /** Fetch all open postings for a single board. Throws on hard failure. */
  fetchBoard(ref: BoardRef, ctx: ProviderContext): Promise<RawJob[]>;
}

/** A resolved, platform-agnostic search query for cross-company providers. */
export interface JobSearchQuery {
  /** Role / keywords, free text. */
  keywords: string;
  /** Resolved place string (city and/or country name), or "" for anywhere. */
  location: string;
  /** Limit results to postings within this many days, when supported. */
  maxDaysOld?: number;
  /** Hard cap on how many postings to pull (across pagination). */
  maxResults: number;
  /**
   * Optional wall-clock deadline (epoch ms). Paginating providers MUST stop and
   * return whatever they've gathered once this passes, so a slow source can't
   * exhaust the serverless time budget and sink the whole search.
   */
  deadlineAt?: number;
}

/**
 * A pluggable cross-company search source (breadth layer). Unlike `AtsProvider`,
 * it isn't tied to a registry board — it queries the platform's global search
 * directly from the user's filters, returning postings from any company.
 */
export interface SearchProvider {
  id: string;
  search(query: JobSearchQuery, ctx: ProviderContext): Promise<RawJob[]>;
}
