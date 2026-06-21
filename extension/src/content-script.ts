import { applyFillPlan, attachResumeFile, collectJobContextSnapshot, collectPage, findResumeUploadField } from "./content/detector";
import type { ContentRequest, RuntimeRequest } from "./shared/types";

const ENABLED_STORAGE_KEY = "jobpal.enabled";

let captureBaseline: Map<string, string> | null = null;
let contextCaptureTimer: number | undefined;


function normalizedFieldValue(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function rememberCaptureBaseline(): void {
  const page = collectPage();
  captureBaseline = new Map(page.fields.map((field) => [field.id, normalizedFieldValue(field.value)]));
}

function collectPageForCapture(changedOnly = false) {
  const page = collectPage();
  if (!changedOnly || !captureBaseline) return page;
  return {
    ...page,
    fields: page.fields.filter((field) => {
      const current = normalizedFieldValue(field.value);
      if (!current) return false;
      return captureBaseline?.get(field.id) !== current;
    }),
  };
}

function sendRuntime(message: RuntimeRequest): void {
  try {
    chrome.runtime.sendMessage(message, () => {
      void chrome.runtime.lastError;
    });
  } catch {
    // The page may outlive the extension context during reloads.
  }
}

function clickableFromEvent(event: MouseEvent): HTMLElement | null {
  const path = event.composedPath();
  for (const item of path) {
    if (!(item instanceof HTMLElement)) continue;
    if (item.matches("a, button, [role='button'], input[type='button'], input[type='submit']")) return item;
  }
  return null;
}

function clickText(el: HTMLElement): string {
  if (el instanceof HTMLInputElement) return el.value || el.getAttribute("aria-label") || "";
  return el.innerText || el.textContent || el.getAttribute("aria-label") || el.getAttribute("title") || "";
}

function clickHref(el: HTMLElement): string | undefined {
  if (el instanceof HTMLAnchorElement && el.href) return el.href;
  const anchor = el.closest("a[href]");
  return anchor instanceof HTMLAnchorElement ? anchor.href : undefined;
}

function isApplyClick(el: HTMLElement): boolean {
  return /\b(apply|start application|submit application|quick apply)\b/i.test(clickText(el));
}

async function extensionEnabled(): Promise<boolean> {
  return chrome.storage.local.get(ENABLED_STORAGE_KEY).then((data) => Boolean(data[ENABLED_STORAGE_KEY]));
}

async function maybeCaptureJobContext(source: "job_page" | "application_page" = "job_page"): Promise<void> {
  if (!(await extensionEnabled().catch(() => false))) return;
  const snapshot = collectJobContextSnapshot(source);
  if (!snapshot) return;
  sendRuntime({ type: "CAPTURE_JOB_CONTEXT", snapshot });
}

function captureApplyClick(event: MouseEvent): void {
  const target = clickableFromEvent(event);
  if (!target || !isApplyClick(target)) return;
  const snapshot = collectJobContextSnapshot("apply_click");
  if (!snapshot) return;
  const destinationUrl = clickHref(target);
  sendRuntime({
    type: "CAPTURE_APPLY_CLICK",
    snapshot: { ...snapshot, destinationUrl },
    destinationUrl,
    linkText: clickText(target).replace(/\s+/g, " ").trim().slice(0, 120),
  });
}

function scheduleContextCapture(): void {
  window.clearTimeout(contextCaptureTimer);
  contextCaptureTimer = window.setTimeout(() => void maybeCaptureJobContext("job_page"), 450);
  window.setTimeout(() => void maybeCaptureJobContext("job_page"), 900);
  window.setTimeout(() => void maybeCaptureJobContext("job_page"), 2600);
}

function watchLateJobContent(): void {
  const target = document.body || document.documentElement;
  if (!target) return;
  const observer = new MutationObserver(() => {
    window.clearTimeout(contextCaptureTimer);
    contextCaptureTimer = window.setTimeout(() => void maybeCaptureJobContext("job_page"), 700);
  });
  observer.observe(target, { childList: true, subtree: true, characterData: true });
  window.setTimeout(() => observer.disconnect(), 20_000);
}


if (!window.__JOBPAL_MAGIC_FILL_READY__) {
  window.__JOBPAL_MAGIC_FILL_READY__ = true;
  chrome.runtime.onMessage.addListener((message: ContentRequest, _sender, sendResponse) => {
    try {
      if (message.type === "COLLECT_FIELDS") {
        sendResponse(collectPageForCapture(Boolean(message.changedOnly)));
        return false;
      }
      if (message.type === "COLLECT_JOB_CONTEXT") {
        sendResponse(collectJobContextSnapshot(message.source ?? "application_page"));
        return false;
      }
      if (message.type === "FIND_RESUME_UPLOAD_FIELD") {
        sendResponse(findResumeUploadField());
        return false;
      }
      if (message.type === "ATTACH_RESUME_FILE") {
        sendResponse(attachResumeFile(message));
        return false;
      }
      if (message.type === "APPLY_FILL_PLAN") {
        applyFillPlan(message.plan)
          .then((result) => {
            rememberCaptureBaseline();
            sendResponse(result);
          })
          .catch((err) => {
            sendResponse({ error: err instanceof Error ? err.message : "Could not apply answers." });
          });
        return true;
      }
      if (message.type === "REMEMBER_CAPTURE_BASELINE") {
        rememberCaptureBaseline();
        sendResponse({ ok: true });
        return false;
      }
    } catch (err) {
      sendResponse({ error: err instanceof Error ? err.message : "Content script failed." });
      return false;
    }
    return false;
  });
  document.addEventListener("click", captureApplyClick, true);
  window.addEventListener("pageshow", scheduleContextCapture);
  window.addEventListener("popstate", scheduleContextCapture);
  window.addEventListener("hashchange", scheduleContextCapture);
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes[ENABLED_STORAGE_KEY]?.newValue === true) {
      scheduleContextCapture();
      watchLateJobContent();
    }
  });
  scheduleContextCapture();
  watchLateJobContent();
}

declare global {
  interface Window {
    __JOBPAL_MAGIC_FILL_READY__?: boolean;
  }
}
