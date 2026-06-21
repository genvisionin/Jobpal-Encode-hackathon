import { APP_BASE_URL } from "./shared/config";
import {
  getEnabled,
  getGeneratedDocuments,
  getLastBatch,
  getLastCapture,
  getLastResult,
  getApplyTransitions,
  getJobContexts,
  getMagicFillIncludeCv,
  getMagicFillIncludeCoverLetter,
  getSession,
  recordApplyTransition,
  clearGeneratedDocuments,
  setEnabled,
  setLastBatch,
  setLastCapture,
  setLastResult,
  setMagicFillIncludeCv,
  setMagicFillIncludeCoverLetter,
  setSession,
  upsertJobContext,
  upsertGeneratedDocument,
} from "./shared/storage";
import type {
  ApplyTransition,
  BatchApplyItem,
  BatchApplyResult,
  CaptureAnswersResult,
  ContactRecommendationsResult,
  ContentRequest,
  ExtensionSession,
  ExtensionUserSummary,
  FillPlan,
  GeneratedDocumentResult,
  JobContextSnapshot,
  MagicFillResult,
  OverlayStatus,
  PageFillRequest,
  PopupState,
  ResolvedJobContext,
  RuntimeRequest,
  SelectedTabSummary,
} from "./shared/types";

const API_TIMEOUT_MS = 25_000;
const MAGIC_FILL_TIMEOUT_MS = 90_000;
const CUSTOMIZE_TIMEOUT_MS = 130_000;
const CONTACT_RESEARCH_TIMEOUT_MS = 45_000;
const CONTENT_TIMEOUT_MS = 8_000;
// Applying answers now operates live custom dropdowns (open → type → click),
// which costs ~0.6s each, so the apply round-trip needs a longer budget.
const APPLY_FILL_TIMEOUT_MS = 45_000;
const BATCH_LIMIT = 10;
const TAB_READY_TIMEOUT_MS = 30_000;
const MIN_JOB_CONTEXT_CONFIDENCE = 0.46;
const RESUME_ATTACH_SETTLE_MS = 2500;

function apiErrorFromText(text: string, status: number): string {
  const trimmed = text.trim();
  if (!trimmed) return `Jobpal request failed with status ${status}.`;
  if (/^<!doctype html>|^<html[\s>]/i.test(trimmed)) {
    return "Jobpal returned an HTML error page instead of API JSON. Restart the local Jobpal app, then reload the extension.";
  }
  return trimmed.slice(0, 300);
}

