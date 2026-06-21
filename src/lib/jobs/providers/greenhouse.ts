/**
 * greenhouse.ts — Greenhouse Job Board API provider.
 *
 * Public endpoint: https://boards-api.greenhouse.io/v1/boards/{slug}/jobs
 * The list endpoint already includes title, absolute_url, location, dates and
 * (with ?content=true) the HTML description. We keep the list call light and
 * skip per-job content fetches — the description snippet is optional and the
 * match score works from title + location + department.
 */

import type { AtsProvider, BoardRef, ProviderContext, RawJob } from "./types";

interface GhJob {
  title?: string;
  absolute_url?: string;
  location?: { name?: string };
  updated_at?: string;
  first_published?: string;
  departments?: { name?: string }[];
}

const ALLOWED_HOSTS = new Set([
  "boards-api.greenhouse.io",
  "boards.greenhouse.io",
  "job-boards.greenhouse.io",
]);

export const greenhouseProvider: AtsProvider = {
  id: "greenhouse",

  async fetchBoard(ref: BoardRef, ctx: ProviderContext): Promise<RawJob[]> {
    const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(ref.slug)}/jobs`;
    if (!ALLOWED_HOSTS.has(new URL(url).hostname)) throw new Error("greenhouse: blocked host");

    const data = await ctx.fetchJson<{ jobs?: GhJob[] }>(url, { redirect: "error" });
    const jobs = Array.isArray(data?.jobs) ? data.jobs : [];

    return jobs
      .filter((j) => j.absolute_url && j.title)
      .map((j) => ({
        title: j.title!.trim(),
        url: j.absolute_url!,
        company: ref.company,
        location: j.location?.name?.trim() ?? "",
        postedAt: j.first_published || j.updated_at,
        department: j.departments?.[0]?.name,
      }));
  },
};
