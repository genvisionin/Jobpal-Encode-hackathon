/**
 * profile.ts — the derived "career intelligence" layer.
 *
 * Uploading a resume produces not just a structured CV but a derived insights
 * object the tailoring step relies on: the candidate's target archetypes,
 * adaptive framing (what to emphasize per role family), the career narrative
 * that frames summaries, and distilled quantified proof points (the metrics
 * and evidence the model reuses verbatim and must NEVER invent).
 *
 * Derived with a single Azure LLM pass right after parsing, persisted alongside
 * the profile, and fed into every tailoring run. Makes tailoring archetype-aware
 * and grounded in real proof points instead of generic keyword stuffing.
 *
 * Everything is derived ONLY from the resume — no invented metrics, no web
 * research. Fields use the lenient LLM helpers and are all defaulted, so a
 * profile saved before this layer existed still parses (insights just empty).
 */

import { z } from "zod";
import { llmString, llmStringArray } from "./helpers";

/**
 * A role family the candidate is genuinely competitive for, with how to frame
 * them for it — target roles and adaptive framing per archetype.
 */
export const archetypeSchema = z.object({
  /** Short recruiter-style name, e.g. "Backend Engineer", "Technical Product Manager". */
  name: llmString(),
  /** One sentence on why the candidate fits this archetype (evidence-based). */
  rationale: llmString(),
  /** What to emphasize for this archetype (skills/themes to lead with). */
  emphasis: llmStringArray(),
});

/**
 * A distilled, quantified achievement pulled from the resume.
 * These are the real metrics/evidence the tailoring step reuses; it must
 * NEVER invent new ones.
 */
export const proofPointSchema = z.object({
  /** Punchy one-line claim, e.g. "Cut API p95 latency 5x". */
  headline: llmString(),
  /** A sentence of supporting context (what/how), grounded in the resume. */
  detail: llmString(),
  /** The hard numbers backing it, verbatim from the resume (e.g. "2.1s → 380ms"). */
  metrics: llmStringArray(),
  /** Skills/tools this proof point demonstrates. */
  skills: llmStringArray(),
});

/**
 * The full derived layer. Built once per resume version and persisted with the
 * profile; refreshed whenever the base resume changes.
 */
export const profileInsightsSchema = z.object({
  /** One-line positioning statement for the candidate (their "signature move"). */
  headline: llmString(),
  /** 2–3 sentence career through-line / narrative that frames every summary. */
  narrative: llmString(),
  /** Role families the candidate is competitive for (1–4), with framing. */
  archetypes: z.array(archetypeSchema).default([]),
  /** Distilled, quantified proof points (up to ~8), reused verbatim in tailoring. */
  proofPoints: z.array(proofPointSchema).default([]),
  /** Derived signature strengths (short phrases). */
  coreStrengths: llmStringArray(),
  /** The candidate's strongest, most marketable skills (deduped, ranked). */
  keySkills: llmStringArray(),
  /** ISO timestamp the insights were derived (so we can detect staleness). */
  derivedAt: llmString(),
});

export type Archetype = z.infer<typeof archetypeSchema>;
export type ProofPoint = z.infer<typeof proofPointSchema>;
export type ProfileInsights = z.infer<typeof profileInsightsSchema>;

/** An empty, valid insights object — safe default for profiles without one. */
export function emptyProfileInsights(): ProfileInsights {
  return profileInsightsSchema.parse({});
}

/** Whether an insights object actually carries derived content. */
export function hasInsights(insights: ProfileInsights | null | undefined): boolean {
  if (!insights) return false;
  return Boolean(
    insights.headline ||
      insights.narrative ||
      insights.archetypes.length ||
      insights.proofPoints.length,
  );
}
