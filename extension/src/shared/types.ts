export interface ExtensionUserSummary {
  id: string;
  email: string;
  name: string;
  title: string;
  hasProfile: boolean;
}

export interface ExtensionSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  user: ExtensionUserSummary;
}

export interface DetectedField {
  id: string;
  selector?: string;
  tagName: string;
  inputType: string;
  label: string;
  name: string;
  idAttr: string;
  placeholder: string;
  autocomplete: string;
  value: string;
  required: boolean;
  maxLength?: number;
  multi: boolean;
  options: { value: string; label: string }[];
  context: string;
}

export interface PageFillRequest {
  url: string;
  title: string;
  pageTextSummary: string;
  jobContext?: {
    company?: string;
    role?: string;
    description?: string;
  };
  fields: DetectedField[];
}

export interface JobApplyHint {
  text: string;
  href?: string;
  capturedAt: string;
}

export interface JobContextSnapshot {
  id: string;
  url: string;
  canonicalUrl: string;
  title: string;
  role?: string;
  company?: string;
  location?: string;
  description: string;
  descriptionLength: number;
  source: "job_page" | "apply_click" | "application_page";
  confidence: number;
  capturedAt: string;
  lastSeenAt: string;
  tabId?: number;
  openerTabId?: number;
  destinationUrl?: string;
  applyHints: JobApplyHint[];
}

export interface ApplyTransition {
  id: string;
  tabId?: number;
  sourceUrl: string;
  sourceContextId: string;
  destinationUrl?: string;
  linkText?: string;
  capturedAt: string;
}

export interface ResolvedJobContext {
  context?: JobContextSnapshot;
  confidence: number;
  reason: string;
}

export interface FillAnswer {
  fieldId: string;
  value: string;
  confidence: number;
  source: string;
}

export interface SkippedField {
  fieldId: string;
  reason: string;
}

export interface FillPlan {
  answers: FillAnswer[];
  skipped: SkippedField[];
  warnings: string[];
}

export interface CaptureAnswersResult {
  captured: number;
  skipped: SkippedField[];
  warnings: string[];
}

export interface ContactRecommendation {
  id: string;
  name: string;
  title: string;
  company: string;
  linkedinUrl: string;
  contactType: "recruiter" | "hiring_manager" | "team_lead" | "exec" | "peer";
  confidence: number;
  reason: string;
  evidence: {
    title: string;
    url: string;
    snippet: string;
  }[];
}

export interface ContactRecommendationsResult {
  company: string;
  role: string;
  generatedAt: string;
  contacts: ContactRecommendation[];
  warnings: string[];
}

export interface MagicFillResult extends FillPlan {
  filled: number;
  detected: number;
  includedCustomCv?: boolean;
  attachedResume?: boolean;
}

export interface BatchApplyItem {
  url: string;
  title?: string;
  status: "filled" | "failed";
  filled: number;
  detected: number;
  skipped: number;
  error?: string;
}

export interface BatchApplyResult {
  total: number;
  completed: number;
  failed: number;
  results: BatchApplyItem[];
}

export interface GeneratedDocumentResult {
  contextId: string;
  tabId?: number;
  sourceUrl: string;
  cvId: string;
  role: string;
  company: string;
  createdAt: string;
  cvDownloadPath: string;
  coverLetterDownloadPath?: string;
}

export interface SelectedTabSummary {
  id: number;
  url: string;
  title?: string;
  active?: boolean;
}

export interface PopupState {
  enabled: boolean;
  signedIn: boolean;
  user: ExtensionUserSummary | null;
  currentUrl?: string;
  currentTitle?: string;
  includeCustomCv: boolean;
  includeCoverLetter: boolean;
  selectedTabs?: SelectedTabSummary[];
  jobContext?: ResolvedJobContext;
  lastGenerated?: GeneratedDocumentResult;
  lastResult?: MagicFillResult;
  lastCapture?: CaptureAnswersResult;
  contactRecommendations?: ContactRecommendationsResult;
  lastBatch?: BatchApplyResult;
  error?: string;
}

export interface OverlayStatus {
  state: "loading" | "success" | "error" | "info";
  title: string;
  detail?: string;
  result?: {
    detected?: number;
    filled?: number;
    skipped?: number;
    captured?: number;
    warnings?: string[];
  };
  actions?: {
    captureCorrections?: boolean;
  };
}

export type RuntimeRequest =
  | { type: "GET_STATE" }
  | { type: "SET_ENABLED"; enabled: boolean }
  | { type: "SET_MAGIC_FILL_INCLUDE_CV"; includeCustomCv: boolean }
  | { type: "SET_MAGIC_FILL_INCLUDE_COVER_LETTER"; includeCoverLetter: boolean }
  | { type: "SAVE_JOB" }
  | { type: "SIGN_IN"; mode: "signin" | "signup" }
  | { type: "SIGN_OUT" }
  | { type: "CAPTURE_JOB_CONTEXT"; snapshot: JobContextSnapshot }
  | { type: "CAPTURE_APPLY_CLICK"; snapshot: JobContextSnapshot; destinationUrl?: string; linkText?: string }
  | { type: "CAPTURE_ANSWERS" }
  | { type: "CAPTURE_ANSWERS_FROM_PAGE" }
  | { type: "FIND_CONTACTS" }
  | { type: "GENERATE_CUSTOM_CV" }
  | { type: "GENERATE_COVER_LETTER" }
  | { type: "DOWNLOAD_GENERATED_FILE"; kind: "cv" | "coverLetter" }
  | { type: "START_BATCH_APPLY"; urls: string[] }
  | { type: "START_BATCH_SELECTED_TABS" }
  | { type: "MAGIC_FILL"; includeCustomCv?: boolean; includeCoverLetter?: boolean };

export type ContentRequest =
  | { type: "COLLECT_FIELDS"; changedOnly?: boolean }
  | { type: "COLLECT_JOB_CONTEXT"; source?: JobContextSnapshot["source"] }
  | { type: "FIND_RESUME_UPLOAD_FIELD" }
  | { type: "ATTACH_RESUME_FILE"; fileName: string; mime: string; base64: string }
  | { type: "APPLY_FILL_PLAN"; plan: FillPlan }
  | { type: "REMEMBER_CAPTURE_BASELINE" }
  | { type: "SHOW_JOBPAL_OVERLAY"; status: OverlayStatus };