async function readJsonResponse<T>(res: Response): Promise<{ data: T | null; text: string }> {
  const text = await res.text().catch(() => "");
  if (!text.trim()) return { data: null, text };
  try {
    return { data: JSON.parse(text) as T, text };
  } catch {
    return { data: null, text };
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hashText(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function canonicalUrl(value?: string): string {
  if (!value) return "";
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|msclkid|ref|source|gh_src)/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return value.split("#")[0];
  }
}

function urlParts(value?: string): { host: string; path: string; tokens: string[] } {
  try {
    const url = new URL(value ?? "");
    const tokens = url.pathname
      .split(/[/?#/&=._-]+/)
      .map((item) => item.toLowerCase())
      .filter((item) => item.length >= 6 && !/^(application|apply|jobs|careers|opening|posting)$/.test(item));
    return { host: url.hostname.replace(/^www\./, ""), path: url.pathname.replace(/\/+$/, ""), tokens };
  } catch {
    return { host: "", path: "", tokens: [] };
  }
}

function sameUrlish(a?: string, b?: string): boolean {
  const left = canonicalUrl(a);
  const right = canonicalUrl(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const aParts = urlParts(left);
  const bParts = urlParts(right);
  return Boolean(aParts.host && aParts.host === bParts.host && aParts.path && aParts.path === bParts.path);
}

function urlTokenOverlap(a?: string, b?: string): number {
  const left = urlParts(a);
  const right = urlParts(b);
  if (!left.host || left.host !== right.host) return 0;
  const rightTokens = new Set(right.tokens);
  return left.tokens.filter((token) => rightTokens.has(token)).length;
}

function cleanSnapshot(snapshot: JobContextSnapshot, senderTab?: ExtensionTab): JobContextSnapshot {
  const canonical = canonicalUrl(snapshot.canonicalUrl || snapshot.url);
  const description = snapshot.description.replace(/\s+/g, " ").trim().slice(0, 12_000);
  const now = new Date().toISOString();
  return {
    ...snapshot,
    id: snapshot.id || `job-${hashText([canonical, snapshot.role, snapshot.company, description.slice(0, 400)].join("|"))}`,
    url: snapshot.url,
    canonicalUrl: canonical,
    title: snapshot.title.slice(0, 300),
    role: snapshot.role?.slice(0, 200),
    company: snapshot.company?.slice(0, 200),
    location: snapshot.location?.slice(0, 200),
    description,
    descriptionLength: description.length,
    confidence: Math.max(0, Math.min(0.98, snapshot.confidence)),
    capturedAt: snapshot.capturedAt || now,
    lastSeenAt: now,
    tabId: senderTab?.id ?? snapshot.tabId,
    openerTabId: senderTab?.openerTabId ?? snapshot.openerTabId,
    applyHints: snapshot.applyHints.slice(-8),
  };
}

function hasStrongJobLanguage(description: string): boolean {
  return /responsibilities|requirements|qualifications|about the role|the role|what you.?ll do|what we.?re looking for|you will|we are looking|experience with|skills|benefits|compensation/i.test(
    description,
  );
}

function isUsableJobContext(snapshot: JobContextSnapshot): boolean {
  if (snapshot.descriptionLength < 420) return false;
  if (snapshot.confidence >= MIN_JOB_CONTEXT_CONFIDENCE) return true;
  return Boolean(
    snapshot.role &&
      snapshot.descriptionLength >= 650 &&
      (hasStrongJobLanguage(snapshot.description) || snapshot.applyHints.length > 0 || snapshot.destinationUrl),
  );
}

function shouldStoreJobContext(snapshot: JobContextSnapshot): boolean {
  if (!snapshot.description && !snapshot.role) return false;
  if (isUsableJobContext(snapshot)) return true;
  return Boolean(snapshot.source === "apply_click" && snapshot.descriptionLength >= 350 && snapshot.role);
}

type ExtensionTab = chrome.tabs.Tab;

async function activeTab(): Promise<ExtensionTab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab found.");
  return tab;
}

function tabSummary(tab: ExtensionTab): SelectedTabSummary | null {
  if (!tab.id || !tab.url || !/^https?:/i.test(tab.url)) return null;
  return {
    id: tab.id,
    url: tab.url,
    title: tab.title,
    active: tab.active,
  };
}

async function selectedFillableTabs(): Promise<SelectedTabSummary[]> {
  const tabs = await chrome.tabs.query({ highlighted: true, currentWindow: true });
  const selected = tabs
    .map(tabSummary)
    .filter((tab): tab is SelectedTabSummary => Boolean(tab));
  if (selected.length) return selected.slice(0, BATCH_LIMIT);

  const active = await activeTab().catch(() => undefined);
  const summary = active ? tabSummary(active) : null;
  return summary ? [summary] : [];
}

async function assertFillableTab(tab: ExtensionTab, actionName: string): Promise<ExtensionTab & { id: number; url: string }> {
  if (!tab.id || !tab.url || !/^https?:/i.test(tab.url)) {
    throw new Error(`${actionName} works on regular web pages.`);
  }
  return tab as ExtensionTab & { id: number; url: string };
}

async function waitForTabReady(tabId: number): Promise<void> {
  const current = await chrome.tabs.get(tabId).catch(() => undefined);
  if (current?.status === "complete") return;
  await withTimeout(
    new Promise<void>((resolve, reject) => {
      const listener = (updatedTabId: number, info: chrome.tabs.TabChangeInfo) => {
        if (updatedTabId === tabId && info.status === "complete") {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
      chrome.tabs.get(tabId).catch((err) => {
        chrome.tabs.onUpdated.removeListener(listener);
        reject(err);
      });
    }),
    TAB_READY_TIMEOUT_MS,
    "Page took too long to load.",
  );
}

async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  retry = true,
  timeoutMs = API_TIMEOUT_MS,
): Promise<T> {
  const session = await ensureFreshSession();
  if (!session) throw new Error("Please sign in to Jobpal.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${APP_BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.accessToken}`,
        ...(init.headers ?? {}),
      },
    });
  } catch (err) {
    if (controller.signal.aborted) throw new Error("Jobpal took too long to respond.");
    throw err;
  } finally {
    clearTimeout(timeout);
  }
  if (res.status === 401 && retry && session.refreshToken) {
    await refreshSession(session.refreshToken);
    return apiFetch<T>(path, init, false, timeoutMs);
  }
  const { data, text } = await readJsonResponse<unknown>(res);
  if (!res.ok) {
    const error = data && typeof data === "object" && "error" in data
      ? String((data as { error?: unknown }).error)
      : apiErrorFromText(text, res.status);
    throw new Error(error || "Jobpal request failed.");
  }
  if (!data) {
    throw new Error("Jobpal returned an empty or invalid API response.");
  }
  return data as T;
}

async function apiDownload(path: string, retry = true): Promise<{ buffer: ArrayBuffer; mime: string; filename: string }> {
  const session = await ensureFreshSession();
  if (!session) throw new Error("Please sign in to Jobpal.");
  const res = await fetch(`${APP_BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
    },
  });
  if (res.status === 401 && retry && session.refreshToken) {
    await refreshSession(session.refreshToken);
    return apiDownload(path, false);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(apiErrorFromText(text, res.status));
  }
  const disposition = res.headers.get("content-disposition") ?? "";
  const filename = disposition.match(/filename="([^"]+)"/i)?.[1] ?? "jobpal-document.pdf";
  return {
    buffer: await res.arrayBuffer(),
    mime: res.headers.get("content-type") || "application/pdf",
    filename,
  };
}

function dataUrlFromBuffer(buffer: ArrayBuffer, mime: string): string {
  return `data:${mime};base64,${base64FromBuffer(buffer)}`;
}

function base64FromBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.slice(offset, offset + 0x8000));
  }
  return btoa(binary);
}

async function ensureFreshSession(): Promise<ExtensionSession | undefined> {
  const session = await getSession();
  if (!session) return undefined;
  const expires = Date.parse(session.expiresAt);
  if (Number.isFinite(expires) && expires - Date.now() > 60_000) return session;
  try {
    return await refreshSession(session.refreshToken);
  } catch {
    // Refresh failed (network error or transient server error).
    // Return whatever is still in storage so the caller can keep the user
    // signed in. The next API call that gets a 401 will retry the refresh.
    const current = await getSession();
    if (current) return current;
    throw new Error("Session expired. Please sign in again.");
  }
}

async function refreshSession(refreshToken: string): Promise<ExtensionSession> {
  let res: Response;
  try {
    res = await fetch(`${APP_BASE_URL}/api/extension/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    // Network failure — do NOT wipe the local session. The app may be
    // temporarily unreachable. We'll retry on the next popup open.
    throw new Error("Could not reach Jobpal. Check your connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Only clear the stored session when the server explicitly rejects the
    // token (401/403). Any other error code is likely transient.
    if (res.status === 401 || res.status === 403) {
      await setSession(null);
    }
    throw new Error((data as { error?: string }).error ?? "Please sign in again.");
  }
  await setSession(data as ExtensionSession);
  return data as ExtensionSession;
}

async function signIn(mode: "signin" | "signup"): Promise<ExtensionSession> {
  const redirectUri = chrome.identity.getRedirectURL("auth");
  const authUrl = new URL(`${APP_BASE_URL}/extension-auth/start`);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("mode", mode);

  let responseUrl: string | undefined;
  try {
    responseUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl.toString(),
      interactive: true,
    });
  } catch (err) {
    // launchWebAuthFlow throws when the user closes the popup or when the
    // URL scheme is not supported. Rethrow with a clear message.
    const msg = err instanceof Error ? err.message : String(err);
    if (/cancel/i.test(msg) || /closed/i.test(msg)) {
      throw new Error("Sign-in cancelled. Click Sign in to try again.");
    }
    throw new Error(`Could not open sign-in window: ${msg}`);
  }

  if (!responseUrl) throw new Error("Sign-in was cancelled. Click Sign in to try again.");
  const code = new URL(responseUrl).searchParams.get("code");
  if (!code) throw new Error("Jobpal did not return an auth code. Please try again.");

  const res = await fetch(`${APP_BASE_URL}/api/extension/auth/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, extensionId: chrome.runtime.id }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Sign-in failed.");
  await setSession(data as ExtensionSession);
  return data as ExtensionSession;
}

async function signOut(): Promise<void> {
  try {
    await apiFetch("/api/extension/auth/revoke", { method: "POST" }, false);
  } catch {
    // Local session cleanup still matters even if the server token is gone.
  }
  await setSession(null);
  await setLastBatch(undefined);
  await setLastCapture(undefined);
  await clearGeneratedDocuments();
  await setLastResult(undefined);
}

async function refreshUserSummary(): Promise<ExtensionSession | null> {
  const session = await ensureFreshSession();
  if (!session) return null;
  try {
    const data = await apiFetch<{ user: ExtensionUserSummary }>("/api/extension/me");
    const latest = (await getSession()) ?? session;
    const updated = { ...latest, user: data.user };
    await setSession(updated);
    return updated;
  } catch {
    return (await getSession()) ?? null;
  }
}

async function injectContentScript(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["assets/content-script.js"],
  });
}

async function sendToContent<T>(tabId: number, message: ContentRequest, timeoutMs = CONTENT_TIMEOUT_MS): Promise<T> {
  try {
    const response = await withTimeout(chrome.tabs.sendMessage(tabId, message), timeoutMs, "Page scan took too long.");
    if (response && typeof response === "object" && "error" in response) {
      throw new Error(String((response as { error: unknown }).error));
    }
    return response as T;
  } catch {
    await injectContentScript(tabId);
    const response = await withTimeout(chrome.tabs.sendMessage(tabId, message), timeoutMs, "Page scan took too long.");
    if (response && typeof response === "object" && "error" in response) {
      throw new Error(String((response as { error: unknown }).error));
    }
    return response as T;
  }
}

async function collectTabJobContext(tab: ExtensionTab, source: JobContextSnapshot["source"] = "application_page"): Promise<JobContextSnapshot | null> {
  if (!tab.id || !/^https?:/i.test(tab.url ?? "")) return null;
  return sendToContent<JobContextSnapshot | null>(tab.id, { type: "COLLECT_JOB_CONTEXT", source }).catch(() => null);
}

async function rememberJobContext(snapshot: JobContextSnapshot, senderTab?: ExtensionTab): Promise<void> {
  if (!(await getEnabled())) return;
  const cleaned = cleanSnapshot(snapshot, senderTab);
  if (!shouldStoreJobContext(cleaned)) return;
  await upsertJobContext(cleaned);
}

async function rememberApplyClick(
  snapshot: JobContextSnapshot,
  senderTab?: ExtensionTab,
  destinationUrl?: string,
  linkText?: string,
): Promise<void> {
  if (!(await getEnabled())) return;
  const cleaned = cleanSnapshot({ ...snapshot, destinationUrl }, senderTab);
  if (!shouldStoreJobContext(cleaned)) return;
  await upsertJobContext(cleaned);
  const transition: ApplyTransition = {
    id: `apply-${hashText([cleaned.id, cleaned.url, destinationUrl, Date.now()].join("|"))}`,
    tabId: senderTab?.id,
    sourceUrl: cleaned.canonicalUrl,
    sourceContextId: cleaned.id,
    destinationUrl: destinationUrl ? canonicalUrl(destinationUrl) : cleaned.applyHints[0]?.href,
    linkText,
    capturedAt: new Date().toISOString(),
  };
  await recordApplyTransition(transition);
}

async function resolveJobContextWithActiveScan(tab?: ExtensionTab): Promise<ResolvedJobContext> {
  if (!tab?.id || !tab.url || !/^https?:/i.test(tab.url)) {
    return { confidence: 0, reason: "No web page selected." };
  }

  const scanned = await collectTabJobContext(tab, "job_page");
  if (scanned) {
    const cleaned = cleanSnapshot(scanned, tab);
    if (isUsableJobContext(cleaned)) {
      await upsertJobContext(cleaned).catch(() => undefined);
      return {
        context: cleaned,
        confidence: Math.max(0.9, cleaned.confidence),
        reason: "Current tab contains a captured job description.",
      };
    }
  }

  return resolveJobContext(tab);
}

function byId(contexts: JobContextSnapshot[]): Map<string, JobContextSnapshot> {
  return new Map(contexts.map((context) => [context.id, context]));
}

function scoreContextForTab(
  context: JobContextSnapshot,
  tab: ExtensionTab,
  transitions: ApplyTransition[],
): { score: number; reason: string } {
  const url = tab.url ?? "";
  if (!url) return { score: 0, reason: "no-url" };

  if (sameUrlish(context.url, url) || sameUrlish(context.canonicalUrl, url)) {
    return { score: 0.98, reason: "Current tab is the captured job page." };
  }

  const matchedTransition = transitions.find((transition) => {
    if (transition.sourceContextId !== context.id) return false;
    if (transition.destinationUrl && sameUrlish(transition.destinationUrl, url)) return true;
    return Boolean(tab.id && transition.tabId === tab.id);
  });
  if (matchedTransition) {
    return { score: 0.94, reason: "Matched the Apply click that led to this tab." };
  }

  if (tab.openerTabId && context.tabId === tab.openerTabId) {
    return { score: 0.88, reason: "Matched the job page that opened this application tab." };
  }

  if (tab.id && context.tabId === tab.id && Date.now() - Date.parse(context.lastSeenAt) < 4 * 60 * 60 * 1000) {
    return { score: 0.82, reason: "Matched same-tab navigation from job page to application." };
  }

  if (context.applyHints.some((hint) => hint.href && sameUrlish(hint.href, url))) {
    return { score: 0.8, reason: "Matched a captured Apply link on the job page." };
  }

  const tokenOverlap = urlTokenOverlap(context.url, url);
  if (tokenOverlap >= 1) {
    return { score: Math.min(0.78, 0.62 + tokenOverlap * 0.08), reason: "Matched ATS job identifiers in the URL." };
  }

  return { score: 0, reason: "No reliable match." };
}

async function resolveJobContext(tab?: ExtensionTab): Promise<ResolvedJobContext> {
  if (!tab?.url || !/^https?:/i.test(tab.url)) return { confidence: 0, reason: "No web page selected." };
  const [contexts, transitions] = await Promise.all([getJobContexts(), getApplyTransitions()]);
  if (!contexts.length) return { confidence: 0, reason: "No job description has been captured yet." };

  const contextMap = byId(contexts);
  const transitionContext = transitions
    .filter((transition) => transition.destinationUrl && sameUrlish(transition.destinationUrl, tab.url))
    .map((transition) => contextMap.get(transition.sourceContextId))
    .find(Boolean);
  if (transitionContext) {
    return {
      context: transitionContext,
      confidence: 0.96,
      reason: "Matched the Apply click that led to this tab.",
    };
  }

  const ranked = contexts
    .map((context) => {
      const result = scoreContextForTab(context, tab, transitions);
      return { context, ...result };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || Date.parse(b.context.lastSeenAt) - Date.parse(a.context.lastSeenAt));

  if (!ranked.length) return { confidence: 0, reason: "No cached job description matched this tab." };
  return {
    context: ranked[0].context,
    confidence: ranked[0].score,
    reason: ranked[0].reason,
  };
}

function pageRequestWithResolvedJob(request: PageFillRequest, resolved: ResolvedJobContext): PageFillRequest {
  const context = resolved.context;
  if (!context || resolved.confidence < 0.72) return request;
  return {
    ...request,
    jobContext: {
      company: context.company || request.jobContext?.company,
      role: context.role || request.jobContext?.role,
      description: (context.description || request.jobContext?.description || request.pageTextSummary).slice(0, 8000),
    },
  };
}

// All progress/result feedback now lives inside the extension popup, never on
// the page. This is intentionally a no-op so no in-page overlay is ever shown,
// even in tabs that still have an older content script loaded. The `status`
// argument is kept so the many call sites stay untouched.
async function showOverlay(_tabId: number, _status: OverlayStatus): Promise<void> {
  return;
}

async function runMagicFill(
  options: { tab?: ExtensionTab; forceEnabled?: boolean; showOverlay?: boolean; includeCustomCv?: boolean } = {},
): Promise<MagicFillResult> {
  if (!options.forceEnabled && !(await getEnabled())) throw new Error("Turn Jobpal on before using Magic Fill.");
  const tab = await assertFillableTab(options.tab ?? (await activeTab()), "Magic Fill");
  const includeCustomCv = options.includeCustomCv ?? (await getMagicFillIncludeCv());
  if (options.showOverlay) {
    await showOverlay(tab.id, {
      state: "loading",
      title: includeCustomCv ? "Preparing application" : "Scanning application",
      detail: includeCustomCv
        ? "Checking the captured role context before generating the custom CV."
        : "Reading visible fields and job context on this page.",
    });
  }
  const currentSnapshot = await collectTabJobContext(tab, "application_page");
  if (currentSnapshot) await rememberJobContext(currentSnapshot, tab).catch(() => undefined);
  const resolvedJob = await resolveJobContextWithActiveScan(tab);
  const cvPreparation = includeCustomCv
    ? await prepareCustomCvForMagicFill(tab, resolvedJob, Boolean(options.showOverlay))
    : { attachedResume: false, warnings: [] };
  if (cvPreparation.attachedResume) {
    await delay(RESUME_ATTACH_SETTLE_MS);
  }
  if (options.showOverlay) {
    await showOverlay(tab.id, {
      state: "loading",
      title: "Scanning application",
      detail: cvPreparation.attachedResume
        ? "The custom CV was attached. Jobpal is now reading the fields that still need answers."
        : "Reading visible fields and job context on this page.",
    });
  }
  const request = await sendToContent<PageFillRequest>(tab.id, { type: "COLLECT_FIELDS" });
  if (request.fields.length === 0) throw new Error("No visible application fields found on this page.");
  const enrichedRequest = pageRequestWithResolvedJob(request, resolvedJob);
  if (options.showOverlay) {
    await showOverlay(tab.id, {
      state: "loading",
      title: "Preparing answers",
      detail: `${request.fields.length} fields detected. Jobpal is matching profile data${
        enrichedRequest.jobContext?.description ? " with the captured job description" : ""
      }.`,
      result: { detected: request.fields.length },
    });
  }
  const plan = await apiFetch<FillPlan>("/api/extension/magic-fill", {
    method: "POST",
    body: JSON.stringify(enrichedRequest),
  }, true, MAGIC_FILL_TIMEOUT_MS);
  if (options.showOverlay) {
    await showOverlay(tab.id, {
      state: "loading",
      title: "Filling safe matches",
      detail: "Applying high-confidence answers. The form will not be submitted.",
      result: { detected: request.fields.length, skipped: plan.skipped.length },
    });
  }
  const applied = await sendToContent<{ filled: number }>(tab.id, { type: "APPLY_FILL_PLAN", plan }, APPLY_FILL_TIMEOUT_MS);
  const warnings = [...cvPreparation.warnings, ...plan.warnings];
  const result: MagicFillResult = {
    ...plan,
    warnings,
    filled: applied.filled,
    detected: request.fields.length,
    includedCustomCv: includeCustomCv,
    attachedResume: cvPreparation.attachedResume,
  };
  await setLastResult(result);
  if (options.showOverlay) {
    await showOverlay(tab.id, {
      state: "success",
      title: "Magic Fill complete",
      detail: "Review the page before submitting. Edit anything you want, then capture corrections for next time.",
      result: {
        detected: result.detected,
        filled: result.filled,
        skipped: result.skipped.length,
        warnings: result.warnings,
      },
      actions: { captureCorrections: true },
    });
  }
  return result;
}

function jobDescriptionForCustomize(context: JobContextSnapshot): string {
  return [
    context.role ? `Role: ${context.role}` : "",
    context.company ? `Company: ${context.company}` : "",
    context.location ? `Location: ${context.location}` : "",
    `Source URL: ${context.canonicalUrl || context.url}`,
    "",
    context.description,
  ]
    .filter((part) => part !== "")
    .join("\n")
    .slice(0, 250_000);
}

async function generateDocumentFromContext(
  context: JobContextSnapshot,
  createCoverLetter: boolean,
  tab?: ExtensionTab,
): Promise<GeneratedDocumentResult> {
  const result = await apiFetch<GeneratedDocumentResult>("/api/extension/customize", {
    method: "POST",
    body: JSON.stringify({
      jobDescription: jobDescriptionForCustomize(context),
      sourceUrl: context.canonicalUrl || context.url,
      createCoverLetter,
    }),
  }, true, CUSTOMIZE_TIMEOUT_MS);
  const scoped = {
    ...result,
    contextId: context.id,
    tabId: tab?.id,
    sourceUrl: context.canonicalUrl || context.url,
  };
  await upsertGeneratedDocument(scoped);
  return scoped;
}

async function activeResolvedJobContext(tab: ExtensionTab): Promise<JobContextSnapshot> {
  const currentSnapshot = await collectTabJobContext(tab, "application_page");
  if (currentSnapshot) await rememberJobContext(currentSnapshot, tab).catch(() => undefined);
  const resolved = await resolveJobContextWithActiveScan(tab);
  if (!resolved.context || resolved.confidence < 0.72 || resolved.context.descriptionLength < 450) {
    throw new Error("Open the job description first, then click Apply so Jobpal can capture the exact role context.");
  }
  return resolved.context;
}

async function generateDocumentFromActiveJob(createCoverLetter: boolean): Promise<GeneratedDocumentResult> {
  if (!(await ensureFreshSession())) throw new Error("Please sign in to Jobpal.");
  if (!(await getEnabled())) throw new Error("Turn Jobpal on before generating documents.");
  const tab = await assertFillableTab(await activeTab(), createCoverLetter ? "Cover Letter" : "Custom CV");

  await showOverlay(tab.id, {
    state: "loading",
    title: createCoverLetter ? "Creating cover letter" : "Creating custom CV",
    detail: "Using the captured job description and your Jobpal profile.",
  });

  const context = await activeResolvedJobContext(tab);
  const result = await generateDocumentFromContext(context, createCoverLetter, tab);

  await showOverlay(tab.id, {
    state: "success",
    title: createCoverLetter ? "Cover letter ready" : "Custom CV ready",
    detail: "Open the Jobpal extension to download the generated file.",
  });
  return result;
}

async function findContactsForActiveJob(): Promise<ContactRecommendationsResult> {
  if (!(await ensureFreshSession())) throw new Error("Please sign in to Jobpal.");
  if (!(await getEnabled())) await setEnabled(true);
  const tab = await assertFillableTab(await activeTab(), "Contact finder");
  const context = await activeResolvedJobContext(tab);
  if (!context.company || !context.role) {
    throw new Error("Open a job posting with a clear company and role first.");
  }
  return apiFetch<ContactRecommendationsResult>("/api/extension/contact-recommendations", {
    method: "POST",
    body: JSON.stringify({
      company: context.company,
      role: context.role,
      location: context.location,
      description: context.description,
      sourceUrl: context.canonicalUrl || context.url,
    }),
  }, true, CONTACT_RESEARCH_TIMEOUT_MS);
}

function generatedMatchesContext(generated: GeneratedDocumentResult | undefined, context: JobContextSnapshot, tab?: ExtensionTab): boolean {
  if (!generated) return false;
  if (generated.contextId) return generated.contextId === context.id;
  const role = (context.role ?? "").toLowerCase();
  const company = (context.company ?? "").toLowerCase();
  return Boolean(
    generated.role &&
      generated.company &&
      (!role || generated.role.toLowerCase().includes(role) || role.includes(generated.role.toLowerCase())) &&
      sameUrlish(generated.sourceUrl, context.canonicalUrl || context.url) &&
      (!company || generated.company.toLowerCase().includes(company) || company.includes(generated.company.toLowerCase())),
  );
}

async function getScopedGeneratedForContext(
  resolved: ResolvedJobContext | undefined,
  tab?: ExtensionTab,
): Promise<GeneratedDocumentResult | undefined> {
  const context = resolved?.context;
  if (!context || (resolved?.confidence ?? 0) < 0.72) return undefined;
  const documents = await getGeneratedDocuments();
  return documents.find((generated) => generatedMatchesContext(generated, context, tab));
}

async function ensureGeneratedCvForContext(
  tab: ExtensionTab,
  context: JobContextSnapshot,
  showStatus: boolean,
): Promise<GeneratedDocumentResult> {
  let generated = await getScopedGeneratedForContext({ context, confidence: 1, reason: "Current job context." }, tab);
  if (!generatedMatchesContext(generated, context, tab)) {
    if (showStatus) {
      await showOverlay(tab.id!, {
        state: "loading",
        title: "Creating custom CV",
        detail: "Using the captured job description and your Jobpal profile before filling the form.",
      });
    }
    generated = await generateDocumentFromContext(context, false, tab);
  }
  if (!generated) throw new Error("Could not create a custom CV for this application.");
  return generated;
}

async function attachGeneratedCvFileIfPossible(
  tab: ExtensionTab,
  generated: GeneratedDocumentResult,
): Promise<{ attachedResume: boolean; message?: string }> {
  const uploadField = await sendToContent<{ found: boolean; label?: string }>(tab.id!, { type: "FIND_RESUME_UPLOAD_FIELD" }).catch(() => ({
    found: false,
  }));
  if (!uploadField.found) {
    return {
      attachedResume: false,
      message: "Custom CV was created, but no resume upload field was found on this page.",
    };
  }

  const file = await apiDownload(generated.cvDownloadPath);
  const attached = await sendToContent<{ attached: boolean; reason?: string; label?: string }>(tab.id!, {
    type: "ATTACH_RESUME_FILE",
    fileName: file.filename,
    mime: file.mime,
    base64: base64FromBuffer(file.buffer),
  });
  if (!attached.attached) {
    return { attachedResume: false, message: attached.reason || "Generated CV could not be attached." };
  }
  return { attachedResume: true };
}

async function prepareCustomCvForMagicFill(
  tab: ExtensionTab,
  resolvedJob: ResolvedJobContext,
  showStatus: boolean,
): Promise<{ attachedResume: boolean; warnings: string[] }> {
  if (!resolvedJob.context || resolvedJob.confidence < 0.72 || resolvedJob.context.descriptionLength < 450) {
    return {
      attachedResume: false,
      warnings: ["Custom CV was not generated because Jobpal could not confirm the exact job description for this tab."],
    };
  }

  try {
    const generated = await ensureGeneratedCvForContext(tab, resolvedJob.context, showStatus);
    if (showStatus) {
      await showOverlay(tab.id!, {
        state: "loading",
        title: "Attaching custom CV",
        detail: "Looking for the resume upload field on this application page.",
      });
    }
    const attachResult = await attachGeneratedCvFileIfPossible(tab, generated);
    return {
      attachedResume: attachResult.attachedResume,
      warnings: attachResult.message && !attachResult.attachedResume ? [attachResult.message] : [],
    };
  } catch (err) {
    return {
      attachedResume: false,
      warnings: [err instanceof Error ? err.message : "Custom CV could not be generated or attached."],
    };
  }
}

async function downloadGeneratedFile(kind: "cv" | "coverLetter"): Promise<void> {
  const tab = await activeTab().catch(() => undefined);
  const context = tab ? await resolveJobContextWithActiveScan(tab).catch(() => undefined) : undefined;
  const generated = await getScopedGeneratedForContext(context, tab);
  if (!generated) throw new Error("Generate a custom CV or cover letter first.");
  const path = kind === "cv" ? generated.cvDownloadPath : generated.coverLetterDownloadPath;
  if (!path) throw new Error("No cover letter is available for this generated CV yet.");
  const file = await apiDownload(path);
  const id = await chrome.downloads.download({
    url: dataUrlFromBuffer(file.buffer, file.mime),
    filename: file.filename,
    saveAs: true,
  });
  if (!id) throw new Error("Chrome could not start the download.");
}

async function captureAnswers(tabOverride?: ExtensionTab, showStatus = false): Promise<CaptureAnswersResult> {
  const tab = await assertFillableTab(tabOverride ?? (await activeTab()), "Capture Answers");
  if (showStatus) {
    await showOverlay(tab.id, {
      state: "loading",
      title: "Capturing answers",
      detail: "Saving safe field/question answers as reusable Jobpal memory.",
    });
  }
  const request = await sendToContent<PageFillRequest>(tab.id, { type: "COLLECT_FIELDS", changedOnly: true });
  const result = await apiFetch<CaptureAnswersResult>("/api/extension/field-memory/capture", {
    method: "POST",
    body: JSON.stringify(request),
  });
  await setLastCapture(result);
  await sendToContent<{ ok: boolean }>(tab.id, { type: "REMEMBER_CAPTURE_BASELINE" }).catch(() => undefined);
  if (showStatus) {
    await showOverlay(tab.id, {
      state: "success",
      title: "Answers captured",
      detail: "Similar future questions can now be filled from your saved answer memory.",
      result: { captured: result.captured, skipped: result.skipped.length, warnings: result.warnings },
    });
  }
  return result;
}

function normalizeBatchUrls(urls: string[]): string[] {
  const unique = new Set<string>();
  for (const raw of urls) {
    const value = raw.trim();
    if (!value) continue;
    try {
      const url = new URL(value);
      if (!/^https?:$/i.test(url.protocol)) continue;
      url.hash = "";
      unique.add(url.toString());
    } catch {
      // Ignore invalid pasted lines.
    }
  }
  return [...unique].slice(0, BATCH_LIMIT);
}

async function startBatchApply(urls: string[]): Promise<BatchApplyResult> {
  const queue = normalizeBatchUrls(urls);
  if (!queue.length) throw new Error("Paste at least one valid http or https job application URL.");
  if (!(await ensureFreshSession())) throw new Error("Please sign in to Jobpal.");
  await setEnabled(true);

  const results: BatchApplyItem[] = [];
  for (const [index, url] of queue.entries()) {
    const item: BatchApplyItem = {
      url,
      status: "failed",
      filled: 0,
      detected: 0,
      skipped: 0,
    };
    let tab: ExtensionTab | undefined;
    try {
      tab = await chrome.tabs.create({ url, active: true });
      if (!tab.id) throw new Error("Could not open tab.");
      await waitForTabReady(tab.id);
      await delay(900);
      const readyTab = await chrome.tabs.get(tab.id);
      await showOverlay(tab.id, {
        state: "loading",
        title: `Batch ${index + 1} of ${queue.length}`,
        detail: "Scanning and filling this application. Jobpal will not submit it.",
      });
      const result = await runMagicFill({ tab: readyTab, forceEnabled: true, showOverlay: true, includeCustomCv: false });
      item.status = "filled";
      item.filled = result.filled;
      item.detected = result.detected;
      item.skipped = result.skipped.length;
    } catch (err) {
      item.error = err instanceof Error ? err.message : "Batch fill failed.";
      if (tab?.id) {
        await showOverlay(tab.id, {
          state: "error",
          title: "Batch fill failed",
          detail: item.error,
        });
      }
    }
    results.push(item);
  }

  const result: BatchApplyResult = {
    total: queue.length,
    completed: results.filter((item) => item.status === "filled").length,
    failed: results.filter((item) => item.status === "failed").length,
    results,
  };
  await setLastBatch(result);
  return result;
}

async function startBatchApplyOnSelectedTabs(): Promise<BatchApplyResult> {
  const selected = await selectedFillableTabs();
  const queue = selected.slice(0, BATCH_LIMIT);
  if (queue.length < 2) {
    throw new Error("Select two or more job application tabs in Chrome before using Batch Apply.");
  }
  if (!(await ensureFreshSession())) throw new Error("Please sign in to Jobpal.");
  await setEnabled(true);

  const results: BatchApplyItem[] = [];
  for (const [index, selectedTab] of queue.entries()) {
    const item: BatchApplyItem = {
      url: selectedTab.url,
      title: selectedTab.title,
      status: "failed",
      filled: 0,
      detected: 0,
      skipped: 0,
    };
    try {
      await waitForTabReady(selectedTab.id);
      const tab = await chrome.tabs.get(selectedTab.id);
      await showOverlay(selectedTab.id, {
        state: "loading",
        title: `Batch ${index + 1} of ${queue.length}`,
        detail: "Scanning and filling this selected tab. Jobpal will not submit it.",
      });
      const result = await runMagicFill({ tab, forceEnabled: true, showOverlay: true, includeCustomCv: false });
      item.status = "filled";
      item.filled = result.filled;
      item.detected = result.detected;
      item.skipped = result.skipped.length;
    } catch (err) {
      item.error = err instanceof Error ? err.message : "Batch fill failed.";
      await showOverlay(selectedTab.id, {
        state: "error",
        title: "Batch fill failed",
        detail: item.error,
      });
    }
    results.push(item);
  }

  const result: BatchApplyResult = {
    total: queue.length,
    completed: results.filter((item) => item.status === "filled").length,
    failed: results.filter((item) => item.status === "failed").length,
    results,
  };
  await setLastBatch(result);
  return result;
}

async function getState(): Promise<PopupState> {
  const [enabled, includeCustomCv, includeCoverLetter, refreshed, stored, lastResult, lastCapture, lastBatch, tab, selectedTabs] = await Promise.all([
    getEnabled(),
    getMagicFillIncludeCv(),
    getMagicFillIncludeCoverLetter(),
    // Try to refresh the user summary, but never treat a network/server failure
    // as "signed out" — that would force the user to sign in again unnecessarily.
    refreshUserSummary().catch(() => null),
    // Always load the locally stored session as a fallback.
    getSession(),
    getLastResult(),
    getLastCapture(),
    getLastBatch(),
    activeTab().catch(() => undefined),
    selectedFillableTabs().catch(() => []),
  ]);
  // Prefer the freshly-loaded session; fall back to the stored one so the
  // signed-in state is preserved even when the web app is temporarily unreachable.
  const session = refreshed ?? stored;
  const jobContext = enabled ? await resolveJobContextWithActiveScan(tab).catch(() => undefined) : undefined;
  const lastGenerated = enabled ? await getScopedGeneratedForContext(jobContext, tab).catch(() => undefined) : undefined;
  return {
    enabled,
    signedIn: Boolean(session),
    user: session?.user ?? null,
    currentUrl: tab?.url,
    currentTitle: tab?.title,
    includeCustomCv,
    includeCoverLetter,
    selectedTabs,
    jobContext,
    lastGenerated,
    lastResult,
    lastCapture,
    lastBatch,
  };
}

chrome.runtime.onMessage.addListener((message: RuntimeRequest, sender, sendResponse) => {
  void (async () => {
    try {
      if (message.type === "GET_STATE") sendResponse(await getState());
      else if (message.type === "SET_ENABLED") {
        await setEnabled(message.enabled);
        if (message.enabled) {
          const tab = await activeTab().catch(() => undefined);
          if (tab) {
            await resolveJobContextWithActiveScan(tab).catch(() => undefined);
          }
        }
        sendResponse(await getState());
      }
      else if (message.type === "SET_MAGIC_FILL_INCLUDE_CV") {
        await setMagicFillIncludeCv(message.includeCustomCv);
        sendResponse(await getState());
      }
      else if (message.type === "SET_MAGIC_FILL_INCLUDE_COVER_LETTER") {
        await setMagicFillIncludeCoverLetter(message.includeCoverLetter);
        sendResponse(await getState());
      }
      else if (message.type === "SAVE_JOB") {
        const tab = await activeTab();
        const jobContext = await resolveJobContextWithActiveScan(tab).catch(() => undefined);
        await apiFetch("/api/extension/save-job", {
          method: "POST",
          body: JSON.stringify({
            url: tab.url,
            title: tab.title,
            role: jobContext?.context?.role,
            company: jobContext?.context?.company,
          }),
        });
        sendResponse({ ok: true });
      }
      else if (message.type === "SIGN_IN") {
        await signIn(message.mode);
        sendResponse(await getState());
      }
      else if (message.type === "SIGN_OUT") {
        await signOut();
        sendResponse(await getState());
      }
      else if (message.type === "CAPTURE_JOB_CONTEXT") {
        await rememberJobContext(message.snapshot, sender.tab);
        sendResponse({ ok: true });
      }
      else if (message.type === "CAPTURE_APPLY_CLICK") {
        await rememberApplyClick(message.snapshot, sender.tab, message.destinationUrl, message.linkText);
        sendResponse({ ok: true });
      }
      else if (message.type === "MAGIC_FILL") {
        const result = await runMagicFill({ showOverlay: true, includeCustomCv: message.includeCustomCv });
        if (message.includeCoverLetter) {
          generateDocumentFromActiveJob(true).catch(() => undefined);
        }
        sendResponse({ ...(await getState()), lastResult: result });
      }
      else if (message.type === "CAPTURE_ANSWERS") {
        const result = await captureAnswers(undefined, true);
        sendResponse({ ...(await getState()), lastCapture: result });
      }
      else if (message.type === "CAPTURE_ANSWERS_FROM_PAGE") {
        const result = await captureAnswers(sender.tab, true);
        sendResponse({ ...(await getState()), lastCapture: result });
      }
      else if (message.type === "FIND_CONTACTS") {
        const result = await findContactsForActiveJob();
        sendResponse({ ...(await getState()), contactRecommendations: result });
      }
      else if (message.type === "GENERATE_CUSTOM_CV") {
        const result = await generateDocumentFromActiveJob(false);
        sendResponse({ ...(await getState()), lastGenerated: result });
      }
      else if (message.type === "GENERATE_COVER_LETTER") {
        const result = await generateDocumentFromActiveJob(true);
        sendResponse({ ...(await getState()), lastGenerated: result });
      }
      else if (message.type === "DOWNLOAD_GENERATED_FILE") {
        await downloadGeneratedFile(message.kind);
        sendResponse(await getState());
      }
      else if (message.type === "START_BATCH_APPLY") {
        const result = await startBatchApply(message.urls);
        sendResponse({ ...(await getState()), lastBatch: result });
      }
      else if (message.type === "START_BATCH_SELECTED_TABS") {
        const result = await startBatchApplyOnSelectedTabs();
        sendResponse({ ...(await getState()), lastBatch: result });
      }
    } catch (err) {
      const messageText = err instanceof Error ? err.message : "Something went wrong.";
      const errorTab = sender.tab ?? (await activeTab().catch(() => undefined));
      if (errorTab?.id) {
        await showOverlay(errorTab.id, {
          state: "error",
          title: "Jobpal could not finish",
          detail: messageText,
        });
      }
      sendResponse({
        ...(await getState().catch(() => ({ enabled: false, includeCustomCv: true, includeCoverLetter: true, signedIn: false, user: null }))),
        error: messageText,
      });
    }
  })();
  return true;
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== "jobpal-magic-fill") return;
  void (async () => {
    let tab: ExtensionTab | undefined;
    try {
      tab = await activeTab();
      await setEnabled(true);
      await runMagicFill({ tab, forceEnabled: true, showOverlay: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Magic Fill failed.";
      if (tab?.id) {
        await showOverlay(tab.id, {
          state: "error",
          title: "Magic Fill failed",
          detail: message,
        });
      }
    }
  })();
});

chrome.tabs.onCreated.addListener((tab) => {
  void (async () => {
    if (!(await getEnabled())) return;
    if (!tab.id || !tab.openerTabId) return;
    const contexts = await getJobContexts();
    const source = contexts
      .filter((context) => context.tabId === tab.openerTabId)
      .sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt))[0];
    if (!source) return;
    await recordApplyTransition({
      id: `apply-${hashText([source.id, tab.id, tab.pendingUrl || tab.url || "", Date.now()].join("|"))}`,
      tabId: tab.id,
      sourceUrl: source.canonicalUrl,
      sourceContextId: source.id,
      destinationUrl: tab.pendingUrl || tab.url ? canonicalUrl(tab.pendingUrl || tab.url) : undefined,
      linkText: "New application tab",
      capturedAt: new Date().toISOString(),
    });
  })().catch(() => undefined);
});

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  void (async () => {
    if (info.status !== "complete" || !(await getEnabled())) return;
    if (!tab.url || !/^https?:/i.test(tab.url)) return;
    await delay(900);
    const latest = await chrome.tabs.get(tabId).catch(() => tab);
    const scanned = await collectTabJobContext(latest, "job_page");
    if (scanned) await rememberJobContext(scanned, latest).catch(() => undefined);
  })().catch(() => undefined);
});
