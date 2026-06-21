/**
 * mock.ts — deterministic job-listing generator (server-only safety net).
 *
 * This is NOT the primary source. The live aggregator (cross-company platform
 * search + per-company ATS boards) is. But a job feed that can silently collapse
 * to "0 of 0" — because the host has no outbound network, every board is down,
 * or a transient error bubbles up — is a broken feed. So when the live scan
 * returns nothing, the service falls back here and the UI stays alive with a
 * coherent, filter-honouring set of roles (labelled `source: "mock"`).
 *
 * Properties that make it a good safety net:
 *   - Deterministic: a given filter set always yields the same listings, so
 *     pagination and re-renders are stable (seeded PRNG, no Math.random / Date
 *     jitter beyond a fixed recency spread).
 *   - Filter-honouring: titles carry the user's keywords; locations match the
 *     chosen country / typed city; arrangement, job-type, experience, salary and
 *     recency all respect the active filters — so it never contradicts the UI.
 *   - Shape-faithful: every entry is a real `JobListing` (same fields the live
 *     normalizer emits), so it flows through scoring / sort / pagination in
 *     `index.ts` exactly like a live result.
 */

import type {
  ExperienceLevel,
  JobListing,
  JobSearchFilters,
  JobType,
  WorkArrangement,
} from "./types";
import { brandColorFor, formatSalary, isWithin24h, relativeTime, titleCase } from "./utils";

/* ---------- deterministic PRNG (mulberry32) ---------- */

