/**
 * discovered-store.ts — persistence for boards found by reverse-search discovery.
 *
 * Discovery (cron) appends validated company boards here; the aggregator merges
 * them with the static `COMPANY_BOARDS` registry at search time, so coverage of
 * the per-company platforms (GH/Lever/Ashby/SR) grows over time without code
 * changes. Deduped by `platform:slug`.
 *
 * Storage is a single JSON file under `.data/` (zero-config, mirrors the local
 * DB store). For a multi-instance production deploy, back this with a Supabase
 * `discovered_boards` table instead — the shape (`DiscoveredBoard[]`) is the
 * same, so swapping the read/write here is all that's needed.
 *
 * SERVER-ONLY (filesystem).
 */

import { promises as fs } from "fs";
import path from "path";
import type { Industry, Region } from "./registry";

export interface DiscoveredBoard {
  company: string;
  platform: "greenhouse" | "lever" | "ashby" | "smartrecruiters";
  slug: string;
  /** Best-effort tags so selection biasing still works; default to broad. */
  regions: Region[];
  industries: Industry[];
  /** Open postings at discovery time (freshness signal). */
  jobCount: number;
  /** ISO timestamp first discovered / last confirmed. */
  discoveredAt: string;
}

const DATA_DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "discovered-boards.json");

let cache: { at: number; boards: DiscoveredBoard[] } | null = null;
const CACHE_TTL_MS = 60 * 1000;
let writeLock: Promise<void> = Promise.resolve();

async function readAll(): Promise<DiscoveredBoard[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.boards;
  try {
    const boards = JSON.parse(await fs.readFile(FILE, "utf-8")) as DiscoveredBoard[];
    cache = { at: Date.now(), boards };
    return boards;
  } catch {
    cache = { at: Date.now(), boards: [] };
    return [];
  }
}

async function writeAll(boards: DiscoveredBoard[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(boards, null, 2), "utf-8");
  cache = { at: Date.now(), boards };
}

async function updateAll<T>(fn: (boards: DiscoveredBoard[]) => Promise<T> | T): Promise<T> {
  const previous = writeLock;
  let release!: () => void;
  writeLock = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous.catch(() => undefined);
  try {
    return await fn(await readAll());
  } finally {
    release();
  }
}

/** All discovered boards (used by the aggregator to augment the static registry). */
export async function getDiscoveredBoards(): Promise<DiscoveredBoard[]> {
  return readAll();
}

/**
 * Merge freshly discovered boards in, deduped by `platform:slug`. Existing rows
 * are refreshed (jobCount + discoveredAt); new rows are appended. Returns how
 * many were newly added.
 */
export async function upsertDiscoveredBoards(incoming: DiscoveredBoard[]): Promise<{ added: number; total: number }> {
  return updateAll(async (existing) => {
    const byKey = new Map(existing.map((b) => [`${b.platform}:${b.slug}`, b]));
    let added = 0;
    for (const b of incoming) {
      const key = `${b.platform}:${b.slug}`;
      if (byKey.has(key)) {
        const prev = byKey.get(key)!;
        byKey.set(key, { ...prev, jobCount: b.jobCount, discoveredAt: b.discoveredAt });
      } else {
        byKey.set(key, b);
        added++;
      }
    }
    const merged = [...byKey.values()];
    await writeAll(merged);
    return { added, total: merged.length };
  });
}
