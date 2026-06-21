/**
 * local-store.ts — a zero-config JSON file store under `.data/`.
 *
 * Used when Supabase isn't configured so the full flow works locally. Not
 * for production — it's a single-process, file-backed stand-in that mirrors
 * the Supabase store's behaviour.
 */

import { promises as fs } from "fs";
import path from "path";
import type { JobpalStore } from "./store";
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

const DATA_DIR = path.join(process.cwd(), ".data");
const PROFILES = path.join(DATA_DIR, "profiles.json");
const CVS = path.join(DATA_DIR, "tailored-cvs.json");
const CONNECTIONS = path.join(DATA_DIR, "tracker-connections.json");
const APPLICATIONS = path.join(DATA_DIR, "tracked-applications.json");
const EVENTS = path.join(DATA_DIR, "email-events.json");
const INTERVIEW_PREPS = path.join(DATA_DIR, "interview-preps.json");
const EXT_AUTH_CODES = path.join(DATA_DIR, "extension-auth-codes.json");
const EXT_SESSIONS = path.join(DATA_DIR, "extension-sessions.json");
const EXT_FIELD_MEMORIES = path.join(DATA_DIR, "extension-field-memories.json");
const PROFILE_ENRICHMENTS = path.join(DATA_DIR, "profile-enrichments.json");
const SUBSCRIPTIONS = path.join(DATA_DIR, "subscriptions.json");
const USAGE = path.join(DATA_DIR, "usage-counters.json");
const locks = new Map<string, Promise<void>>();

async function readJSON<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

async function writeJSON(file: string, data: unknown): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf-8");
}

async function withFileLock<T>(file: string, fn: () => Promise<T>): Promise<T> {
  const previous = locks.get(file) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.catch(() => undefined).then(() => current);
  locks.set(file, tail);
  await previous.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
    if (locks.get(file) === tail) locks.delete(file);
  }
}

async function updateJSON<T, R>(
  file: string,
  fallback: T,
  mutate: (data: T) => { next: T; result: R } | Promise<{ next: T; result: R }>,
): Promise<R> {
  return withFileLock(file, async () => {
    const data = await readJSON<T>(file, fallback);
    const { next, result } = await mutate(data);
    await writeJSON(file, next);
    return result;
  });
}

export class LocalStore implements JobpalStore {
  async getProfile(userId: string): Promise<StoredProfile | null> {
    const all = await readJSON<Record<string, StoredProfile>>(PROFILES, {});
    return all[userId] ?? null;
  }

  async saveProfile(profile: StoredProfile): Promise<StoredProfile> {
    return updateJSON<Record<string, StoredProfile>, StoredProfile>(PROFILES, {}, (all) => {
      all[profile.userId] = profile;
      return { next: all, result: profile };
    });
  }

