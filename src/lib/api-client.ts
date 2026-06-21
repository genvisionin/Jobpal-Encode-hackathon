/**
 * api-client.ts — typed fetch helpers for the browser.
 *
 * Thin wrappers around the API routes so client components don't hand-roll
 * fetch calls. All return parsed JSON and throw `ApiError` on failure.
 */

import type { StoredProfile, StoredProfileEnrichment, StoredTailoredCV } from "@/lib/db/types";
import type { ResumeData } from "@/lib/schema";

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function handle<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(
      (data as { error?: string }).error ?? "Request failed",
      res.status,
      (data as { code?: string }).code,
    );
  }
  return data as T;
}

export async function uploadResume(file: File): Promise<{ profile: StoredProfile; source: string }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/profile/upload", { method: "POST", body: form });
  return handle(res);
}

export async function getProfile(): Promise<{ profile: StoredProfile | null }> {
  return handle(await fetch("/api/profile"));
}

export async function saveProfile(resume: ResumeData): Promise<{ profile: StoredProfile }> {
  const res = await fetch("/api/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resume }),
  });
  return handle(res);
}

export type ProfileEnrichmentPayload = Pick<
  StoredProfileEnrichment,
  "facts" | "sensitiveFacts"
>;

export async function getProfileEnrichment(): Promise<{
  enrichment: StoredProfileEnrichment | null;
  capturedCount: number;
}> {
  return handle(await fetch("/api/profile/enrichment"));
}

export async function saveProfileEnrichment(
  input: ProfileEnrichmentPayload,
): Promise<{ enrichment: StoredProfileEnrichment; capturedCount: number }> {
  const res = await fetch("/api/profile/enrichment", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return handle(res);
}

export async function customize(input: {
  mode: "text" | "url";
  value: string;
  templateId?: string;
  createCoverLetter?: boolean;
}): Promise<{ cv: StoredTailoredCV; sources: { jd: string; tailor: string; coverLetter?: string } }> {
  const res = await fetch("/api/customize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return handle(res);
}

export async function listCVs(): Promise<{ cvs: StoredTailoredCV[] }> {
  return handle(await fetch("/api/cv"));
}

export async function getCV(id: string): Promise<{ cv: StoredTailoredCV }> {
  return handle(await fetch(`/api/cv/${id}`));
}

export async function changeTemplate(id: string, templateId: string): Promise<{ cv: StoredTailoredCV }> {
  const res = await fetch(`/api/cv/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ templateId }),
  });
  return handle(res);
}

export async function generateCoverLetterForCV(
  id: string,
): Promise<{ cv: StoredTailoredCV; source: string }> {
  const res = await fetch(`/api/cv/${id}/cover-letter`, { method: "POST" });
  return handle(res);
}

import type { JobSearchFilters, JobSearchResult } from "@/lib/jobs/types";

export async function searchJobs(filters: Partial<JobSearchFilters>): Promise<JobSearchResult> {
  const res = await fetch("/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(filters),
  });
  return handle(res);
}

import type { EmailEvent, TrackedApplication } from "@/lib/db/types";
import type { TrackerStatus, TrackerStats, SyncSummary } from "@/lib/tracker";

export interface TrackerSnapshot {
  status: TrackerStatus;
  applications: TrackedApplication[];
  stats: TrackerStats | null;
}

export async function getTracker(): Promise<TrackerSnapshot> {
  return handle(await fetch("/api/tracker"));
}

export async function connectTracker(): Promise<{ mode: "oauth"; authUrl: string }> {
  const res = await fetch("/api/tracker/connect", { method: "POST" });
  return handle(res);
}

export async function syncTracker(): Promise<{
  summary: SyncSummary;
  applications: TrackedApplication[];
  stats: TrackerStats;
}> {
  const res = await fetch("/api/tracker/sync", { method: "POST" });
  return handle(res);
}

export async function disconnectTracker(): Promise<{ ok: boolean }> {
  return handle(await fetch("/api/tracker", { method: "DELETE" }));
}

export type TrackerApplicationInput = {
  company: string;
  role: string;
  stage: 0 | 1 | 2 | 3;
  outcome: "offer" | "rejected" | null;
  needsAction: boolean;
  actionSummary?: string;
  actionDueAt?: string;
  notes?: string;
  jobUrl?: string;
  contactName?: string;
  contactEmail?: string;
  appliedAt?: string;
};

export async function addTrackerApplication(
  input: TrackerApplicationInput,
): Promise<{ application: TrackedApplication; applications: TrackedApplication[]; stats: TrackerStats }> {
  const res = await fetch("/api/tracker/application", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return handle(res);
}

export async function updateTrackerApplication(
  id: string,
  input: Partial<TrackerApplicationInput>,
): Promise<{ application: TrackedApplication; applications: TrackedApplication[]; stats: TrackerStats }> {
  const res = await fetch(`/api/tracker/application/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return handle(res);
}

export async function getTrackerApplicationDetails(
  id: string,
): Promise<{ application: TrackedApplication; events: EmailEvent[] }> {
  return handle(await fetch(`/api/tracker/application/${encodeURIComponent(id)}`));
}

import type { StoredInterviewPrep } from "@/lib/db/types";

export async function getInterviewPrep(
  applicationId: string,
): Promise<{ prep: StoredInterviewPrep | null }> {
  return handle(
    await fetch(`/api/tracker/prep?applicationId=${encodeURIComponent(applicationId)}`),
  );
}

export async function generateInterviewPrep(
  applicationId: string,
  regenerate = false,
): Promise<{ prep: StoredInterviewPrep }> {
  const res = await fetch("/api/tracker/prep", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ applicationId, regenerate }),
  });
  return handle(res);
}

import type { PlanId, FeatureId } from "@/lib/billing/plans";

export interface BillingStatus {
  planId: PlanId;
  status: "active" | "on_hold" | "cancelled" | "expired" | "failed" | "none";
  quota: number;
  used: number;
  remaining: number;
  canTailor: boolean;
  features: FeatureId[];
  currentPeriodEnd?: string;
  cancelAtPeriodEnd: boolean;
  hasBillingAccount: boolean;
}

export async function getBilling(): Promise<BillingStatus> {
  return handle(await fetch("/api/billing"));
}

export async function startCheckout(
  plan: PlanId,
): Promise<{ checkoutUrl: string; simulated: boolean }> {
  const res = await fetch("/api/billing/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan }),
  });
  return handle(res);
}

export async function openBillingPortal(): Promise<{ portalUrl: string }> {
  return handle(await fetch("/api/billing/portal", { method: "POST" }));
}

export async function saveAccount(contact: {
  name?: string;
  title?: string;
  location?: string;
}): Promise<{ profile: StoredProfile }> {
  const res = await fetch("/api/account", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(contact),
  });
  return handle(res);
}
