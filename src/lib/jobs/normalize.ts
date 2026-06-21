/**
 * normalize.ts — turn a provider `RawJob` into a feed `JobListing`, plus the
 * inference helpers used both for display tags and for post-fetch filtering.
 *
 * ATS feeds rarely tag arrangement / seniority / job-type uniformly, so we
 * infer them from the title + location + the platform's own hints. Inference is
 * deliberately lenient: an undetectable signal never drops a job from a filter,
 * it just won't add a tag.
 */

import type { RawJob } from "./providers/types";
import type {
  ExperienceLevel,
  JobListing,
  JobType,
  WorkArrangement,
} from "./types";
import { brandColorFor, detectArrangement, isWithin24h, relativeTime, titleCase } from "./utils";

const PLATFORM_LABEL: Record<string, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  workable: "Workable",
  smartrecruiters: "SmartRecruiters",
  themuse: "The Muse",
};

/** Stable id from the apply URL (the dedup key). */
function idFor(url: string): string {
  let h = 2166136261;
  for (let i = 0; i < url.length; i++) {
    h ^= url.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `job-${(h >>> 0).toString(36)}`;
}

/** Best-effort arrangement from explicit flag → text signals. */
export function arrangementOf(job: RawJob): WorkArrangement | null {
  if (job.remote === true) return "remote";
  const fromText = detectArrangement(`${job.location} ${job.title}`);
  if (fromText) return fromText;
  if (job.remote === false && job.location) return "onsite";
  return null;
}

/** Map a free-form employment-type label to our JobType enum. */
export function jobTypeOf(job: RawJob): JobType | null {
  const t = `${job.employmentType ?? ""} ${job.title}`.toLowerCase();
  if (/\bpart[\s-]?time\b/.test(t)) return "part_time";
  if (/\bcontract|contractor|fixed[\s-]?term|temporary\b/.test(t)) return "contract";
  if (/\bpermanent\b/.test(t)) return "permanent";
  if (/\bfull[\s-]?time\b/.test(t)) return "full_time";
  return null;
}

/** Infer seniority from the title. */
export function experienceOf(title: string): ExperienceLevel | null {
  const t = title.toLowerCase();
  if (/\bintern(ship)?\b/.test(t)) return "intern";
  if (/\bdirector|vp|vice president|head of\b/.test(t)) return "director";
  if (/\b(staff|principal)\b/.test(t)) return "lead";
  if (/\blead\b/.test(t)) return "lead";
  if (/\bsenior|sr\.?|staff\b/.test(t)) return "senior";
  if (/\bjunior|jr\.?|entry|graduate|associate\b/.test(t)) return "entry";
  return null;
}

/**
 * Parse a compensation summary string into numeric bounds.
 * Handles "$211.4K – $290.6K", "£80,000 - £100,000", "120k+", "€90K".
 * Returns undefined fields when not parseable.
 */
export function parseSalary(raw?: string): { min?: number; max?: number } {
  if (!raw) return {};
  const nums = [...raw.matchAll(/([£$€]?\s*)(\d[\d,.]*)\s*(k|K|m|M)?/g)]
    .map((m) => {
      let n = parseFloat(m[2].replace(/,/g, ""));
      if (Number.isNaN(n)) return null;
      const unit = (m[3] || "").toLowerCase();
      if (unit === "k") n *= 1_000;
      else if (unit === "m") n *= 1_000_000;
      // Bare small numbers like "120" with no unit but a currency prefix → assume k.
      else if (!unit && n < 1000 && /[£$€]/.test(m[1])) n *= 1_000;
      return n >= 1000 ? n : null;
    })
    .filter((n): n is number => n != null);

  if (nums.length === 0) return {};
  if (nums.length === 1) return { min: nums[0] };
  return { min: Math.min(...nums), max: Math.max(...nums) };
}

/** Build the display tag list (arrangement, type, seniority, department). */
function tagsFor(job: RawJob): string[] {
  const tags: string[] = [];
  const arr = arrangementOf(job);
  if (arr) tags.push(titleCase(arr));
  const jt = jobTypeOf(job);
  if (jt) tags.push(titleCase(jt.replace("_", " ")));
  if (job.department) tags.push(job.department);
  return tags.slice(0, 4);
}

function snippetFor(job: RawJob): string {
  if (job.description && job.description.length > 0) {
    return job.description.replace(/\s+/g, " ").trim().slice(0, 220);
  }
  const where = job.location ? ` (${job.location})` : "";
  return `${job.title} at ${job.company}${where}. Open role sourced live from the company careers board.`;
}

/** Normalize one raw job into a feed listing. matchPct is filled in later. */
export function normalizeJob(job: RawJob, platform: string): JobListing {
  const createdAt = job.postedAt && !Number.isNaN(Date.parse(job.postedAt)) ? job.postedAt : "";
  const { min, max } = parseSalary(job.salary);
  return {
    id: idFor(job.url),
    title: job.title,
    company: job.company,
    location: job.location || (job.remote ? "Remote" : ""),
    salary: job.salary?.trim() ?? "",
    salaryMin: min,
    salaryMax: max,
    createdAt,
    postedAt: createdAt ? relativeTime(createdAt) : "",
    isNew: createdAt ? isWithin24h(createdAt) : false,
    tags: tagsFor(job),
    snippet: snippetFor(job),
    applyUrl: job.url,
    source: PLATFORM_LABEL[platform] ?? platform,
    brandColor: brandColorFor(job.company),
    matchPct: 0,
  };
}
