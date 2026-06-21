export const APP_BASE_URL =
  import.meta.env.VITE_JOBPAL_APP_URL?.replace(/\/$/, "") || "http://localhost:3002";

export const STORAGE_KEYS = {
  session: "jobpal.session",
  enabled: "jobpal.enabled",
  lastResult: "jobpal.lastResult",
  lastCapture: "jobpal.lastCapture",
  lastBatch: "jobpal.lastBatch",
  lastGenerated: "jobpal.lastGenerated",
  magicFillIncludeCv: "jobpal.magicFillIncludeCv",
  magicFillIncludeCoverLetter: "jobpal.magicFillIncludeCoverLetter",
  generatedDocuments: "jobpal.generatedDocuments",
  jobContexts: "jobpal.jobContexts",
  applyTransitions: "jobpal.applyTransitions",
} as const;

export const JOB_CONTEXT_CACHE_LIMIT = 20;
export const APPLY_TRANSITION_CACHE_LIMIT = 40;
export const GENERATED_DOCUMENT_CACHE_LIMIT = 20;
export const JOB_CONTEXT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const APPLY_TRANSITION_TTL_MS = 4 * 60 * 60 * 1000;
