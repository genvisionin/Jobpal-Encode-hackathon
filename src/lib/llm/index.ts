/**
 * index.ts — high-level LLM services for the Customize CV pipeline.
 *
 * Each function uses Azure AI Foundry when configured, and falls back to the
 * deterministic mock only when Azure is not configured. Output is always
 * validated against the Zod schemas, so downstream code can trust the shape.
 *
 * Important: the production tailoring path must not silently fall back to the
 * mock after an Azure/model/schema failure. A bad mock CV looks like a
 * successful generation to the user, which is worse than surfacing a retryable
 * error.
 */

import { isAzureConfigured } from "@/lib/env";
import {
  resumeSchema,
  jobDescriptionSchema,
  tailorResultSchema,
  profileInsightsSchema,
  interviewPrepSchema,
  coverLetterSchema,
  withSectionIds,
} from "@/lib/schema";
import type {
  ResumeData,
  JobDescription,
  TailorResult,
  ProfileInsights,
  InterviewPrep,
  CoverLetter,
} from "@/lib/schema";
import { chatJSON } from "./client";
import {
  buildParseCVMessages,
  buildParseCVFromFileMessages,
  buildDeriveInsightsMessages,
  buildParseJDMessages,
  buildTailorMessages,
  buildCoverLetterMessages,
  buildInterviewPrepMessages,
} from "./prompts";
import {
  mockParseCV,
  mockParseJD,
  mockTailor,
  mockDeriveInsights,
  mockCoverLetter,
  mockInterviewPrep,
} from "./mock";

/** Where a result came from — surfaced to the UI for transparency. */
export type LLMSource = "azure" | "mock";

export interface WithSource<T> {
  data: T;
  source: LLMSource;
}

async function chatJSONWithRetries<T>(
  label: string,
  messages: ReturnType<typeof buildParseCVMessages>,
  options: Parameters<typeof chatJSON>[1],
  attempts = 2,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await chatJSON<T>(messages, options);
    } catch (err) {
      lastErr = err;
      console.error(`[llm.${label}] Azure attempt ${attempt + 1} failed:`, err);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`${label} failed.`);
}

/* ---------- parse an uploaded CV (from extracted text) ---------- */

export async function parseCV(resumeText: string): Promise<WithSource<ResumeData>> {
  if (isAzureConfigured) {
    // When Azure is configured we DON'T silently fall back to the weak
    // heuristic on failure — that hides real problems and produces a thin
    // profile. We retry once, then surface the error to the caller.
    const raw = await chatJSONWithRetries<unknown>(
      "parseCV",
      buildParseCVMessages(resumeText),
      {
        temperature: 0.1,
        maxTokens: 16000,
        timeoutMs: 90_000,
      },
    );
    return { data: withSectionIds(resumeSchema.parse(raw)), source: "azure" };
  }
  return { data: mockParseCV(resumeText), source: "mock" };
}

/* ---------- parse an uploaded CV (directly from PDF bytes) ---------- */

/**
 * Parse a resume by sending the PDF straight to the multimodal model — far
 * more reliable than text extraction for multi-column / multi-page layouts.
 * `fallbackText` (if provided) is used when Azure isn't configured or the
 * file parse fails.
 */
export async function parseCVFromPDF(
  pdfBase64: string,
  filename: string,
  fallbackText: string,
): Promise<WithSource<ResumeData>> {
  if (isAzureConfigured) {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const raw = await chatJSON<unknown>(
          buildParseCVFromFileMessages(pdfBase64, filename),
          { temperature: 0.1, maxTokens: 16000, timeoutMs: 120_000 },
        );
        return { data: withSectionIds(resumeSchema.parse(raw)), source: "azure" };
      } catch (err) {
        lastErr = err;
        console.error(`[llm.parseCVFromPDF] Azure attempt ${attempt + 1} failed:`, err);
      }
    }
    // Last resort: try the extracted-text path before giving up.
    if (fallbackText && fallbackText.length > 40) {
      try {
        return await parseCV(fallbackText);
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error("CV parsing failed.");
  }
  return { data: mockParseCV(fallbackText), source: "mock" };
}

/* ---------- derive career intelligence from a parsed resume ---------- */

/**
 * Derive the "career intelligence" layer (archetypes + narrative + quantified
 * proof points) from a structured resume. Runs once after parsing and is reused
 * on every tailoring run. Never invents content. In production, failures are
 * surfaced instead of silently saving a weak profile, because this layer is what
 * gives the tailoring step high-quality evidence to inject.
 */
export async function deriveInsights(
  resume: ResumeData,
): Promise<WithSource<ProfileInsights>> {
  const stamp = (insights: ProfileInsights): ProfileInsights => ({
    ...insights,
    derivedAt: insights.derivedAt || new Date().toISOString(),
  });

  if (isAzureConfigured) {
    const raw = await chatJSONWithRetries<unknown>(
      "deriveInsights",
      buildDeriveInsightsMessages(resume),
      {
        temperature: 0.2,
        maxTokens: 4000,
        timeoutMs: 90_000,
      },
    );
    return { data: stamp(profileInsightsSchema.parse(raw)), source: "azure" };
  }
  return { data: stamp(mockDeriveInsights(resume)), source: "mock" };
}

