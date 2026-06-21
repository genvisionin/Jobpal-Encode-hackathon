/**
 * interview-prep-service.ts — orchestrates the interview prep pack, scoped to
 * a user.
 *
 * Flow: resolve the tracked application → load the user's base resume +
 * derived career intelligence → opportunistically pull JD context from a
 * tailored CV the user already generated for this same company/role → run the
 * deep-research LLM pass → persist + return the brief.
 *
 * The pack is cached per application (1:1). `getOrCreate` returns the existing
 * pack if present; `regenerate` always rebuilds. Every function takes an
 * explicit `userId` (resolved from the session by the route).
 */

import { randomUUID } from "crypto";
import { generateInterviewPrep } from "@/lib/llm";
import { getStore } from "@/lib/db/store";
import { getProfile } from "./profile-service";
import { companyKey, roleSimilarity } from "@/lib/tracker/linker";
import {
  researchCompany,
  discoverJobPosting,
  findingsToPromptBlock,
} from "@/lib/tracker/company-research";
import type {
  StoredInterviewPrep,
  TrackedApplication,
  StoredTailoredCV,
  EmailEvent,
} from "@/lib/db/types";

export class NoProfileError extends Error {}
export class ApplicationNotFoundError extends Error {}

/** Find a tailored CV the user already made for this same company/role, if any. */
function findJobContext(
  app: TrackedApplication,
  cvs: StoredTailoredCV[],
): StoredTailoredCV | null {
  const key = app.companyKey || companyKey(app.company);
  const sameCompany = cvs.filter((cv) => companyKey(cv.company) === key);
  if (sameCompany.length === 0) return null;
  // Prefer the closest role match; ties broken by most recent.
  return (
    [...sameCompany]
      .sort(
        (a, b) =>
          roleSimilarity(app.role, b.role) - roleSimilarity(app.role, a.role) ||
          b.createdAt.localeCompare(a.createdAt),
      )[0] ?? null
  );
}

/**
 * Pull a job-code / requisition-id hint from the application's own emails to
 * sharpen the reverse JD search. Recruiters routinely stamp postings with codes
 * like "R-12345", "REQ12345", "JR0099", "#4821" — when one shows up in a linked
 * email it's the single best disambiguator for the exact posting.
 */
function extractJobCodeHint(events: EmailEvent[]): string | undefined {
  for (const e of events) {
    const text = `${e.summary ?? ""} ${e.role ?? ""}`;
    const m = text.match(/\b((?:REQ|JR|R|JOB|ID)[-\s#]?\d{3,7})\b/i);
    if (m) return m[1].replace(/\s+/g, "");
    const m2 = text.match(/#\s?(\d{4,7})\b/);
    if (m2) return m2[1];
  }
  return undefined;
}

async function buildPrep(
  app: TrackedApplication,
  userId: string,
): Promise<StoredInterviewPrep> {
  const store = await getStore();

  const profile = await getProfile(userId);
  if (!profile) {
    throw new NoProfileError(
      "Add your resume first — we use it to ground your prep in your real experience.",
    );
  }

  // Opportunistically reuse JD context from a tailored CV for this role.
  const cvs = await store.listTailoredCVs(userId);
  const ctx = findJobContext(app, cvs);

  // If we don't already have a tailored-CV job context, reverse-search the open
  // web for the REAL posting. Seed it with what the email gave us — the exact
  // role + company — plus any job/requisition code we can lift from the linked
  // emails to pin down the exact posting.
  let codeHint: string | undefined;
  if (!ctx) {
    const events = await store.listEmailEvents(userId).catch(() => [] as EmailEvent[]);
    const mine = events.filter((e) => e.applicationId === app.id);
    codeHint = extractJobCodeHint(mine.length ? mine : events);
  }

  // Real web grounding — search where candidates actually talk (Glassdoor,
  // Reddit, Blind, Levels.fyi, LeetCode discuss) + company news. Best-effort:
  // never throws, returns sparse findings if nothing comes back.
  //
  // In parallel (when no tailored-CV context exists) go find the REAL posting
  // for this exact company + role on the live web and scrape its full JD text.
  // This is what keeps the prep specific to the actual job instead of a generic
  // read of the title.
  const [findings, discovered] = await Promise.all([
    researchCompany(app.company, app.role).catch(() => null),
    ctx
      ? Promise.resolve(null)
      : discoverJobPosting(app.company, app.role, codeHint).catch(() => null),
  ]);

  // Build the JD context handed to the model: prefer the structured tailored-CV
  // context (richest), else the freshly discovered posting's raw text.
  const jd = ctx
    ? {
        archetype: ctx.archetype,
        seniority: ctx.job?.seniority,
        responsibilities: ctx.job?.responsibilities,
        requirements: ctx.job?.requirements,
        keywords: ctx.job?.keywords,
        rawText: ctx.job?.rawText,
        sourceUrl: ctx.job?.sourceUrl,
      }
    : discovered
      ? {
          rawText: discovered.text,
          role: discovered.role,
          location: discovered.location,
          sourceUrl: discovered.url,
        }
      : null;

  const stageHint =
    app.stage >= 2 ? "Interview stage reached" : app.needsAction ? "Action needed" : undefined;

  const { data: prep, source } = await generateInterviewPrep({
    company: app.company,
    role: app.role,
    stageHint: app.actionSummary || stageHint,
    resume: profile.resume,
    insights: profile.insights,
    research: findings ? findingsToPromptBlock(findings) : null,
    researchFound: findings ? !findings.sparse : false,
    sources: findings?.sources ?? [],
    jd,
  });

  const now = new Date().toISOString();
  const existing = await store.getInterviewPrep(userId, app.id);
  const record: StoredInterviewPrep = {
    id: existing?.id ?? app.id,
    userId,
    applicationId: app.id,
    company: app.company,
    role: app.role,
    prep,
    source,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await store.saveInterviewPrep(record);
  return record;
}

/** Resolve a tracked application for this user by id. */
async function getApplication(
  applicationId: string,
  userId: string,
): Promise<TrackedApplication> {
  const store = await getStore();
  const apps = await store.listApplications(userId);
  const app = apps.find((a) => a.id === applicationId);
  if (!app) throw new ApplicationNotFoundError("Application not found.");
  return app;
}

/** Get the stored prep pack for an application, or null if none generated yet. */
export async function getInterviewPrep(
  applicationId: string,
  userId: string,
): Promise<StoredInterviewPrep | null> {
  const store = await getStore();
  return store.getInterviewPrep(userId, applicationId);
}

/** Return the existing prep pack, generating it on first request. */
export async function getOrCreateInterviewPrep(
  applicationId: string,
  userId: string,
): Promise<StoredInterviewPrep> {
  const store = await getStore();
  const existing = await store.getInterviewPrep(userId, applicationId);
  if (existing) return existing;
  const app = await getApplication(applicationId, userId);
  return buildPrep(app, userId);
}

/** Force a fresh prep pack (overwrites any cached one). */
export async function regenerateInterviewPrep(
  applicationId: string,
  userId: string,
): Promise<StoredInterviewPrep> {
  const app = await getApplication(applicationId, userId);
  return buildPrep(app, userId);
}
