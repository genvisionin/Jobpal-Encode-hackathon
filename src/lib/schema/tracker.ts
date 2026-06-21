/**
 * tracker.ts — schemas for the Gmail-powered application tracker.
 *
 * `emailClassification` is the structured output the LLM returns for a single
 * email. The deterministic linker (lib/tracker/linker.ts) turns a stream of
 * these into de-duplicated applications with a moving status.
 */

import { z } from "zod";
import { llmString, llmBoolean, llmNumber } from "./helpers";

/** What an email represents in the application lifecycle. */
export const emailKindSchema = z.enum([
  "application_confirmation", // "Thanks for applying…"
  "assessment", // take-home / online test invite
  "interview_invite", // schedule / attend an interview
  "interview_update", // reschedule, next round, etc.
  "offer", // offer extended
  "rejection", // not moving forward
  "recruiter_outreach", // inbound recruiter / sourcing
  "other_job", // job-related but no status change
  "not_job", // unrelated to a job search
]);
export type EmailKind = z.infer<typeof emailKindSchema>;

/** Stage index: 0 Applied · 1 In review · 2 Interview · 3 Decision. */
export const stageSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);

export const applicationOutcomeSchema = z.enum(["offer", "rejected"]).nullable();

/** The LLM's structured read of one email. */
export const emailClassificationSchema = z.object({
  isJobRelated: llmBoolean(false),
  kind: emailKindSchema.catch("not_job").default("not_job"),
  company: llmString(),
  role: llmString(),
  /** Suggested lifecycle stage this email implies. */
  stage: z.preprocess((v) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(3, Math.max(0, Math.round(n))) : 0;
  }, stageSchema).default(0),
  outcome: z
    .union([z.enum(["offer", "rejected"]), z.null(), z.literal("")])
    .optional()
    .transform((v) => (v === "offer" || v === "rejected" ? v : null)),
  /** True when the user must act (e.g. confirm an interview slot). */
  needsAction: llmBoolean(false),
  /** One-line, human summary of what changed / is needed. */
  actionSummary: llmString(),
  /** ISO date the relevant event is for (interview date, offer deadline…). */
  eventDate: llmString(),
  /** 0–1 confidence this is a genuine job-application email. */
  confidence: llmNumber(0, 0, 1),
});
export type EmailClassification = z.infer<typeof emailClassificationSchema>;

/** A raw email handed to the classifier. */
export interface EmailMessage {
  id: string; // provider message id (idempotency key)
  threadId?: string;
  from: string;
  subject: string;
  snippet: string;
  /** Plain-text body (may be truncated). */
  body: string;
  receivedAt: string; // ISO
}
