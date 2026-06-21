/**
 * aggregator.ts — the real job provider (server-only).
 *
 * This is the Jobpal equivalent of career-ops `scan.mjs`: fan out across a
 * registry of company ATS boards, pull live postings over each platform's
 * public JSON API, normalize to the feed shape, then apply the user's filters,
 * dedup, and paginate.
 *
 * Design notes:
 *   - Board selection is biased by the user's country + keyword industries so a
 *     query touches a relevant ~25-40 boards, not all of them, keeping latency
 *     and load bounded. A broad/empty query widens the net.
 *   - Each board fetch is independently timed out and failure-isolated — one
 *     dead board never sinks the search (career-ops's "continue on error").
 *   - Per-board responses are cached briefly so repeated/refined searches and
 *     pagination don't re-hit the same APIs.
 *   - Concurrency is capped so we never open 100 sockets at once.
 */

import type { JobListing, JobProvider, JobSearchFilters, JobSearchResult } from "./types";
import type { JobSearchQuery, RawJob } from "./providers/types";
import { getProvider, httpContext, searchProviders } from "./providers";
import { COMPANY_BOARDS, type CompanyBoard, type Industry, type Region } from "./registry";
import { getDiscoveredBoards } from "./discovered-store";
import { isCountryName, looksRemote, matchesCountry } from "./geo";
import { matchesQuery } from "./keywords";
import {
  arrangementOf,
  experienceOf,
  jobTypeOf,
  normalizeJob,
} from "./normalize";

const BOARD_TIMEOUT_MS = 7_000;
const SEARCH_TIMEOUT_MS = 8_000;
const CONCURRENCY = 8;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_BOARDS_PER_SEARCH = 40;
/** Hard cap on candidate listings handed back for scoring/sort (keeps memory + sort bounded). */
const MAX_CANDIDATES = 400;
/** Max postings pulled from each cross-company search provider per query. */
const MAX_SEARCH_RESULTS = 250;
/**
 * Global freshness ceiling. Postings older than this never show — a 14-month-old
 * listing is noise, not a job. The "New" recency filter narrows further; this is
 * the always-on backstop. 60 days = 2 months.
 */
const MAX_AGE_DAYS = 60;
/**
 * Overall wall-clock budget for a single search. We MUST finish (and return
 * whatever we've gathered) well within the API route's `maxDuration`, or the
 * serverless function is killed mid-flight and the user sees an empty feed /
 * blank page. Providers receive this as a `deadlineAt` and stop paginating;
 * the board scan stops picking up new boards once it's passed.
 */
const SEARCH_BUDGET_MS = 20_000;
/**
 * Never ask a source for a recency window tighter than this. The "New · last 24h"
 * filter (maxDaysOld=1) starves source-side recency filters (Workable's
 * `day_range=1` returns ~nothing), so we fetch a slightly wider window and apply
 * the user's real recency cut locally in `matchesRecency`. Keeps "New" honest
 * without coming back empty.
 */
const MIN_FETCH_AGE_DAYS = 7;

/* ---------- per-board cache ---------- */

interface CacheEntry {
  at: number;
  jobs: RawJob[];
}
const boardCache = new Map<string, CacheEntry>();

function cacheKey(b: CompanyBoard): string {
  return `${b.platform}:${b.slug}`;
}

/* ---------- board selection ---------- */

/** Map a free-text keyword string to candidate industries for board biasing. */
const KEYWORD_INDUSTRY: [RegExp, Industry[]][] = [
  [/\b(ai|ml|llm|machine learning|nlp|genai|agent|data scien)/i, ["ai", "data"]],
  [/\b(fintech|payment|bank|finance|trading|crypto|accountant|accounting)/i, ["fintech"]],
  [/\b(devrel|developer|sdk|api|platform|infra|backend|frontend|full[\s-]?stack|software engineer)/i, ["devtools", "saas"]],
  [/\b(data|analytics|etl|warehouse|pipeline)/i, ["data"]],
  [/\b(security|infosec|appsec|soc|threat)/i, ["security"]],
  [/\b(health|clinical|biotech|pharma|medical|nurse)/i, ["healthtech"]],
  [/\b(commerce|retail|marketplace|shopping)/i, ["ecommerce", "consumer"]],
  [/\b(game|gaming|gameplay)/i, ["gaming"]],
  [/\b(media|content|video|music|streaming)/i, ["media"]],
  [/\b(hardware|robot|chip|embedded|iot|firmware)/i, ["hardware"]],
  [/\b(logistics|supply chain|freight|delivery)/i, ["logistics"]],
  [/\b(teacher|education|learning|course|edtech)/i, ["edtech"]],
  [/\b(designer|design|ux|ui|product manager|marketing|sales|operations|hr|people|recruit|support|success)/i,
    ["saas", "consumer", "enterprise", "fintech", "ecommerce"]],
];

