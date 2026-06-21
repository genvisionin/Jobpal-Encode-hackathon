/**
 * types.ts — job-search domain types and the provider interface.
 *
 * The UI and API speak in these normalized shapes. Concrete providers
 * translate to/from their own formats behind `JobProvider`, so swapping or
 * adding a source never touches the UI.
 */

export type JobType = "full_time" | "part_time" | "contract" | "permanent";
export type WorkArrangement = "remote" | "hybrid" | "onsite";
export type ExperienceLevel = "intern" | "entry" | "mid" | "senior" | "lead" | "director";
export type SortBy = "relevance" | "date" | "salary";

/** Filters the user sets in the alerts UI. */
export interface JobSearchFilters {
  /** Role / keywords (free text). */
  keywords: string;
  /** Place name, city, or postcode. */
  location: string;
  /** ISO country code (us, gb, in, …). */
  country: string;
  /** Radius in km from `location`. */
  distanceKm?: number;
  arrangements: WorkArrangement[];
  jobTypes: JobType[];
  experience: ExperienceLevel[];
  salaryMin?: number;
  salaryMax?: number;
  /** "New · last 24h" → 1; otherwise undefined/large. */
  maxDaysOld?: number;
  visaSponsorship?: boolean;
  sortBy?: SortBy;
  page?: number;
  resultsPerPage?: number;
}

/** A normalized job listing shown in the feed. */
export interface JobListing {
  id: string;
  title: string;
  company: string;
  location: string;
  /** Pretty salary range, or "" when unknown. */
  salary: string;
  salaryMin?: number;
  salaryMax?: number;
  /** ISO date the ad was posted. */
  createdAt: string;
  /** Human "3h ago" string. */
  postedAt: string;
  /** Posted within the last 24h. */
  isNew: boolean;
  /** Display tags (arrangement, job type, category…). */
  tags: string[];
  /** Truncated description snippet. */
  snippet: string;
  /** The advertiser URL — Apply opens this in a new tab. */
  applyUrl: string;
  /** Source aggregator/site name. */
  source: string;
  /** Deterministic brand color derived from the company name. */
  brandColor: string;
  /** 0–100 relevance to the user's base profile (computed locally). */
  matchPct: number;
}

export interface JobSearchResult {
  jobs: JobListing[];
  /** Total matches reported by the provider (for pagination/labels). */
  total: number;
  page: number;
  /** Which provider answered (e.g. "mock"). */
  source: string;
}

/** A pluggable job source. */
export interface JobProvider {
  id: string;
  search(filters: JobSearchFilters): Promise<Omit<JobSearchResult, "source">>;
}

/** Default, empty filter set (client-safe — no server deps). */
export const DEFAULT_FILTERS: JobSearchFilters = {
  keywords: "",
  location: "",
  country: "us",
  distanceKm: undefined,
  arrangements: [],
  jobTypes: [],
  experience: [],
  salaryMin: undefined,
  salaryMax: undefined,
  maxDaysOld: undefined,
  visaSponsorship: false,
  sortBy: "relevance",
  page: 1,
  resultsPerPage: 20,
};