  async listTailoredCVs(userId: string): Promise<StoredTailoredCV[]> {
    const all = await readJSON<StoredTailoredCV[]>(CVS, []);
    return all
      .filter((cv) => cv.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getTailoredCV(userId: string, id: string): Promise<StoredTailoredCV | null> {
    const all = await readJSON<StoredTailoredCV[]>(CVS, []);
    return all.find((cv) => cv.userId === userId && cv.id === id) ?? null;
  }

  async saveTailoredCV(cv: StoredTailoredCV): Promise<StoredTailoredCV> {
    return updateJSON<StoredTailoredCV[], StoredTailoredCV>(CVS, [], (all) => {
      const idx = all.findIndex((c) => c.id === cv.id);
      if (idx >= 0) all[idx] = cv;
      else all.unshift(cv);
      return { next: all, result: cv };
    });
  }

  // --- Gmail tracker ---

  async getConnection(userId: string): Promise<TrackerConnection | null> {
    const all = await readJSON<Record<string, TrackerConnection>>(CONNECTIONS, {});
    return all[userId] ?? null;
  }

  async saveConnection(conn: TrackerConnection): Promise<TrackerConnection> {
    return updateJSON<Record<string, TrackerConnection>, TrackerConnection>(
      CONNECTIONS,
      {},
      (all) => {
        all[conn.userId] = conn;
        return { next: all, result: conn };
      },
    );
  }

  async deleteConnection(userId: string): Promise<void> {
    await updateJSON<Record<string, TrackerConnection>, void>(CONNECTIONS, {}, (all) => {
      delete all[userId];
      return { next: all, result: undefined };
    });
    // Also clear the user's applications + events on disconnect.
    await updateJSON<TrackedApplication[], void>(APPLICATIONS, [], (all) => ({
      next: all.filter((a) => a.userId !== userId),
      result: undefined,
    }));
    await updateJSON<EmailEvent[], void>(EVENTS, [], (all) => ({
      next: all.filter((e) => e.userId !== userId),
      result: undefined,
    }));
    await updateJSON<StoredInterviewPrep[], void>(INTERVIEW_PREPS, [], (all) => ({
      next: all.filter((p) => p.userId !== userId),
      result: undefined,
    }));
  }

  async listConnectedUserIds(): Promise<string[]> {
    const all = await readJSON<Record<string, TrackerConnection>>(CONNECTIONS, {});
    return Object.values(all)
      .filter((c) => c.status === "connected")
      .map((c) => c.userId);
  }

  async listApplications(userId: string): Promise<TrackedApplication[]> {
    const all = await readJSON<TrackedApplication[]>(APPLICATIONS, []);
    return all
      .filter((a) => a.userId === userId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getApplication(userId: string, id: string): Promise<TrackedApplication | null> {
    const all = await readJSON<TrackedApplication[]>(APPLICATIONS, []);
    return all.find((a) => a.userId === userId && a.id === id) ?? null;
  }

  async saveApplication(app: TrackedApplication): Promise<TrackedApplication> {
    return updateJSON<TrackedApplication[], TrackedApplication>(APPLICATIONS, [], (all) => {
      const idx = all.findIndex((a) => a.id === app.id);
      if (idx >= 0) all[idx] = app;
      else all.push(app);
      return { next: all, result: app };
    });
  }

  async hasEmailEvent(userId: string, emailId: string): Promise<boolean> {
    const all = await readJSON<EmailEvent[]>(EVENTS, []);
    return all.some((e) => e.userId === userId && e.id === emailId);
  }

  async saveEmailEvent(event: EmailEvent): Promise<EmailEvent> {
    return updateJSON<EmailEvent[], EmailEvent>(EVENTS, [], (all) => {
      const idx = all.findIndex((e) => e.id === event.id && e.userId === event.userId);
      if (idx >= 0) all[idx] = event;
      else all.push(event);
      return { next: all, result: event };
    });
  }

  async listEmailEvents(userId: string): Promise<EmailEvent[]> {
    const all = await readJSON<EmailEvent[]>(EVENTS, []);
    return all
      .filter((e) => e.userId === userId)
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  }

  async listEmailEventsForApplication(userId: string, applicationId: string): Promise<EmailEvent[]> {
    const all = await readJSON<EmailEvent[]>(EVENTS, []);
    return all
      .filter((e) => e.userId === userId && e.applicationId === applicationId)
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  }

  // --- Interview prep ---

  async getInterviewPrep(
    userId: string,
    applicationId: string,
  ): Promise<StoredInterviewPrep | null> {
    const all = await readJSON<StoredInterviewPrep[]>(INTERVIEW_PREPS, []);
    return all.find((p) => p.userId === userId && p.applicationId === applicationId) ?? null;
  }

  async saveInterviewPrep(prep: StoredInterviewPrep): Promise<StoredInterviewPrep> {
    return updateJSON<StoredInterviewPrep[], StoredInterviewPrep>(INTERVIEW_PREPS, [], (all) => {
      const idx = all.findIndex(
        (p) => p.userId === prep.userId && p.applicationId === prep.applicationId,
      );
      if (idx >= 0) all[idx] = prep;
      else all.push(prep);
      return { next: all, result: prep };
    });
  }

  // --- Chrome extension auth ---

  async saveExtensionAuthCode(code: ExtensionAuthCode): Promise<ExtensionAuthCode> {
    return updateJSON<ExtensionAuthCode[], ExtensionAuthCode>(EXT_AUTH_CODES, [], (all) => {
      const idx = all.findIndex((c) => c.codeHash === code.codeHash);
      if (idx >= 0) all[idx] = code;
      else all.push(code);
      return { next: all, result: code };
    });
  }

  async getExtensionAuthCode(codeHash: string): Promise<ExtensionAuthCode | null> {
    const all = await readJSON<ExtensionAuthCode[]>(EXT_AUTH_CODES, []);
    return all.find((c) => c.codeHash === codeHash) ?? null;
  }

  async markExtensionAuthCodeUsed(codeHash: string, usedAt: string): Promise<void> {
    await updateJSON<ExtensionAuthCode[], void>(EXT_AUTH_CODES, [], (all) => {
      const idx = all.findIndex((c) => c.codeHash === codeHash);
      if (idx >= 0) all[idx] = { ...all[idx], usedAt };
      return { next: all, result: undefined };
    });
  }

  async saveExtensionSession(session: ExtensionSession): Promise<ExtensionSession> {
    return updateJSON<ExtensionSession[], ExtensionSession>(EXT_SESSIONS, [], (all) => {
      const idx = all.findIndex((s) => s.id === session.id);
      if (idx >= 0) all[idx] = session;
      else all.push(session);
      return { next: all, result: session };
    });
  }

  async getExtensionSessionByAccessHash(accessTokenHash: string): Promise<ExtensionSession | null> {
    const all = await readJSON<ExtensionSession[]>(EXT_SESSIONS, []);
    return all.find((s) => s.accessTokenHash === accessTokenHash) ?? null;
  }

  async getExtensionSessionByRefreshHash(refreshTokenHash: string): Promise<ExtensionSession | null> {
    const all = await readJSON<ExtensionSession[]>(EXT_SESSIONS, []);
    return all.find((s) => s.refreshTokenHash === refreshTokenHash) ?? null;
  }

  async revokeExtensionSession(id: string, revokedAt: string): Promise<void> {
    await updateJSON<ExtensionSession[], void>(EXT_SESSIONS, [], (all) => {
      const idx = all.findIndex((s) => s.id === id);
      if (idx >= 0) all[idx] = { ...all[idx], revokedAt, lastUsedAt: revokedAt };
      return { next: all, result: undefined };
    });
  }

  async listExtensionFieldMemories(userId: string): Promise<ExtensionFieldMemory[]> {
    const all = await readJSON<ExtensionFieldMemory[]>(EXT_FIELD_MEMORIES, []);
    return all
      .filter((memory) => memory.userId === userId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async upsertExtensionFieldMemory(memory: ExtensionFieldMemory): Promise<ExtensionFieldMemory> {
    return updateJSON<ExtensionFieldMemory[], ExtensionFieldMemory>(EXT_FIELD_MEMORIES, [], (all) => {
      const idx = all.findIndex(
        (item) => item.userId === memory.userId && item.questionKey === memory.questionKey,
      );
      if (idx >= 0) all[idx] = memory;
      else all.push(memory);
      return { next: all, result: memory };
    });
  }

  async getProfileEnrichment(userId: string): Promise<StoredProfileEnrichment | null> {
    const all = await readJSON<Record<string, StoredProfileEnrichment>>(PROFILE_ENRICHMENTS, {});
    return all[userId] ?? null;
  }

  async saveProfileEnrichment(enrichment: StoredProfileEnrichment): Promise<StoredProfileEnrichment> {
    return updateJSON<Record<string, StoredProfileEnrichment>, StoredProfileEnrichment>(
      PROFILE_ENRICHMENTS,
      {},
      (all) => {
        all[enrichment.userId] = enrichment;
        return { next: all, result: enrichment };
      },
    );
  }

  // --- Billing & quota ---

  async getSubscription(userId: string): Promise<Subscription | null> {
    const all = await readJSON<Record<string, Subscription>>(SUBSCRIPTIONS, {});
    return all[userId] ?? null;
  }

  async saveSubscription(sub: Subscription): Promise<Subscription> {
    return updateJSON<Record<string, Subscription>, Subscription>(SUBSCRIPTIONS, {}, (all) => {
      all[sub.userId] = sub;
      return { next: all, result: sub };
    });
  }

  async getSubscriptionByDodoId(dodoSubscriptionId: string): Promise<Subscription | null> {
    const all = await readJSON<Record<string, Subscription>>(SUBSCRIPTIONS, {});
    return (
      Object.values(all).find((s) => s.dodoSubscriptionId === dodoSubscriptionId) ?? null
    );
  }

  async getUsage(
    userId: string,
    metric: string,
    period: string,
  ): Promise<UsageCounter | null> {
    const all = await readJSON<UsageCounter[]>(USAGE, []);
    return (
      all.find((u) => u.userId === userId && u.metric === metric && u.period === period) ?? null
    );
  }

  async incrementUsage(
    userId: string,
    metric: string,
    period: string,
    delta: number,
  ): Promise<UsageCounter> {
    return updateJSON<UsageCounter[], UsageCounter>(USAGE, [], (all) => {
      const idx = all.findIndex(
        (u) => u.userId === userId && u.metric === metric && u.period === period,
      );
      const now = new Date().toISOString();
      if (idx >= 0) {
        all[idx] = { ...all[idx], count: Math.max(0, all[idx].count + delta), updatedAt: now };
        return { next: all, result: all[idx] };
      }
      const created: UsageCounter = {
        userId,
        metric,
        period,
        count: Math.max(0, delta),
        updatedAt: now,
      };
      all.push(created);
      return { next: all, result: created };
    });
  }
}