/**
 * Cross-functional roles (designer, PM, sales, marketing, ops, finance, HR…)
 * exist at almost every company regardless of its "industry" tag, so an
 * industry bias barely helps them. When a query is cross-functional we widen
 * board selection to the whole pool so big multi-function employers are scanned.
 */
const CROSS_FUNCTIONAL = /\b(designer|design|ux|ui|product manager|product management|marketing|brand|sales|account executive|business development|operations|ops|finance|accountant|accounting|hr|people|recruit|talent|support|customer success|legal|counsel|project manager|program manager|data analyst|business analyst)\b/i;

function industriesForKeywords(keywords: string): Set<Industry> {
  const out = new Set<Industry>();
  for (const [re, inds] of KEYWORD_INDUSTRY) {
    if (re.test(keywords)) inds.forEach((i) => out.add(i));
  }
  return out;
}

/** Map an ISO country code to a registry region. */
function regionForCountry(country: string): Region {
  const c = country.toLowerCase();
  if (c === "us") return "us";
  if (c === "gb" || c === "uk") return "uk";
  if (c === "ca") return "ca";
  if (["de", "fr", "es", "it", "nl", "se", "pt", "ie", "pl", "ch", "at", "be", "dk", "fi", "no"].includes(c)) return "eu";
  return "global";
}

/** ISO country code → full name, for cross-company search providers that take free-text location. */
const COUNTRY_NAME: Record<string, string> = {
  us: "United States",
  gb: "United Kingdom",
  uk: "United Kingdom",
  ca: "Canada",
  au: "Australia",
  in: "India",
  de: "Germany",
  fr: "France",
  es: "Spain",
  it: "Italy",
  nl: "Netherlands",
  ie: "Ireland",
  se: "Sweden",
  pt: "Portugal",
  pl: "Poland",
  ch: "Switzerland",
  sg: "Singapore",
};

/**
 * Resolve the user's filters into a free-text location for cross-company search.
 * A specific city/region wins; otherwise fall back to the country name. Empty
 * means "anywhere" (the platform returns global results).
 */
function resolveSearchLocation(filters: JobSearchFilters): string {
  if (filters.location && filters.location.trim()) return filters.location.trim();
  const name = COUNTRY_NAME[(filters.country || "").toLowerCase()];
  return name ?? "";
}

/**
 * Pick which boards to scan for a query. Boards matching both the region and a
 * keyword-implied industry rank highest; region-or-industry matches next; the
 * rest fill remaining slots so results never come back empty for niche queries.
 *
 * Pulls from BOTH the static registry and the reverse-search–discovered boards
 * (persisted by the discovery cron), so per-company-platform coverage grows
 * over time without code changes.
 */
