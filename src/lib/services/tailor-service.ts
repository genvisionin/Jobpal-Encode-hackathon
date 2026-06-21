/**
 * tailor-service.ts — orchestrates the Customize CV flow, scoped to a user.
 *
 * Flow: resolve the JD (pasted text or scraped from a URL) → parse it →
 * load the user's base profile → tailor the resume to the JD → persist the
 * result as a named tailored CV. Every function takes an explicit `userId`.
 */

import { randomUUID } from "crypto";
import { parseJD, tailorResume, generateCoverLetter, type LLMSource } from "@/lib/llm";
import { scrapeJobDescription } from "@/lib/parsing/scrape-jd";
import { getStore } from "@/lib/db/store";
import { getProfile } from "./profile-service";
import { DEFAULT_TEMPLATE_ID } from "@/lib/templates";
import { assertCanTailor, recordTailoredCV } from "@/lib/billing/service";
import type { StoredTailoredCV } from "@/lib/db/types";

export class NoProfileError extends Error {}
export class EmptyInputError extends Error {}

export interface TailorInput {
  /** Either pasted JD text or a job link. */
  mode: "text" | "url";
  value: string;
  templateId?: string;
  createCoverLetter?: boolean;
}

export interface TailorOutput {
  cv: StoredTailoredCV;
  sources: { jd: LLMSource; tailor: LLMSource; coverLetter?: LLMSource };
}

export async function customizeCV(input: TailorInput, userId: string): Promise<TailorOutput> {
  const value = input.value?.trim();
  if (!value) throw new EmptyInputError("Paste a job description or a job link to continue.");

  // Quota gate FIRST — fail fast before spending an LLM call. Throws
  // QuotaExceededError (handled by the route) when the monthly allowance is
  // used up. Quota is only consumed after a successful generation below.
  await assertCanTailor(userId);

  const store = await getStore();
  const profile = await getProfile(userId);
  if (!profile) {
    throw new NoProfileError("Upload or build your base profile first, then tailor to a job.");
  }

  // 1. Resolve the JD text + source URL.
  let jdText = value;
  let sourceUrl = "";
  if (input.mode === "url") {
    const scraped = await scrapeJobDescription(value);
    jdText = scraped.text;
    sourceUrl = value;
  }

  // 2. Structure the JD.
  const { data: jd, source: jdSource } = await parseJD(jdText, sourceUrl);

  // 3. Tailor the base resume to the JD, grounded in the profile's derived
  //    career intelligence (archetypes + proof points) when available.
  const { data: tailored, source: tailorSource } = await tailorResume(
    profile.resume,
    jd,
    profile.insights,
  );

  // 4. Persist as a named tailored CV.
  const now = new Date().toISOString();
  const cv: StoredTailoredCV = {
    id: randomUUID(),
    userId,
    company: jd.company || "Untitled",
    role: jd.role || "Tailored Resume",
    templateId: input.templateId || DEFAULT_TEMPLATE_ID,
    resume: tailored.resume,
    job: jd,
    archetype: tailored.archetype,
    archetypeRationale: tailored.archetypeRationale,
    matchScore: tailored.matchScore,
    scoreBreakdown: tailored.scoreBreakdown,
    requirementMatches: tailored.requirementMatches,
    customizationPlan: tailored.customizationPlan,
    changes: tailored.changes,
    keywordCoverage: tailored.keywordCoverage,
    createdAt: now,
  };

  let coverLetterSource: LLMSource | undefined;
  if (input.createCoverLetter) {
    const generated = await generateCoverLetter({
      tailoredResume: cv.resume,
      job: cv.job,
      insights: profile.insights,
      requirementMatches: cv.requirementMatches,
      customizationPlan: cv.customizationPlan,
    });
    cv.coverLetter = generated.data;
    coverLetterSource = generated.source;
  }

  await store.saveTailoredCV(cv);

  // Consume one unit of monthly quota now that generation succeeded. A failed
  // generation (exception above) never counts against the user's allowance.
  await recordTailoredCV(userId);

  return { cv, sources: { jd: jdSource, tailor: tailorSource, coverLetter: coverLetterSource } };
}

export async function listTailoredCVs(userId: string) {
  const store = await getStore();
  return store.listTailoredCVs(userId);
}

export async function getTailoredCV(id: string, userId: string) {
  const store = await getStore();
  return store.getTailoredCV(userId, id);
}

export async function setTemplate(
  id: string,
  templateId: string,
  userId: string,
): Promise<StoredTailoredCV | null> {
  const store = await getStore();
  const cv = await store.getTailoredCV(userId, id);
  if (!cv) return null;
  cv.templateId = templateId;
  return store.saveTailoredCV(cv);
}

export async function createCoverLetterForCV(
  id: string,
  userId: string,
): Promise<{ cv: StoredTailoredCV; source: LLMSource }> {
  const store = await getStore();
  const cv = await store.getTailoredCV(userId, id);
  if (!cv) {
    throw new Error("CV not found.");
  }
  const profile = await getProfile(userId);
  if (!profile) {
    throw new NoProfileError("Upload or build your base profile first.");
  }

  const { data, source } = await generateCoverLetter({
    tailoredResume: cv.resume,
    job: cv.job,
    insights: profile.insights,
    requirementMatches: cv.requirementMatches,
    customizationPlan: cv.customizationPlan,
  });

  cv.coverLetter = data;
  await store.saveTailoredCV(cv);
  return { cv, source };
}
