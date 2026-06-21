/**
 * smartrecruiters.ts — SmartRecruiters public Posting API provider.
 *
 * Public endpoint: https://api.smartrecruiters.com/v1/companies/{slug}/postings
 * Paginated via offset/limit (max 100). Each posting carries name, location,
 * releasedDate, typeOfEmployment{label}, experienceLevel, department/function,
 * company{name}. Public posting URL: https://jobs.smartrecruiters.com/{slug}/{id}
 * This platform powers many large UK/EU + non-tech enterprises (Bosch, Visa,
 * Experian, …), so it broadens coverage well beyond startup ATSs.
 */

import type { AtsProvider, BoardRef, ProviderContext, RawJob } from "./types";

interface SrLocation {
  city?: string;
  region?: string;
  country?: string;
  remote?: boolean;
  fullLocation?: string;
}
interface SrPosting {
  id?: string;
  name?: string;
  releasedDate?: string;
  location?: SrLocation;
  company?: { name?: string; identifier?: string };
  department?: { label?: string };
  function?: { label?: string };
  typeOfEmployment?: { label?: string };
}
interface SrResponse {
  offset?: number;
  limit?: number;
  totalFound?: number;
  content?: SrPosting[];
}

const PAGE_LIMIT = 100;
const MAX_PAGES = 5; // cap at 500 postings/board to stay bounded

function locationText(loc?: SrLocation): string {
  if (!loc) return "";
  if (loc.fullLocation) return loc.fullLocation;
  return [loc.city, loc.region, loc.country?.toUpperCase()].filter(Boolean).join(", ");
}

export const smartRecruitersProvider: AtsProvider = {
  id: "smartrecruiters",

  async fetchBoard(ref: BoardRef, ctx: ProviderContext): Promise<RawJob[]> {
    const base = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(ref.slug)}/postings`;
    const out: RawJob[] = [];

    for (let page = 0; page < MAX_PAGES; page++) {
      const offset = page * PAGE_LIMIT;
      const data = await ctx.fetchJson<SrResponse>(`${base}?limit=${PAGE_LIMIT}&offset=${offset}`, {
        redirect: "error",
      });
      const content = Array.isArray(data?.content) ? data.content : [];
      for (const p of content) {
        if (!p.id || !p.name) continue;
        out.push({
          title: p.name.trim(),
          url: `https://jobs.smartrecruiters.com/${ref.slug}/${p.id}`,
          company: p.company?.name || ref.company,
          location: p.location?.remote ? locationText(p.location) || "Remote" : locationText(p.location),
          remote: p.location?.remote,
          postedAt: p.releasedDate,
          department: p.department?.label || p.function?.label,
          employmentType: p.typeOfEmployment?.label,
        });
      }
      const total = data?.totalFound ?? out.length;
      if (offset + PAGE_LIMIT >= total || content.length === 0) break;
    }

    return out;
  },
};
