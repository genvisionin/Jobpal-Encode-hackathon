/**
 * workable-search.ts — Workable CROSS-COMPANY search provider (breadth layer).
 *
 * Unlike the per-company board providers, Workable publishes a global search
 * over every company on its platform:
 *   GET https://jobs.workable.com/api/v1/jobs?query=…&location=…&day_range=…
 *
 * One query returns postings from thousands of distinct companies — so a user's
 * filters fan out across the whole platform instead of a fixed company list.
 * Pagination is cursor-based via `nextPageToken`. We pull pages until we hit
 * the requested cap or run out.
 *
 * Notes from probing the live API:
 *   - `query` (role/keywords) + `location` (free text city/country) both filter.
 *   - `day_range` filters recency in days (maps to our maxDaysOld).
 *   - DON'T send `remote=true` — it returns 0; infer arrangement from `workplace`.
 *   - `company` is a rich object ({ title, website, … }); name is `company.title`.
 */

import type { JobSearchQuery, ProviderContext, RawJob, SearchProvider } from "./types";

const BASE = "https://jobs.workable.com/api/v1/jobs";
const PAGE_SIZE = 20; // platform-fixed
const MAX_PAGES = 15; // hard ceiling (≈300 postings) so a broad query stays bounded

interface WkSearchJob {
  id?: string;
  title?: string;
  url?: string;
  employmentType?: string;
  workplace?: string; // remote | hybrid | on_site / onsite
  department?: string;
  created?: string;
  updated?: string;
  description?: string;
  location?: { city?: string; subregion?: string; countryName?: string };
  locations?: string[];
  company?: { title?: string };
}

interface WkSearchResponse {
  jobs?: WkSearchJob[];
  totalSize?: number;
  nextPageToken?: string;
}

function locationText(j: WkSearchJob): string {
  if (Array.isArray(j.locations) && j.locations.length) return j.locations.join(" · ");
  const l = j.location;
  if (!l) return "";
  return [l.city, l.subregion, l.countryName].filter(Boolean).join(", ");
}

function isRemote(workplace?: string): boolean | undefined {
  if (!workplace) return undefined;
  const w = workplace.toLowerCase();
  if (w === "remote") return true;
  if (w === "hybrid" || w === "on_site" || w === "onsite") return false;
  return undefined;
}

function buildUrl(query: JobSearchQuery, pageToken?: string): string {
  const p = new URLSearchParams();
  if (query.keywords.trim()) p.set("query", query.keywords.trim());
  if (query.location.trim()) p.set("location", query.location.trim());
  if (query.maxDaysOld && query.maxDaysOld > 0) p.set("day_range", String(query.maxDaysOld));
  if (pageToken) p.set("pageToken", pageToken);
  return `${BASE}?${p.toString()}`;
}

export const workableSearchProvider: SearchProvider = {
  id: "workable-search",

  async search(query: JobSearchQuery, ctx: ProviderContext): Promise<RawJob[]> {
    const out: RawJob[] = [];
    let pageToken: string | undefined;

    for (let page = 0; page < MAX_PAGES; page++) {
      // Respect the search deadline — return whatever we have rather than
      // burning the remaining time budget on more pages.
      if (query.deadlineAt && Date.now() >= query.deadlineAt) break;

      // Isolate each page: a single slow/failed page must not discard the
      // postings we already collected (the old code threw the whole batch away).
      let data: WkSearchResponse;
      try {
        data = await ctx.fetchJson<WkSearchResponse>(buildUrl(query, pageToken), {
          redirect: "error",
        });
      } catch {
        break;
      }
      const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
      for (const j of jobs) {
        if (!j.url || !j.title) continue;
        out.push({
          title: j.title.trim(),
          url: j.url,
          company: j.company?.title?.trim() || "Company on Workable",
          location: locationText(j),
          remote: isRemote(j.workplace),
          postedAt: j.created || j.updated,
          description: j.description?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
          department: j.department,
          employmentType: j.employmentType,
        });
        if (out.length >= query.maxResults) return out;
      }
      pageToken = data?.nextPageToken;
      if (!pageToken || jobs.length === 0) break;
    }

    return out;
  },
};
