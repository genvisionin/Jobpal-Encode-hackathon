/**
 * interview-prep.ts — schema for the auto-generated interview prep pack.
 *
 * When an interview-invite email is detected for an application, we run a
 * single deep-research LLM pass that produces a structured brief for that
 * exact company + role, grounded in the candidate's real resume/insights:
 *
 *   - company research (what they do, products, culture, signals, process rep)
 *   - role insights (what the job really is, what success looks like)
 *   - the likely interview process (rounds + focus of each)
 *   - likely questions grouped by category, each with WHY it's asked, how to
 *     approach it, and the candidate's own resume-grounded angle to use
 *   - talking points pulled from the resume (your strongest evidence to lead with)
 *   - smart questions to ask the interviewer
 *   - a concrete prep plan + watch-outs
 *
 * Everything the candidate "should say" is grounded in the resume (never
 * invented). Company research uses the model's knowledge — phrased honestly,
 * never fabricating specific facts it isn't sure of (see the prompt).
 *
 * Fields use the lenient LLM helpers + defaults so a stray null never fails the
 * whole parse, and older stored packs still load as the shape evolves.
 */

import { z } from "zod";
import { llmString, llmStringArray } from "./helpers";

/** What the company is + the signals worth knowing before the room. */
export const companyResearchSchema = z.object({
  /** 2–3 sentences: what the company does and where it sits in its market. */
  summary: llmString(),
  /** Their main products / lines of business. */
  products: llmStringArray(),
  /** Mission / what they say they're about (one line). */
  mission: llmString(),
  /** Culture + values signals worth mirroring (short phrases). */
  culture: llmStringArray(),
  /** Recent developments / momentum signals to reference (funding, launches, growth). */
  signals: llmStringArray(),
  /** What candidates commonly report about their interview process / bar. */
  interviewReputation: llmString(),
});

/** A read on what the role actually is and how it's judged. */
export const roleInsightsSchema = z.object({
  /** 2–3 sentences framing what this role really does day to day. */
  summary: llmString(),
  /** The core things this person will own. */
  focusAreas: llmStringArray(),
  /** What "great in this role" looks like (how they'll be judged). */
  successLooksLike: llmStringArray(),
});

/** One stage of the likely interview loop. */
export const interviewStageSchema = z.object({
  /** e.g. "Recruiter screen", "Technical phone screen", "Onsite — system design". */
  name: llmString(),
  /** What this round focuses on / who you'll meet. */
  focus: llmString(),
  /** Format hint, e.g. "30 min · behavioral", "60 min · live coding". */
  format: llmString(),
});

/** A real source link harvested from the web (for attribution + the UI). */
export const prepSourceSchema = z.object({
  title: llmString(),
  url: llmString(),
  /** Surface it came from: glassdoor | reddit | blind | leetcode | levels.fyi | web. */
  source: llmString(),
});

/**
 * What other candidates report about interviewing here — distilled from real
 * Glassdoor / Reddit / Blind results. Concise and grounded, never invented.
 */
export const candidateVoiceSchema = z.object({
  /** A short, punchy takeaway in the candidate's words/spirit (1 line). */
  quote: llmString(),
  /** What it tells you / why it matters (1 short line). */
  takeaway: llmString(),
  /** Sentiment of this signal. */
  sentiment: z.enum(["positive", "neutral", "caution"]).catch("neutral"),
  /** Where it came from (glassdoor/reddit/blind/etc.). */
  source: llmString(),
});

/**
 * A real interview question candidates reported being asked here (sourced) or
 * one inferred from the role (clearly tagged). Concise.
 */
export const reportedQuestionSchema = z.object({
  question: llmString(),
  /** Which round/stage it tends to come up in, if known. */
  round: llmString(),
  /** Where it was reported, or "inferred" if derived from the role/JD. */
  source: llmString(),
  /** true when this is inferred from the role rather than sourced from a candidate. */
  inferred: z
    .union([z.boolean(), z.string(), z.null()])
    .optional()
    .transform((v) => (typeof v === "boolean" ? v : typeof v === "string" ? /^(true|yes|1)$/i.test(v) : false)),
});

