/**
 * themuse-search.ts — The Muse CROSS-COMPANY search provider (breadth layer).
 *
 * The Muse aggregates 500K+ live postings across EVERY industry (tech, finance,
 * healthcare, retail, construction, legal, hospitality…), sourced from companies
 * that post on Greenhouse/Lever/Workday/etc. underneath. Its free public API
 * gives us enormous company variety from a single, stable endpoint — the robust
 * answer to "wide search across many companies" for platforms that have no
 * cross-company API of their own.
 *
 *   GET https://www.themuse.com/api/public/jobs?category=…&location=…&level=…&page=N
 *
 * Probed semantics:
 *   - `page` is 0-based; `page_count`/`total` drive pagination.
 *   - No free-text `q` param — we target via `category` (mapped from keywords)
 *     and `location`, then the aggregator post-filters on the user's keywords.
 *   - `refs.landing_page` is the real apply URL; `company.name` the employer.
 *   - `type` is "external" (company site) or "internal".
 */

import type { JobSearchQuery, ProviderContext, RawJob, SearchProvider } from "./types";

const BASE = "https://www.themuse.com/api/public/jobs";
const MAX_PAGES = 6; // 20/page → ≈120 postings/query, bounded

interface MuseJob {
  name?: string;
  contents?: string;
  type?: string;
  publication_date?: string;
  company?: { name?: string };
  locations?: { name?: string }[];
  levels?: { name?: string; short_name?: string }[];
  categories?: { name?: string }[];
  refs?: { landing_page?: string };
}

interface MuseResponse {
  page?: number;
  page_count?: number;
  total?: number;
  results?: MuseJob[];
}

/**
 * Map free-text keywords to The Muse's controlled category vocabulary. Empty
 * result → no category filter (search everything). Kept intentionally broad so
 * a query lands in the right slice without over-narrowing.
 */
const KEYWORD_CATEGORY: [RegExp, string][] = [
  [/\b(software|engineer|developer|programmer|sde|backend|frontend|full[\s-]?stack|devops|sre)\b/i, "Software Engineering"],
  [/\b(data|analytics|scientist|ml|ai|machine learning)\b/i, "Data and Analytics"],
  [/\b(design|ux|ui|product design)\b/i, "Design and UX"],
  [/\b(product manager|product management|\bpm\b)\b/i, "Product Management"],
  [/\b(sales|account executive|business development|bdr|sdr)\b/i, "Sales"],
  [/\b(marketing|growth|seo|content|brand)\b/i, "Marketing and PR"],
  [/\b(finance|accounting|accountant|controller|fp&a)\b/i, "Accounting and Finance"],
  [/\b(hr|people|recruit|talent)\b/i, "Human Resources and Recruitment"],
  [/\b(health|clinical|nurse|medical|care)\b/i, "Healthcare"],
  [/\b(project manager|program manager|delivery)\b/i, "Project Management"],
  [/\b(customer|support|success|account manager)\b/i, "Customer Service"],
  [/\b(legal|counsel|attorney|paralegal)\b/i, "Legal"],
  [/\b(operations|logistics|supply chain)\b/i, "Business Operations"],
];

function categoriesFor(keywords: string): string[] {
  const out = new Set<string>();
  for (const [re, cat] of KEYWORD_CATEGORY) if (re.test(keywords)) out.add(cat);
  return [...out].slice(0, 2);
}

function buildUrl(query: JobSearchQuery, category: string | undefined, page: number): string {
  const p = new URLSearchParams();
  p.set("page", String(page));
  if (category) p.set("category", category);
  if (query.location.trim()) p.set("location", query.location.trim());
  return `${BASE}?${p.toString()}`;
}

export const theMuseSearchProvider: SearchProvider = {
  id: "themuse-search",

  async search(query: JobSearchQuery, ctx: ProviderContext): Promise<RawJob[]> {
    // Pick 0-2 categories from keywords; an empty list means one broad sweep.
    const categories = categoriesFor(query.keywords);
    const targets = categories.length ? categories : [undefined];
    const perCategoryPages = Math.max(2, Math.floor(MAX_PAGES / targets.length));

    const out: RawJob[] = [];
    const seen = new Set<string>();

    for (const category of targets) {
      for (let page = 0; page < perCategoryPages; page++) {
        if (query.deadlineAt && Date.now() >= query.deadlineAt) return out;
        let data: MuseResponse;
        try {
          data = await ctx.fetchJson<MuseResponse>(buildUrl(query, category, page), { redirect: "error" });
        } catch {
          break; // stop this category on error; other categories still run
        }
        const results = Array.isArray(data?.results) ? data.results : [];
        for (const j of results) {
          const url = j.refs?.landing_page;
          if (!url || !j.name || seen.has(url)) continue;
          seen.add(url);
          out.push({
            title: j.name.trim(),
            url,
            company: j.company?.name?.trim() || "Company on The Muse",
            location: (j.locations ?? []).map((l) => l.name).filter(Boolean).join(" · "),
            postedAt: j.publication_date,
            description: j.contents?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
            department: j.categories?.[0]?.name,
          });
          if (out.length >= query.maxResults) return out;
        }
        if (data.page_count != null && page >= data.page_count - 1) break;
        if (results.length === 0) break;
      }
    }

    return out;
  },
};
