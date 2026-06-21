/**
 * index.ts — tracker service: connection lifecycle, status, and stats.
 *
 * Connect/disconnect manage the TrackerConnection. The connection is created
 * from the Google OAuth callback with real tokens; stats are derived from the
 * live applications.
 */

import { isGoogleConfigured } from "@/lib/env";
import { getStore } from "@/lib/db/store";
import type { TrackedApplication, TrackerConnection } from "@/lib/db/types";
import { syncUser, type SyncSummary } from "./sync";

export interface TrackerStatus {
  connected: boolean;
  email?: string;
  connectedAt?: string;
  lastSyncedAt?: string;
  /** Whether real Gmail OAuth is wired up (controls whether connecting is available). */
  gmailConfigured: boolean;
}

export async function getStatus(userId: string): Promise<TrackerStatus> {
  const store = await getStore();
  const conn = await store.getConnection(userId);
  return {
    connected: conn?.status === "connected",
    email: conn?.email,
    connectedAt: conn?.connectedAt,
    lastSyncedAt: conn?.lastSyncedAt,
    gmailConfigured: isGoogleConfigured,
  };
}

/**
 * Record a connection. Called from the OAuth callback with real Gmail tokens.
 */
export async function connect(
  params: { email: string; accessToken?: string; refreshToken?: string; tokenExpiresAt?: string },
  userId: string,
): Promise<TrackerConnection> {
  const store = await getStore();
  const conn: TrackerConnection = {
    userId,
    email: params.email,
    accessToken: params.accessToken,
    refreshToken: params.refreshToken,
    tokenExpiresAt: params.tokenExpiresAt,
    connectedAt: new Date().toISOString(),
    status: "connected",
  };
  await store.saveConnection(conn);
  return conn;
}

export async function disconnect(userId: string): Promise<void> {
  const store = await getStore();
  await store.deleteConnection(userId);
}

export async function sync(userId: string): Promise<SyncSummary> {
  return syncUser(userId);
}

/** Sync every connected user — used by the daily cron. */
export async function syncAllUsers(): Promise<{ users: number; summaries: SyncSummary[] }> {
  const store = await getStore();
  const userIds = await store.listConnectedUserIds();
  const summaries: SyncSummary[] = [];
  for (const id of userIds) {
    try {
      summaries.push(await syncUser(id));
    } catch (e) {
      console.error(`[tracker.syncAllUsers] failed for ${id}:`, e);
    }
  }
  return { users: userIds.length, summaries };
}

export async function listApplications(userId: string): Promise<TrackedApplication[]> {
  const store = await getStore();
  return store.listApplications(userId);
}

export interface TrackerStats {
  applied: number;
  inReview: number;
  interviews: number;
  offers: number;
  notSelected: number;
  needsAction: number;
  total: number;
}

export function computeStats(apps: TrackedApplication[]): TrackerStats {
  const stats: TrackerStats = {
    applied: 0,
    inReview: 0,
    interviews: 0,
    offers: 0,
    notSelected: 0,
    needsAction: 0,
    total: apps.length,
  };
  for (const a of apps) {
    if (a.needsAction) stats.needsAction++;
    if (a.outcome === "offer") stats.offers++;
    else if (a.outcome === "rejected") stats.notSelected++;
    else if (a.stage >= 2) stats.interviews++;
    else if (a.stage === 1) stats.inReview++;
    else stats.applied++;
  }
  return stats;
}

export type { SyncSummary } from "./sync";
