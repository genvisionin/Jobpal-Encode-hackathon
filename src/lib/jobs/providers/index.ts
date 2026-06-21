/**
 * providers/index.ts — the ATS provider registry (server-only).
 *
 * Adding a new platform is a two-step change: drop a provider module here and
 * add boards on that platform to the company registry. The aggregator looks up
 * a provider by `BoardRef.platform` via `getProvider`.
 */

import type { AtsProvider, ProviderContext, SearchProvider } from "./types";
import { fetchJson, fetchText } from "./http";
import { greenhouseProvider } from "./greenhouse";
import { leverProvider } from "./lever";
import { ashbyProvider } from "./ashby";
import { workableProvider } from "./workable";
import { smartRecruitersProvider } from "./smartrecruiters";
import { workableSearchProvider } from "./workable-search";
import { theMuseSearchProvider } from "./themuse-search";

const PROVIDERS: AtsProvider[] = [
  greenhouseProvider,
  leverProvider,
  ashbyProvider,
  workableProvider,
  smartRecruitersProvider,
];

const BY_ID = new Map<string, AtsProvider>(PROVIDERS.map((p) => [p.id, p]));

/** Cross-company search providers (breadth layer) — query the whole platform. */
const SEARCH_PROVIDERS: SearchProvider[] = [workableSearchProvider, theMuseSearchProvider];

export function getProvider(id: string): AtsProvider | undefined {
  return BY_ID.get(id);
}

export function providerIds(): string[] {
  return [...BY_ID.keys()];
}

export function searchProviders(): SearchProvider[] {
  return SEARCH_PROVIDERS;
}

/** A shared HTTP context handed to every provider call. */
export const httpContext: ProviderContext = { fetchJson, fetchText };

export type { AtsProvider, SearchProvider, BoardRef, RawJob, ProviderContext, JobSearchQuery } from "./types";