export async function selectBoards(filters: JobSearchFilters): Promise<CompanyBoard[]> {
  const region = regionForCountry(filters.country || "us");
  const wantIndustries = industriesForKeywords(filters.keywords || "");
  const crossFunctional = CROSS_FUNCTIONAL.test(filters.keywords || "");

  // Merge static + discovered boards (deduped by platform:slug; static wins).
  const discovered = await getDiscoveredBoards().catch(() => []);
  const seen = new Set(COMPANY_BOARDS.map((b) => `${b.platform}:${b.slug}`));
  const pool: CompanyBoard[] = [...COMPANY_BOARDS];
  for (const d of discovered) {
    const key = `${d.platform}:${d.slug}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pool.push({ company: d.company, platform: d.platform, slug: d.slug, regions: d.regions, industries: d.industries });
  }

  const scored = pool.map((b) => {
    const inRegion = b.regions.includes(region);
    const regionHit = inRegion || b.regions.includes("global");
    const industryHit = b.industries.some((i) => wantIndustries.has(i));
    let score = 0;
    if (regionHit) score += 2;
    if (inRegion) score += 2; // strongly prefer exact-region boards
    if (wantIndustries.size > 0 && industryHit) score += 3;
    // Cross-functional roles exist everywhere → give every in-scope board a
    // baseline so big multi-function employers aren't excluded for lacking the
    // exact industry tag. Anchor boards (high-volume, broad) get a boost.
    if (crossFunctional && regionHit) score += 1;
    if (ANCHOR_SLUGS.has(b.slug)) score += 2;
    return { board: b, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const picked = scored
    .filter((s) => s.score > 0)
    .slice(0, MAX_BOARDS_PER_SEARCH)
    .map((s) => s.board);

  // Fallback: nothing scored (exotic country with no boards) → take a global slice.
  if (picked.length === 0) {
    return pool.filter((b) => b.regions.includes("global") || b.regions.includes("us")).slice(
      0,
      MAX_BOARDS_PER_SEARCH,
    );
  }
  return picked;
}

/**
 * High-volume, broad-function employer boards. These get a selection boost so
 * EVERY search (especially cross-functional ones like "product designer") scans
 * companies that actually post across many roles and geographies — fixing the
 * "depth providers return nothing" gap for non-tech-core queries.
 */
const ANCHOR_SLUGS = new Set<string>([
  "stripe", "airbnb", "databricks", "figma", "datadog", "mongodb", "gitlab",
  "cloudflare", "pinterest", "reddit", "lyft", "instacart", "dropbox", "samsara",
  "toast", "gusto", "monzo", "gocardless", "wayve", "adyen", "celonis", "sumup",
  "hellofresh", "spotify", "palantir", "veeva", "BoschGroup", "Experian", "Visa",
  "Sodexo", "duolingo", "roblox", "riotgames", "epicgames",
]);

/* ---------- fetching ---------- */

async function fetchBoardCached(board: CompanyBoard): Promise<RawJob[]> {
  const key = cacheKey(board);
  const hit = boardCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.jobs;

  const provider = getProvider(board.platform);
  if (!provider) return [];

  const jobs = await provider.fetchBoard(
    { company: board.company, platform: board.platform, slug: board.slug },
    { ...httpContext, fetchJson: (u, o) => httpContext.fetchJson(u, { timeoutMs: BOARD_TIMEOUT_MS, ...o }) },
  );
  boardCache.set(key, { at: Date.now(), jobs });
  return jobs;
}

/** A raw job tagged with the platform that produced it (for source labeling). */
interface TaggedJob {
  job: RawJob;
  platform: string;
}

/** Run board fetches with a concurrency cap; failures are isolated and logged. */
async function scanBoards(
  boards: CompanyBoard[],
  deadlineAt: number,
): Promise<{ jobs: TaggedJob[]; failures: number }> {
  const all: TaggedJob[] = [];
  let failures = 0;
  let cursor = 0;

  async function worker() {
    while (cursor < boards.length) {
      // Stop opening new boards once the budget is spent — return partial
      // results instead of risking the whole function being timed out.
      if (Date.now() >= deadlineAt) return;
      const board = boards[cursor++];
      try {
        const jobs = await fetchBoardCached(board);
        for (const j of jobs) all.push({ job: j, platform: board.platform });
      } catch (err) {
        failures++;
        console.warn(`[jobs.aggregator] ${board.company} (${board.platform}:${board.slug}) failed:`, (err as Error).message);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, boards.length) }, () => worker()));
  return { jobs: all, failures };
}

/* ---------- breadth layer: cross-company platform search ---------- */

interface SearchCacheEntry {
  at: number;
  jobs: RawJob[];
}
const searchCache = new Map<string, SearchCacheEntry>();

function searchCacheKey(providerId: string, q: JobSearchQuery): string {
  return `${providerId}|${q.keywords}|${q.location}|${q.maxDaysOld ?? ""}`;
}

/**
 * Run every cross-company search provider directly from the user's filters.
 * This is the breadth layer: one query → postings from thousands of companies,
 * no registry needed. Failure-isolated and cached like the board scan.
 */
async function runSearchProviders(query: JobSearchQuery): Promise<{ jobs: TaggedJob[]; failures: number }> {
  const providers = searchProviders();
  const all: TaggedJob[] = [];
  let failures = 0;

  await Promise.all(
    providers.map(async (provider) => {
      const key = searchCacheKey(provider.id, query);
      const hit = searchCache.get(key);
      if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
        // The search providers map 1:1 to a platform label; derive it from the id.
        const platform = provider.id.replace(/-search$/, "");
        for (const j of hit.jobs) all.push({ job: j, platform });
        return;
      }
      try {
        const jobs = await provider.search(query, {
          ...httpContext,
          fetchJson: (u, o) => httpContext.fetchJson(u, { timeoutMs: SEARCH_TIMEOUT_MS, ...o }),
        });
        searchCache.set(key, { at: Date.now(), jobs });
        const platform = provider.id.replace(/-search$/, "");
        for (const j of jobs) all.push({ job: j, platform });
      } catch (err) {
        failures++;
        console.warn(`[jobs.aggregator] search provider ${provider.id} failed:`, (err as Error).message);
      }
    }),
  );

  return { jobs: all, failures };
}

/* ---------- filtering ---------- */

function matchesKeywords(job: RawJob, keywords: string): boolean {
  // Title-centric precision (see keywords.ts) — fixes "any single word matches".
  return matchesQuery(
    { title: job.title, department: job.department, description: job.description },
    keywords,
  );
}

/**
 * Strict, geo-aware location matching. The country dropdown is an explicit
 * choice, so it's always enforced; a typed city/region narrows further.
 *
 * Rules per job (in order):
 *   - Job resolves to a DIFFERENT country than selected  → reject (kills the
 *     "I picked US but see Brazil" problem).
 *   - Job resolves to the selected country / a region containing it → keep.
 *   - Job is global-"anywhere" remote → keep.
 *   - Job geo is undetectable:
 *       · remote role            → keep (remote is commonly open to the country)
 *       · has a non-empty location we just couldn't classify → reject when a
 *         country is enforced (better to under-show than show the wrong place)
 *       · empty location + remote/unknown → keep
 *   - A typed city additionally requires the city string (or its country) to match.
 */
function matchesLocation(job: RawJob, filters: JobSearchFilters): boolean {
  const loc = (job.location || "").trim();
  const remote = job.remote === true || looksRemote(loc);

  // 1. Country gate (always enforced — the dropdown always has a value).
  const country = (filters.country || "").trim();
  if (country) {
    const verdict = matchesCountry(loc, country);
    if (verdict === false) return false; // resolves to a different country
    if (verdict === null) {
      // No detectable geo. Keep only if remote or location is blank; otherwise
      // it's a place we couldn't place — exclude to honor the country choice.
      if (!remote && loc !== "") return false;
    }
    // verdict === true → in-country; fall through to the typed-location check.
  }

  // 2. Typed location (city or region) narrows further.
  const typed = (filters.location || "").trim();
  if (typed) {
    if (isCountryName(typed)) {
      // Typed a country → already covered by the country gate / treat as country.
      const verdict = matchesCountry(loc, typed.toLowerCase() === "uk" ? "gb" : typed);
      if (verdict === false) return false;
      return true;
    }
    // Typed a city. Accept if the job names that city, OR it's remote and still
    // passed the country gate (remote-in-country is a reasonable match).
    const cityHit = loc.toLowerCase().includes(typed.toLowerCase());
    if (cityHit) return true;
    if (remote) return true;
    return false;
  }

  return true;
}

function matchesArrangement(job: RawJob, want: JobSearchFilters["arrangements"]): boolean {
  if (!want.length) return true;
  const arr = arrangementOf(job);
  if (!arr) return true; // undetectable → pass
  return want.includes(arr);
}

function matchesJobType(job: RawJob, want: JobSearchFilters["jobTypes"]): boolean {
  if (!want.length) return true;
  const jt = jobTypeOf(job);
  if (!jt) return true;
  return want.includes(jt);
}

function matchesExperience(job: RawJob, want: JobSearchFilters["experience"]): boolean {
  if (!want.length) return true;
  const lvl = experienceOf(job.title);
  if (!lvl) return true;
  return want.includes(lvl);
}

/**
 * Recency gate. Two layers:
 *   - ALWAYS-ON 60-day backstop: postings older than MAX_AGE_DAYS never show.
 *   - User filter: when `maxDaysOld` is set (e.g. "New"), narrow further.
 * Unknown/garbled dates are KEPT (most feeds we can't date are still active),
 * but the ranker down-weights them so dated-fresh roles win.
 *
 * Note we never cut tighter than MIN_FETCH_AGE_DAYS here: a literal 24h cut
 * combined with sources that only expose coarse dates produced empty "New"
 * feeds. "New" still surfaces the freshest roles first via the date sort.
 */
function matchesRecency(job: RawJob, maxDaysOld?: number): boolean {
  const ageMs = jobAgeMs(job);
  if (ageMs == null) return true; // undatable → keep, but ranked lower
  const requested = maxDaysOld ?? MAX_AGE_DAYS;
  const cap = Math.min(Math.max(requested, MIN_FETCH_AGE_DAYS), MAX_AGE_DAYS);
  return ageMs <= cap * 24 * 3600 * 1000;
}

/** Posting age in ms, or null when the date is missing/unparseable. */
function jobAgeMs(job: RawJob): number | null {
  if (!job.postedAt) return null;
  const t = Date.parse(job.postedAt);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Date.now() - t);
}

/* ---------- the provider ---------- */

export const aggregatorProvider: JobProvider = {
  id: "live",

  async search(filters: JobSearchFilters): Promise<Omit<JobSearchResult, "source">> {
    // Run BOTH layers in parallel:
    //   • breadth — cross-company platform search driven straight from filters
    //     (one query → thousands of companies; no registry).
    //   • depth   — per-company registry boards for the platforms that only
    //     expose company-scoped boards (Greenhouse/Lever/Ashby/SmartRecruiters).
    //
    // Everything shares one wall-clock deadline so we always return whatever
    // we've gathered well within the API route's time limit — a slow source
    // can never time out the function and leave the user with an empty feed.
    const deadlineAt = Date.now() + SEARCH_BUDGET_MS;

    // Fetch window: never ask sources for a window tighter than
    // MIN_FETCH_AGE_DAYS. The user's real recency cut (e.g. "New") is applied
    // locally in matchesRecency + the date sort — querying day_range=1 directly
    // starves the feed (Workable returns ~0 at 1 day).
    const fetchAgeDays = Math.min(
      Math.max(filters.maxDaysOld ?? MAX_AGE_DAYS, MIN_FETCH_AGE_DAYS),
      MAX_AGE_DAYS,
    );
    const query: JobSearchQuery = {
      keywords: filters.keywords || "",
      location: resolveSearchLocation(filters),
      maxDaysOld: fetchAgeDays,
      maxResults: MAX_SEARCH_RESULTS,
      deadlineAt,
    };
    const boards = await selectBoards(filters);

    const [search, scan] = await Promise.all([
      runSearchProviders(query),
      scanBoards(boards, deadlineAt),
    ]);

    // Breadth results first — they're already keyword-matched at the source, so
    // they bring the widest company variety; depth fills in the rest.
    const tagged: TaggedJob[] = [...search.jobs, ...scan.jobs];

    // Filter on raw jobs (richer signals than the normalized listing).
    const filtered = tagged.filter(
      ({ job: j }) =>
        j.title &&
        j.url &&
        matchesKeywords(j, filters.keywords || "") &&
        matchesLocation(j, filters) &&
        matchesArrangement(j, filters.arrangements) &&
        matchesJobType(j, filters.jobTypes) &&
        matchesExperience(j, filters.experience) &&
        matchesRecency(j, filters.maxDaysOld),
    );

    // Normalize + dedup by apply URL.
    const seen = new Set<string>();
    const listings: JobListing[] = [];
    for (const { job: j, platform } of filtered) {
      if (seen.has(j.url)) continue;
      seen.add(j.url);
      const listing = normalizeJob(j, platform);
      // Salary floor filter (only when both sides known).
      if (filters.salaryMin && listing.salaryMax && listing.salaryMax < filters.salaryMin) continue;
      listings.push(listing);
      if (listings.length >= MAX_CANDIDATES) break;
    }

    // Return the full candidate set unsorted/unpaginated — the service scores
    // every candidate against the profile, then sorts and paginates so "Best
    // match" ranks across all results rather than within a single page.
    return { jobs: listings, total: listings.length, page: filters.page ?? 1 };
  },
};
