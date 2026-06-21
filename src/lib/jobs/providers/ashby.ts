/**
 * ashby.ts — Ashby public posting-api provider.
 *
 * Public endpoint:
 *   https://api.ashbyhq.com/posting-api/job-board/{slug}?includeCompensation=true
 * Each job carries title, jobUrl/applyUrl, location, isRemote, publishedAt,
 * employmentType, department, descriptionPlain and (opt-in) a compensation
 * summary string we surface as the salary.
 */

import type { AtsProvider, BoardRef, ProviderContext, RawJob } from "./types";

interface AshbyJob {
  title?: string;
  jobUrl?: string;
  applyUrl?: string;
  location?: string;
  isRemote?: boolean;
  publishedAt?: string;
  employmentType?: string;
  department?: string;
  team?: string;
  descriptionPlain?: string;
  compensation?: {
    compensationTierSummary?: string;
    scrapeableCompensationSalarySummary?: string;
  };
}

/** Map Ashby's enum (FullTime/PartTime/Contract/Intern/Temporary) to a label. */
function employmentLabel(t?: string): string | undefined {
  if (!t) return undefined;
  return t
    .replace(/([a-z])([A-Z])/g, "$1 $2") // FullTime → Full Time
    .replace(/\bFull Time\b/i, "Full-time")
    .replace(/\bPart Time\b/i, "Part-time");
}

export const ashbyProvider: AtsProvider = {
  id: "ashby",

  async fetchBoard(ref: BoardRef, ctx: ProviderContext): Promise<RawJob[]> {
    const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(ref.slug)}?includeCompensation=true`;
    const data = await ctx.fetchJson<{ jobs?: AshbyJob[] }>(url, { redirect: "error" });
    const jobs = Array.isArray(data?.jobs) ? data.jobs : [];

    return jobs
      .filter((j) => (j.jobUrl || j.applyUrl) && j.title)
      .map((j) => ({
        title: j.title!.trim(),
        url: (j.jobUrl || j.applyUrl)!,
        company: ref.company,
        location: j.location?.trim() ?? "",
        remote: j.isRemote,
        postedAt: j.publishedAt,
        description: j.descriptionPlain?.trim(),
        department: j.department || j.team,
        employmentType: employmentLabel(j.employmentType),
        salary:
          j.compensation?.scrapeableCompensationSalarySummary ||
          j.compensation?.compensationTierSummary ||
          undefined,
      }));
  },
};