/** A likely question with how to handle it, grounded in the candidate's resume. */
export const prepQuestionSchema = z.object({
  question: llmString(),
  /** Why the interviewer asks this / what they're really probing for. */
  rationale: llmString(),
  /** How to structure a strong answer (the approach, not a script). */
  approach: llmString(),
  /**
   * The candidate's own angle: the specific real experience/proof point from
   * THEIR resume to anchor the answer in. Empty if nothing in the resume fits.
   */
  resumeHook: llmString(),
});

/** A group of likely questions of one type. */
export const questionGroupSchema = z.object({
  /** e.g. "Behavioral", "Role-specific", "System design", "Coding", "Domain". */
  category: llmString(),
  questions: z.array(prepQuestionSchema).default([]),
});

/** A talking point the candidate should proactively land, from their resume. */
export const talkingPointSchema = z.object({
  /** The point to make (a strength/story to lead with). */
  point: llmString(),
  /** The real resume evidence backing it (verbatim-ish, never invented). */
  evidence: llmString(),
  /** When in the loop to deploy it. */
  useWhen: llmString(),
});

/** A concrete prep task to do before the interview. */
export const prepTaskSchema = z.object({
  task: llmString(),
  detail: llmString(),
});

/** The full interview prep pack. */
export const interviewPrepSchema = z.object({
  company: llmString(),
  role: llmString(),
  /** One-paragraph executive read: what to expect and how to win this one. */
  overview: llmString(),
  /** How ready the candidate looks for THIS role, 0–100 (honest). */
  readiness: z
    .union([z.number(), z.string(), z.null()])
    .optional()
    .transform((v) => {
      const n = typeof v === "string" ? Number(v.replace(/[^0-9.]/g, "")) : v;
      if (n == null || Number.isNaN(n)) return 70;
      return Math.min(100, Math.max(0, Math.round(n as number)));
    }),
  companyResearch: companyResearchSchema.prefault(() => companyResearchSchema.parse({})),
  roleInsights: roleInsightsSchema.prefault(() => roleInsightsSchema.parse({})),
  /** The likely interview loop, in order. (Kept optional; not currently surfaced.) */
  process: z.array(interviewStageSchema).default([]),
  /** What other candidates report — distilled from real web research. */
  candidateVoices: z.array(candidateVoiceSchema).default([]),
  /** Real/inferred interview questions candidates were asked, grouped is optional. */
  reportedQuestions: z.array(reportedQuestionSchema).default([]),
  /** Likely questions, grouped by category (resume-grounded answers). */
  questionGroups: z.array(questionGroupSchema).default([]),
  /** Resume-grounded talking points to land proactively. */
  talkingPoints: z.array(talkingPointSchema).default([]),
  /** Smart, specific questions to ask the interviewer. */
  questionsToAsk: llmStringArray(),
  /** A short, concrete prep plan. */
  prepPlan: z.array(prepTaskSchema).default([]),
  /** Pitfalls / things to watch for in this specific loop. */
  watchouts: llmStringArray(),
  /** Real source links harvested during research (for attribution + UI). */
  sources: z.array(prepSourceSchema).default([]),
  /** Whether the research step found usable public data. */
  researchFound: z
    .union([z.boolean(), z.string(), z.null()])
    .optional()
    .transform((v) => (typeof v === "boolean" ? v : typeof v === "string" ? /^(true|yes|1)$/i.test(v) : false)),
  /** ISO timestamp the pack was generated (staleness detection). */
  generatedAt: llmString(),
});

export type CompanyResearch = z.infer<typeof companyResearchSchema>;
export type RoleInsights = z.infer<typeof roleInsightsSchema>;
export type InterviewStage = z.infer<typeof interviewStageSchema>;
export type PrepSource = z.infer<typeof prepSourceSchema>;
export type CandidateVoice = z.infer<typeof candidateVoiceSchema>;
export type ReportedQuestion = z.infer<typeof reportedQuestionSchema>;
export type PrepQuestion = z.infer<typeof prepQuestionSchema>;
export type QuestionGroup = z.infer<typeof questionGroupSchema>;
export type TalkingPoint = z.infer<typeof talkingPointSchema>;
export type PrepTask = z.infer<typeof prepTaskSchema>;
export type InterviewPrep = z.infer<typeof interviewPrepSchema>;

/** An empty, valid prep object — safe default. */
export function emptyInterviewPrep(): InterviewPrep {
  return interviewPrepSchema.parse({});
}
