/**
 * lever.ts — Lever postings API provider.
 *
 * Public endpoint: https://api.lever.co/v0/postings/{slug}?mode=json
 * Returns a flat array; each posting carries text, hostedUrl, categories
 * (location/commitment/department), createdAt (epoch ms) and workplaceType.
 */

import type { AtsProvider, BoardRef, ProviderContext, RawJob } from "./types";

interface LeverJob {
  text?: string;
  hostedUrl?: string;
  applyUrl?: string;
  createdAt?: number;
  workplaceType?: string;
  descriptionPlain?: string;
  categories?: {
    location?: string;
    commitment?: string;
    department?: string;
    team?: string;
    allLocations?: string[];
  };
}

export const leverProvider: AtsProvider = {
  id: "lever",

  async fetchBoard(ref: BoardRef, ctx: ProviderContext): Promise<RawJob[]> {
    const url = `https://api.lever.co/v0/postings/${encodeURIComponent(ref.slug)}?mode=json`;
    const data = await ctx.fetchJson<LeverJob[]>(url, { redirect: "error" });
    if (!Array.isArray(data)) return [];

    return data
      .filter((j) => (j.hostedUrl || j.applyUrl) && j.text)
      .map((j) => {
        const wt = (j.workplaceType || "").toLowerCase();
        return {
          title: j.text!.trim(),
          url: (j.hostedUrl || j.applyUrl)!,
          company: ref.company,
          location: j.categories?.location?.trim() ?? "",
          remote: wt === "remote" ? true : wt === "on-site" || wt === "hybrid" ? false : undefined,
          postedAt: typeof j.createdAt === "number" ? new Date(j.createdAt).toISOString() : undefined,
          description: j.descriptionPlain?.trim(),
          department: j.categories?.department || j.categories?.team,
          employmentType: j.categories?.commitment,
        };
      });
  },
};
