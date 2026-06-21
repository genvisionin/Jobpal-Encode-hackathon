/**
 * workable.ts — Workable public job-board API provider.
 *
 * Public endpoint (POST): https://apply.workable.com/api/v3/accounts/{slug}/jobs
 * Body is an (optional) filter object; an empty body returns published roles.
 * Each result carries title, shortcode, location{country,city,…}, remote,
 * published, department[], workplace. Public posting URL is
 *   https://apply.workable.com/{slug}/j/{shortcode}/
 */

import type { AtsProvider, BoardRef, ProviderContext, RawJob } from "./types";

interface WkLocation {
  country?: string;
  city?: string;
  region?: string;
}
interface WkJob {
  title?: string;
  shortcode?: string;
  remote?: boolean;
  location?: WkLocation;
  published?: string;
  type?: string; // "full" | "part" | "contract" | "temporary" | "internship"
  department?: string[];
  workplace?: string; // "remote" | "on_site" | "hybrid"
}

function locationText(loc?: WkLocation): string {
  if (!loc) return "";
  return [loc.city, loc.region, loc.country].filter(Boolean).join(", ");
}

const TYPE_LABEL: Record<string, string> = {
  full: "Full-time",
  part: "Part-time",
  contract: "Contract",
  temporary: "Temporary",
  internship: "Internship",
};

export const workableProvider: AtsProvider = {
  id: "workable",

  async fetchBoard(ref: BoardRef, ctx: ProviderContext): Promise<RawJob[]> {
    const url = `https://apply.workable.com/api/v3/accounts/${encodeURIComponent(ref.slug)}/jobs`;
    const data = await ctx.fetchJson<{ results?: WkJob[] }>(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
      redirect: "error",
    });
    const jobs = Array.isArray(data?.results) ? data.results : [];

    return jobs
      .filter((j) => j.shortcode && j.title)
      .map((j) => ({
        title: j.title!.trim(),
        url: `https://apply.workable.com/${ref.slug}/j/${j.shortcode}/`,
        company: ref.company,
        location: j.remote || j.workplace === "remote" ? locationText(j.location) || "Remote" : locationText(j.location),
        remote: j.remote ?? j.workplace === "remote",
        postedAt: j.published,
        department: j.department?.[0],
        employmentType: j.type ? TYPE_LABEL[j.type] : undefined,
      }));
  },
};
