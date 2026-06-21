/**
 * types.ts — persistence-layer record shapes.
 *
 * These are the rows we store. The repository interface (see store.ts) is
 * satisfied by either Supabase or a local JSON store, so the rest of the
 * app never imports a specific backend.
 */

import type {
  ResumeData,
  JobDescription,
  KeywordCoverage,
  ProfileInsights,
  FitDimension,
  RequirementMatch,
  CustomizationChange,
  CoverLetter,
} from "@/lib/schema";
import type { EmailKind } from "@/lib/schema/tracker";
import type { InterviewPrep } from "@/lib/schema/interview-prep";
import type { PlanId } from "@/lib/billing/plans";

/** The user's saved base profile (the master resume). */
export interface StoredProfile {
  userId: string;
  resume: ResumeData;
  /**
   * Derived "career intelligence" (archetypes + narrative + proof points),
   * auto-generated from the resume on save and reused on every tailoring run.
   * Optional so profiles saved before this layer existed still load.
   */
  insights?: ProfileInsights;
  /** Where the resume came from: an upload or the builder. */
  source: "upload" | "builder" | "seed";
  /** Original uploaded file reference (R2 key), if any. */
  sourceFileKey?: string;
  sourceFileName?: string;
  updatedAt: string;
}

/** A generated, job-tailored CV. */
export interface StoredTailoredCV {
  id: string;
  userId: string;
  company: string;
  role: string;
  templateId: string;
  resume: ResumeData;
  job: JobDescription;
  /** Confirmed role archetype + how it shaped tailoring. */
  archetype?: string;
  archetypeRationale?: string;
  matchScore: number;
  /** Weighted per-dimension fit breakdown. */
  scoreBreakdown?: FitDimension[];
  /** Requirement-by-requirement match analysis. */
  requirementMatches?: RequirementMatch[];
  /** Section-level before → after → why edits. */
  customizationPlan?: CustomizationChange[];
  changes: string[];
  keywordCoverage: KeywordCoverage[];
  /** Optional customized cover letter generated for this exact CV + JD pair. */
  coverLetter?: CoverLetter;
  createdAt: string;
}

/* ---------- Gmail tracker ---------- */

/** The user's Gmail connection state. Tokens live here (server-only). */
export interface TrackerConnection {
  userId: string;
  email: string;
  /** OAuth tokens. Optional so the mock/demo path can omit them. */
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: string;
  /** Day X — we only ingest mail received on/after this instant. */
  connectedAt: string;
  /** Last successful sync (ISO), drives incremental fetches. */
  lastSyncedAt?: string;
  /** Gmail historyId / internal cursor for incremental sync. */
  syncCursor?: string;
  status: "connected" | "disconnected" | "error";
}

export type TrackedStage = 0 | 1 | 2 | 3;
export type TrackedOutcome = "offer" | "rejected" | null;

/** A de-duplicated application, auto-maintained from the inbox. */
export interface TrackedApplication {
  id: string;
  userId: string;
  company: string;
  /** Normalized company key for matching (lowercased, suffix-stripped). */
  companyKey: string;
  role: string;
  stage: TrackedStage;
  outcome: TrackedOutcome;
  needsAction: boolean;
  actionSummary?: string;
  /** Deadline/interview/assessment/offer-response date extracted from email or entered manually. */
  actionDueAt?: string;
  /** User-managed details for manually tracked opportunities. */
  notes?: string;
  jobUrl?: string;
  contactName?: string;
  contactEmail?: string;
  /** Latest Gmail message/thread linked to this application, if known. */
  latestEmailId?: string;
  latestThreadId?: string;
  appliedAt: string; // ISO of the first (confirmation) email
  updatedAt: string; // ISO of the most recent linked email
  /** Source = how the row originated. */
  source: "gmail" | "manual";
}

/** Audit record of one ingested email (idempotency + re-linking). */
export interface EmailEvent {
  id: string; // provider message id
  userId: string;
  applicationId?: string; // linked application, once resolved
  threadId?: string;
  kind: EmailKind;
  company: string;
  role: string;
  receivedAt: string;
  eventDate?: string;
  summary: string;
  confidence: number;
}

/**
 * An auto-generated interview prep pack for one application. One row per
 * application (the latest pack); regenerating overwrites it. The brief itself
 * is the validated `InterviewPrep` shape from `lib/schema/interview-prep`.
 */