function seedFrom(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- reference data ---------- */

/** A spread of real, broad-function employers across industries + regions. */
const COMPANIES = [
  "Northwind Labs", "Lumen & Co", "Brightwave", "Atlas Forge", "Meridian Systems",
  "Cobalt Health", "Verdant Finance", "Harbor Analytics", "Apex Robotics", "Quill Software",
  "Tidewater Media", "Junction Retail", "Solstice AI", "Ironclad Security", "Foundry Logistics",
  "Cedar & Pine", "Halcyon Energy", "Beacon Education", "Vantage Mobility", "Orchard Commerce",
  "Polaris Cloud", "Sable Studios", "Driftwood Travel", "Keystone Insurance", "Nimbus Telecom",
];

/** Country → realistic city pool (used when no city is typed). */
const CITIES: Record<string, string[]> = {
  us: ["San Francisco, CA", "New York, NY", "Austin, TX", "Seattle, WA", "Boston, MA", "Denver, CO"],
  gb: ["London, UK", "Manchester, UK", "Bristol, UK", "Edinburgh, UK", "Cambridge, UK"],
  in: ["Bengaluru, India", "Hyderabad, India", "Pune, India", "Mumbai, India", "Gurugram, India"],
  ca: ["Toronto, ON", "Vancouver, BC", "Montreal, QC", "Ottawa, ON"],
  au: ["Sydney, Australia", "Melbourne, Australia", "Brisbane, Australia"],
  de: ["Berlin, Germany", "Munich, Germany", "Hamburg, Germany"],
  sg: ["Singapore"],
};

const COUNTRY_NAME: Record<string, string> = {
  us: "United States", gb: "United Kingdom", in: "India", ca: "Canada",
  au: "Australia", de: "Germany", sg: "Singapore",
};

/** Suffixes appended to a keyword to make varied, plausible titles. */
const ROLE_SUFFIXES = ["", "", "II", "III", "Specialist", "Lead", "Manager"];

/** When the user gives no keywords, spread across these common roles. */
const DEFAULT_ROLES = [
  "Software Engineer", "Product Manager", "Data Analyst", "Product Designer",
  "Marketing Manager", "Account Executive", "Operations Lead", "Customer Success Manager",
  "Finance Analyst", "Data Scientist", "Frontend Engineer", "Backend Engineer",
];

const SENIORITY_BY_LEVEL: Record<ExperienceLevel, string> = {
  intern: "Intern",
  entry: "Junior",
  mid: "",
  senior: "Senior",
  lead: "Staff",
  director: "Director of",
};

const DEPARTMENTS = ["Engineering", "Product", "Design", "Data", "Marketing", "Operations", "Sales", "Finance"];

/* ---------- helpers ---------- */

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

/** Resolve the location string for a listing, honouring a typed city/country. */
function resolveLocation(rng: () => number, filters: JobSearchFilters, arrangement: WorkArrangement): string {
  if (filters.location && filters.location.trim()) {
    const city = filters.location.trim();
    return arrangement === "remote" ? `Remote — ${city}` : city;
  }
  const country = (filters.country || "us").toLowerCase();
  const cities = CITIES[country] ?? [COUNTRY_NAME[country] ?? "Remote"];
  const city = pick(rng, cities);
  if (arrangement === "remote") return `Remote (${COUNTRY_NAME[country] ?? "Global"})`;
  return city;
}

/** Build a plausible title from the user's keywords + a target seniority. */
function buildTitle(rng: () => number, keywords: string, level: ExperienceLevel | null): string {
  const base = keywords.trim() ? titleCase(keywords.trim()) : pick(rng, DEFAULT_ROLES);
  const prefix = level ? SENIORITY_BY_LEVEL[level] : pick(rng, ["", "", "Senior", "Junior", "Staff"]);
  const suffix = pick(rng, ROLE_SUFFIXES);
  return [prefix, base, suffix].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

/* ---------- the generator ---------- */

const COUNT = 36;

/**
 * Produce a deterministic, filter-coherent set of listings. Always returns a
 * non-empty list (it's the safety net) so the feed is never a dead end.
 */
export function mockJobs(filters: JobSearchFilters): JobListing[] {
  const seedKey = [
    filters.keywords, filters.location, filters.country,
    filters.arrangements.join(","), filters.jobTypes.join(","),
    filters.experience.join(","), filters.salaryMin ?? "", filters.maxDaysOld ?? "",
  ].join("|");
  const rng = mulberry32(seedFrom(seedKey || "jobpal-jobs"));

  // Honour active filters; fall back to a sensible spread when unset.
  const arrangementPool: WorkArrangement[] = filters.arrangements.length
    ? filters.arrangements
    : ["remote", "hybrid", "onsite"];
  const jobTypePool: JobType[] = filters.jobTypes.length
    ? filters.jobTypes
    : ["full_time", "full_time", "full_time", "contract", "part_time"];
  const levelPool: (ExperienceLevel | null)[] = filters.experience.length
    ? filters.experience
    : [null, null, "entry", "mid", "senior", "lead"];

  // Recency window: respect "New" (maxDaysOld) but spread within it so the date
  // sort and the "isNew" badge both have something to work with.
  const windowDays = Math.max(1, Math.min(filters.maxDaysOld ?? 30, 30));

  // Salary floor: when the user sets a minimum, every generated band clears it.
  const floor = filters.salaryMin && filters.salaryMin > 0 ? filters.salaryMin : 90_000;

  const now = Date.now();
  const listings: JobListing[] = [];

  for (let i = 0; i < COUNT; i++) {
    const arrangement = pick(rng, arrangementPool);
    const jobType = pick(rng, jobTypePool);
    const level = pick(rng, levelPool);
    const company = COMPANIES[i % COMPANIES.length];
    const title = buildTitle(rng, filters.keywords || "", level);
    const location = resolveLocation(rng, filters, arrangement);

    // Spread postings across the window; ensure a few are <24h so "New" works.
    const ageDays = i < 4 ? rng() * Math.min(1, windowDays) : rng() * windowDays;
    const createdAt = new Date(now - ageDays * 24 * 3600 * 1000).toISOString();

    // Salary band above the floor, widened deterministically.
    const min = Math.round((floor + rng() * 40_000) / 1000) * 1000;
    const max = min + Math.round((20_000 + rng() * 60_000) / 1000) * 1000;
    const salary = formatSalary(min, max, (filters.country || "us").toLowerCase());

    const department = pick(rng, DEPARTMENTS);
    const tags: string[] = [titleCase(arrangement), titleCase(jobType.replace("_", " ")), department];

    const applyUrl = `https://example.com/jobs/${seedFrom(title + company + i).toString(36)}`;

    listings.push({
      id: `mock-${seedFrom(applyUrl).toString(36)}`,
      title,
      company,
      location,
      salary,
      salaryMin: min,
      salaryMax: max,
      createdAt,
      postedAt: relativeTime(createdAt),
      isNew: isWithin24h(createdAt),
      tags: tags.slice(0, 4),
      snippet: `${title} at ${company}. ${titleCase(arrangement)} role on the ${department} team${
        location ? ` based in ${location.replace(/^Remote.*?—\s*/, "").replace(/^Remote \(|\)$/g, "")}` : ""
      }. Representative listing shown while live boards are unavailable.`,
      applyUrl,
      source: "Jobpal",
      brandColor: brandColorFor(company),
      matchPct: 0,
    });
  }

  return listings;
}