/* ---------- parse a job description ---------- */

export async function parseJD(jdText: string, sourceUrl = ""): Promise<WithSource<JobDescription>> {
  if (isAzureConfigured) {
    const raw = await chatJSONWithRetries<unknown>(
      "parseJD",
      buildParseJDMessages(jdText, sourceUrl),
      {
        temperature: 0.1,
        maxTokens: 5000,
        timeoutMs: 75_000,
      },
    );
    const parsed = jobDescriptionSchema.parse(raw);
    // Ensure we always carry the source URL through.
    if (sourceUrl) parsed.sourceUrl = sourceUrl;
    return { data: parsed, source: "azure" };
  }
  return { data: mockParseJD(jdText, sourceUrl), source: "mock" };
}

/* ---------- tailor a resume to a job ---------- */

export async function tailorResume(
  resume: ResumeData,
  jd: JobDescription,
  insights?: ProfileInsights | null,
): Promise<WithSource<TailorResult>> {
  if (isAzureConfigured) {
    const raw = await chatJSONWithRetries<unknown>(
      "tailorResume",
      buildTailorMessages(resume, jd, insights),
      {
        temperature: 0.25,
        maxTokens: 16000,
        timeoutMs: 120_000,
      },
    );
    const result = tailorResultSchema.parse(raw);
    result.resume = withSectionIds(result.resume);
    return { data: result, source: "azure" };
  }
  return { data: mockTailor(resume, jd, insights), source: "mock" };
}

/* ---------- generate a cover letter for a tailored CV ---------- */

export async function generateCoverLetter(input: {
  tailoredResume: ResumeData;
  job: JobDescription;
  insights?: ProfileInsights | null;
  requirementMatches?: TailorResult["requirementMatches"];
  customizationPlan?: TailorResult["customizationPlan"];
}): Promise<WithSource<CoverLetter>> {
  const stamp = (letter: CoverLetter): CoverLetter => ({
    ...letter,
    company: letter.company || input.job.company,
    role: letter.role || input.job.role,
    signature: letter.signature || input.tailoredResume.contact.name,
    generatedAt: letter.generatedAt || new Date().toISOString(),
  });

  if (isAzureConfigured) {
    const raw = await chatJSONWithRetries<unknown>(
      "generateCoverLetter",
      buildCoverLetterMessages(input),
      {
        temperature: 0.35,
        maxTokens: 5000,
        timeoutMs: 90_000,
      },
    );
    return { data: stamp(coverLetterSchema.parse(raw)), source: "azure" };
  }
  return { data: stamp(mockCoverLetter(input)), source: "mock" };
}

/* ---------- generate an interview prep pack ---------- */

export interface InterviewPrepInput {
  company: string;
  role: string;
  stageHint?: string;
  eventDate?: string;
  resume: ResumeData;
  insights?: ProfileInsights | null;
  jd?: {
    archetype?: string;
    seniority?: string;
    role?: string;
    location?: string;
    responsibilities?: string[];
    requirements?: string[];
    keywords?: string[];
    rawText?: string;
    sourceUrl?: string;
  } | null;
  /** Pre-fetched real web research block (from lib/tracker/company-research). */
  research?: string | null;
  /** Whether the research step found usable data (for honest framing + UI). */
  researchFound?: boolean;
  /** Real source links harvested during research, to attach for attribution. */
  sources?: { title: string; url: string; source: string }[];
}

/**
 * Generate a deep, resume-grounded interview prep brief for a specific
 * company + role, grounded in real web research when provided. Uses Azure when
 * configured, else the deterministic mock. Output is always validated against
 * the schema and stamped with metadata the model may omit (sources, flags).
 */
export async function generateInterviewPrep(
  input: InterviewPrepInput,
): Promise<WithSource<InterviewPrep>> {
  const stamp = (prep: InterviewPrep): InterviewPrep => ({
    ...prep,
    company: prep.company || input.company,
    role: prep.role || input.role,
    // Always attach the real harvested sources (the model echoes a subset; we
    // want the full, verifiable list available to the UI).
    sources: input.sources && input.sources.length ? input.sources : prep.sources,
    researchFound: input.researchFound ?? prep.researchFound,
    generatedAt: prep.generatedAt || new Date().toISOString(),
  });

  if (isAzureConfigured) {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const raw = await chatJSON<unknown>(buildInterviewPrepMessages(input), {
          temperature: 0.5,
          maxTokens: 16000,
          timeoutMs: 120_000,
        });
        return { data: stamp(interviewPrepSchema.parse(raw)), source: "azure" };
      } catch (err) {
        lastErr = err;
        console.error(`[llm.generateInterviewPrep] Azure attempt ${attempt + 1} failed:`, err);
      }
    }
    // Don't fail the feature — fall back to the deterministic brief.
    console.error("[llm.generateInterviewPrep] falling back to mock:", lastErr);
    return { data: stamp(mockInterviewPrep(input)), source: "mock" };
  }
  return { data: stamp(mockInterviewPrep(input)), source: "mock" };
}

export { chat, chatJSON, LLMError } from "./client";