export interface StoredInterviewPrep {
  /** Stable id (we use the application id so prep ↔ application is 1:1). */
  id: string;
  userId: string;
  applicationId: string;
  company: string;
  role: string;
  /** The full structured brief. */
  prep: InterviewPrep;
  /** Whether the brief came from the real model or the deterministic mock. */
  source: "azure" | "mock";
  createdAt: string;
  updatedAt: string;
}

/* ---------- Chrome extension auth ---------- */

/** Short-lived one-time code created by the web app and exchanged by the extension. */
export interface ExtensionAuthCode {
  codeHash: string;
  userId: string;
  extensionId: string;
  redirectUri: string;
  expiresAt: string;
  createdAt: string;
  usedAt?: string;
}

/** Extension-only token pair. Tokens are hashed at rest. */
export interface ExtensionSession {
  id: string;
  userId: string;
  extensionId: string;
  accessTokenHash: string;
  refreshTokenHash: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
  createdAt: string;
  lastUsedAt: string;
  revokedAt?: string;
}

/** User-confirmed extension answer memory for repeated application questions. */
export interface ExtensionFieldMemory {
  id: string;
  userId: string;
  questionKey: string;
  normalizedQuestion: string;
  fieldKind: string;
  answer: {
    value: string;
    label?: string;
    optionValue?: string;
    optionLabel?: string;
  };
  metadata: {
    sourceUrl?: string;
    sourceTitle?: string;
    fieldLabel?: string;
    fieldName?: string;
    fieldId?: string;
    placeholder?: string;
    context?: string;
    options?: { value: string; label: string }[];
  };
  captureCount: number;
  createdAt: string;
  updatedAt: string;
}

export type ProfileEnrichmentSensitivity =
  | "standard"
  | "preference"
  | "protected_demographic"
  | "legal"
  | "consent";

export interface ProfileEnrichmentFact {
  key: string;
  label: string;
  value: string;
  sensitivity: ProfileEnrichmentSensitivity;
  source: "captured_answer" | "resume" | "derived" | "user_edited";
  sourceMemoryIds: string[];
  confidence: number;
  updatedAt: string;
}

export interface ProfileEnrichmentConflict {
  key: string;
  label: string;
  values: string[];
  sourceMemoryIds: string[];
  resolvedValue?: string;
}

/** LLM/refinement layer derived from resume profile + captured extension answers. */
export interface StoredProfileEnrichment {
  userId: string;
  summary: string;
  applicationPreferences: string[];
  communicationStyle: string[];
  facts: ProfileEnrichmentFact[];
  sensitiveFacts: ProfileEnrichmentFact[];
  conflicts: ProfileEnrichmentConflict[];
  sourceMemoryIds: string[];
  sourceMemoryUpdatedAt?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/* ---------- Billing & quota ---------- */

/** Lifecycle status of a paid subscription, mirroring Dodo's states. */
export type SubscriptionStatus =
  | "active"
  | "on_hold"
  | "cancelled"
  | "expired"
  | "failed";

/**
 * A user's billing state. Exactly one row per user. Free users either have
 * no row or a row with `plan: "free"`. Paid users carry the Dodo customer +
 * subscription ids so we can drive the customer portal and reconcile webhooks.
 */
export interface Subscription {
  userId: string;
  plan: PlanId;
  status: SubscriptionStatus;
  /** Dodo Payments customer id (cus_…), once a checkout has happened. */
  dodoCustomerId?: string;
  /** Dodo Payments subscription id (sub_…) for the current paid plan. */
  dodoSubscriptionId?: string;
  /** End of the current paid period (ISO) — access persists until then. */
  currentPeriodEnd?: string;
  /** True when the user asked to cancel but the period hasn't ended yet. */
  cancelAtPeriodEnd?: boolean;
  /** When this subscription row was first created (ISO). */
  createdAt?: string;
  updatedAt: string;
}

/**
 * A monthly usage counter for one metered feature. Keyed by user + metric +
 * period ("YYYY-MM", UTC). Incremented on each successful billable action;
 * resets implicitly by rolling to a new period key each month.
 */
export interface UsageCounter {
  userId: string;
  /** The metered action, e.g. "tailored_cv". */
  metric: string;
  /** Calendar period this count belongs to: "YYYY-MM" (UTC). */
  period: string;
  count: number;
  updatedAt: string;
}
