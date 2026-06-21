/**
 * sync.ts — the daily ingestion pipeline for the Gmail tracker.
 *
 * For a connected user:
 *   1. fetch messages received since max(connectedAt, lastSyncedAt) from Gmail
 *   2. skip any email id we've already ingested (idempotent)
 *   3. classify each email (LLM or heuristic)
 *   4. link job-related emails into applications (create/update, dedup)
 *   5. persist applications + an email-event audit row, advance the cursor
 *
 * This is invoked by the manual "Sync now" action and the daily cron.
 */

import { isGoogleConfigured } from "@/lib/env";
import { getStore } from "@/lib/db/store";
import type { TrackedApplication, TrackerConnection } from "@/lib/db/types";
import type { EmailMessage } from "@/lib/schema/tracker";
import { fetchMessagesSince, refreshAccessToken } from "./gmail";
import { classifyEmail } from "./classify";
import { linkEmail } from "./linker";

export interface SyncSummary {
  scanned: number;
  jobRelated: number;
  created: number;
  updated: number;
  source: "gmail";
}

/**
 * How far back the FIRST sync scans, so existing application mail already in
 * the inbox is picked up — not just mail that arrives after connecting. Once
 * the first sync sets `lastSyncedAt`, later syncs are incremental from there.
 */
const BACKFILL_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Max messages pulled in one sync (more on the first/backfill pass). */
const BACKFILL_MAX = 120;
const INCREMENTAL_MAX = 50;

/** Fetch candidate emails for this connection from Gmail. */
async function fetchCandidates(conn: TrackerConnection): Promise<{ emails: EmailMessage[]; source: "gmail" }> {
  // The initial backfill is marked done via `syncCursor`. Until then (incl.
  // connections made before backfill existed), scan a window *before*
  // connectedAt so mail already in the inbox is ingested — not just mail that
  // arrives after connecting.
  const needsBackfill = !conn.syncCursor;
  const since = needsBackfill
    ? new Date(new Date(conn.connectedAt).getTime() - BACKFILL_DAYS * DAY_MS).toISOString()
    : conn.lastSyncedAt ?? conn.connectedAt;
  const max = needsBackfill ? BACKFILL_MAX : INCREMENTAL_MAX;

  if (isGoogleConfigured && conn.accessToken) {
    let accessToken = conn.accessToken;
    // Refresh if expired.
    if (conn.tokenExpiresAt && new Date(conn.tokenExpiresAt) <= new Date() && conn.refreshToken) {
      const refreshed = await refreshAccessToken(conn.refreshToken);
      accessToken = refreshed.accessToken;
      const store = await getStore();
      await store.saveConnection({ ...conn, accessToken, tokenExpiresAt: refreshed.expiresAt });
    }
    const emails = await fetchMessagesSince(accessToken, since, max);
    return { emails, source: "gmail" };
  }

  // No Gmail access (not configured or no token) → nothing to ingest.
  return { emails: [], source: "gmail" };
}

/** Marker stored in `syncCursor` once the initial backfill has completed. */
const BACKFILL_DONE = "backfill:v1";

export async function syncUser(userId: string): Promise<SyncSummary> {
  const store = await getStore();
  const conn = await store.getConnection(userId);
  if (!conn || conn.status !== "connected") {
    return { scanned: 0, jobRelated: 0, created: 0, updated: 0, source: "gmail" };
  }

  const { emails, source } = await fetchCandidates(conn);

  // Oldest-first so lifecycle order (confirmation → interview → decision) links cleanly.
  emails.sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));

  // Work against an in-memory copy of applications, flushing as we go.
  let applications: TrackedApplication[] = await store.listApplications(userId);

  const summary: SyncSummary = { scanned: 0, jobRelated: 0, created: 0, updated: 0, source };

  for (const email of emails) {
    if (await store.hasEmailEvent(userId, email.id)) continue; // idempotent
    summary.scanned++;

    const classification = await classifyEmail(email);

    // Audit every scanned email (even non-job, with low confidence) so we
    // never reprocess it and can debug classification later.
    if (!classification.isJobRelated || classification.kind === "not_job") {
      await store.saveEmailEvent({
        id: email.id,
        userId,
        threadId: email.threadId,
        kind: classification.kind,
        company: classification.company,
        role: classification.role,
        receivedAt: email.receivedAt,
        eventDate: classification.eventDate || undefined,
        summary: "Not job-related",
        confidence: classification.confidence,
      });
      continue;
    }

    summary.jobRelated++;
    const linked = linkEmail(userId, classification, applications, email.receivedAt, {
      id: email.id,
      threadId: email.threadId,
    });
    if (!linked) {
      await store.saveEmailEvent({
        id: email.id,
        userId,
        threadId: email.threadId,
        kind: classification.kind,
        company: classification.company,
        role: classification.role,
        receivedAt: email.receivedAt,
        eventDate: classification.eventDate || undefined,
        summary: classification.actionSummary || "No actionable change",
        confidence: classification.confidence,
      });
      continue;
    }

    // Persist the application and update the in-memory set.
    await store.saveApplication(linked.application);
    if (linked.created) {
      applications.push(linked.application);
      summary.created++;
    } else {
      applications = applications.map((a) => (a.id === linked.application.id ? linked.application : a));
      summary.updated++;
    }

    await store.saveEmailEvent({
      id: email.id,
      userId,
      applicationId: linked.application.id,
      threadId: email.threadId,
      kind: classification.kind,
      company: classification.company,
      role: classification.role,
      receivedAt: email.receivedAt,
      eventDate: classification.eventDate || undefined,
      summary: classification.actionSummary || classification.kind,
      confidence: classification.confidence,
    });
  }

  // Advance the sync timestamp, and mark the initial backfill complete so
  // subsequent syncs run incrementally from here.
  await store.saveConnection({
    ...conn,
    lastSyncedAt: new Date().toISOString(),
    syncCursor: conn.syncCursor ?? BACKFILL_DONE,
  });

  return summary;
}
