/**
 * store.ts — the persistence interface and backend selection.
 *
 * `getStore()` returns a Supabase-backed store when configured, otherwise a
 * local JSON file store (under .data/) so the app is fully functional for
 * local testing without any database. Both satisfy the same interface.
 */

import { isSupabaseConfigured } from "@/lib/env";
import type {
  StoredProfile,
  StoredTailoredCV,
  TrackerConnection,
  TrackedApplication,
  EmailEvent,
  ExtensionAuthCode,
  ExtensionFieldMemory,
  ExtensionSession,
  StoredProfileEnrichment,
  StoredInterviewPrep,
  Subscription,
  UsageCounter,
} from "./types";

export interface JobpalStore {
  getProfile(userId: string): Promise<StoredProfile | null>;
  saveProfile(profile: StoredProfile): Promise<StoredProfile>;

  listTailoredCVs(userId: string): Promise<StoredTailoredCV[]>;
  getTailoredCV(userId: string, id: string): Promise<StoredTailoredCV | null>;
  saveTailoredCV(cv: StoredTailoredCV): Promise<StoredTailoredCV>;

  // --- Gmail tracker ---
  getConnection(userId: string): Promise<TrackerConnection | null>;
  saveConnection(conn: TrackerConnection): Promise<TrackerConnection>;
  deleteConnection(userId: string): Promise<void>;
  /** All user ids with an active connection — used by the daily cron. */
  listConnectedUserIds(): Promise<string[]>;

  listApplications(userId: string): Promise<TrackedApplication[]>;
  getApplication(userId: string, id: string): Promise<TrackedApplication | null>;
  saveApplication(app: TrackedApplication): Promise<TrackedApplication>;

  /** Has this email id already been ingested? (idempotency) */
  hasEmailEvent(userId: string, emailId: string): Promise<boolean>;
  saveEmailEvent(event: EmailEvent): Promise<EmailEvent>;
  listEmailEvents(userId: string): Promise<EmailEvent[]>;
  listEmailEventsForApplication(userId: string, applicationId: string): Promise<EmailEvent[]>;

  // --- Interview prep ---
  getInterviewPrep(userId: string, applicationId: string): Promise<StoredInterviewPrep | null>;
  saveInterviewPrep(prep: StoredInterviewPrep): Promise<StoredInterviewPrep>;

  // --- Chrome extension auth ---
  saveExtensionAuthCode(code: ExtensionAuthCode): Promise<ExtensionAuthCode>;
  getExtensionAuthCode(codeHash: string): Promise<ExtensionAuthCode | null>;
  markExtensionAuthCodeUsed(codeHash: string, usedAt: string): Promise<void>;
  saveExtensionSession(session: ExtensionSession): Promise<ExtensionSession>;
  getExtensionSessionByAccessHash(accessTokenHash: string): Promise<ExtensionSession | null>;
  getExtensionSessionByRefreshHash(refreshTokenHash: string): Promise<ExtensionSession | null>;
  revokeExtensionSession(id: string, revokedAt: string): Promise<void>;
  listExtensionFieldMemories(userId: string): Promise<ExtensionFieldMemory[]>;
  upsertExtensionFieldMemory(memory: ExtensionFieldMemory): Promise<ExtensionFieldMemory>;
  getProfileEnrichment(userId: string): Promise<StoredProfileEnrichment | null>;
  saveProfileEnrichment(enrichment: StoredProfileEnrichment): Promise<StoredProfileEnrichment>;

  // --- Billing & quota ---
  getSubscription(userId: string): Promise<Subscription | null>;
  saveSubscription(sub: Subscription): Promise<Subscription>;
  /** Find a subscription by its Dodo subscription id (webhook reconciliation). */
  getSubscriptionByDodoId(dodoSubscriptionId: string): Promise<Subscription | null>;

  getUsage(userId: string, metric: string, period: string): Promise<UsageCounter | null>;
  /** Atomically add `delta` to the counter and return the new value. */
  incrementUsage(
    userId: string,
    metric: string,
    period: string,
    delta: number,
  ): Promise<UsageCounter>;
}

let cached: JobpalStore | null = null;

export async function getStore(): Promise<JobpalStore> {
  if (cached) return cached;
  if (isSupabaseConfigured) {
    const { SupabaseStore } = await import("./supabase-store");
    cached = new SupabaseStore();
  } else {
    const { LocalStore } = await import("./local-store");
    cached = new LocalStore();
  }
  return cached;
}
