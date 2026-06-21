/**
 * job.ts — schemas for a parsed job description and the tailoring result.
 *
 * The tailoring result includes an archetype, a weighted multi-dimensional
 * fit breakdown, a requirement-by-requirement match analysis with gap
 * mitigation, and a section-level customization plan (before → after → why).
 *
 * Fields use the lenient LLM helpers so null/missing values from the model
 * coerce to safe defaults instead of failing validation. New fields are all
 * defaulted, so tailored CVs stored before this upgrade still parse.
 */

import { z } from "zod";
import { resumeSchema } from "./resume";
import { llmString, llmStringArray, llmNumber, llmBoolean } from "./helpers";

/** A structured job description, however it was sourced (pasted text or URL). */
export const jobDescriptionSchema = z.object({
  company: llmString(),
  role: llmString(),
  location: llmString(),
  /** Work arrangement if stated. */
  arrangement: llmString(),
  salary: llmString(),
  /**
   * Role archetype/family detected from the JD, e.g.
   * "Backend Engineer", "Product Designer", "Forward-Deployed Engineer".
   * Drives which proof points to surface and how the summary is framed.
   */
  archetype: llmString(),
  seniority: llmString(),
  /** The cleaned, full job description text used for tailoring. */
  rawText: llmString(),
  /** Key responsibilities pulled from the JD. */
  responsibilities: llmStringArray(),
  /** Required/nice-to-have qualifications. */
  requirements: llmStringArray(),
  /** 15-20 ATS keywords extracted from the JD (per reference strategy). */
  keywords: llmStringArray(),
  /** Source URL when the JD came from a link. */
  sourceUrl: llmString(),
});

export type JobDescription = z.infer<typeof jobDescriptionSchema>;

/** Per-keyword coverage in the tailored resume. */
export const keywordCoverageSchema = z.object({
  keyword: llmString(),
  matched: llmBoolean(),
});

/**
 * One dimension of the fit score (adapted to a CV-tailoring context where
 * only the CV + JD are available). `matchScore` is the weighted blend of these.
 */
export const fitDimensionSchema = z.object({
  /** e.g. "Skills match", "Experience relevance", "Keyword / ATS coverage", "Seniority fit". */
  label: llmString(),
  /** 0–100 for this dimension. */
  score: llmNumber(0, 0, 100),
  /** Relative weight 0–1 (the dimensions sum to ~1). */
  weight: llmNumber(0, 0, 1),
  /** One short, honest sentence explaining the score. */
  note: llmString(),
});

/**
 * Each JD requirement mapped to CV evidence, with a status and (for gaps)
 * a concrete mitigation strategy.
 */
export const requirementMatchSchema = z.object({
  requirement: llmString(),
  /** strong = clearly evidenced · partial = adjacent/implied · gap = not present. */
  status: z.enum(["strong", "partial", "gap"]).catch("partial"),
  /** The CV line/area that supports it (verbatim-ish), or "" for a gap. */
  evidence: llmString(),
  /** For partial/gap: how to bridge it honestly (adjacent experience, framing, a quick project). */
  mitigation: llmString(),
});

/**
 * The customization plan. One row per concrete edit made to the resume:
 * which section, what it said, what it now says, and why.
 */
export const customizationChangeSchema = z.object({
  /** e.g. "Professional Summary", "Experience — Acme Corp", "Skills". */
  section: llmString(),
  before: llmString(),
  after: llmString(),
  why: llmString(),
});

/**
 * The full output of a tailoring run: the rewritten resume plus the
 * insight-panel data (archetype, weighted score breakdown, requirement match
 * analysis, customization plan, plain-language change list, keyword coverage).
 */
export const tailorResultSchema = z.object({
  resume: resumeSchema,
  /** Detected role archetype (echoed from / refined against the JD). */
  archetype: llmString(),
  /** One sentence on why this archetype + how it shaped the tailoring. */
  archetypeRationale: llmString(),
  /** Global 0–100 fit, the weighted blend of `scoreBreakdown`. */
  matchScore: llmNumber(0, 0, 100),
  /** Weighted per-dimension fit breakdown. */
  scoreBreakdown: z.array(fitDimensionSchema).default([]),
  /** Requirement-by-requirement match analysis with gap mitigation. */
  requirementMatches: z.array(requirementMatchSchema).default([]),
  /** Section-level before → after → why edits. */
  customizationPlan: z.array(customizationChangeSchema).default([]),
  /** Human-readable summary of edits made (the "what we changed" list). */
  changes: llmStringArray(),
  keywordCoverage: z.array(keywordCoverageSchema).default([]),
});

export type KeywordCoverage = z.infer<typeof keywordCoverageSchema>;
export type FitDimension = z.infer<typeof fitDimensionSchema>;
export type RequirementMatch = z.infer<typeof requirementMatchSchema>;
export type CustomizationChange = z.infer<typeof customizationChangeSchema>;
export type TailorResult = z.infer<typeof tailorResultSchema>;
