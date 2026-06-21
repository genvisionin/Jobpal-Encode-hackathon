import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { ContactRecommendation, PopupState, RuntimeRequest } from "../shared/types";
import "./popup.css";

// ── Icons ──────────────────────────────────────────────────────────
function IconUser() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="7" r="4" />
      <path d="M3 17.5a7 7 0 0 1 14 0" />
    </svg>
  );
}

function IconBriefcase() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="16" height="10" rx="2" />
      <path d="M7 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function IconFile() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 2H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7z" />
      <polyline points="11 2 11 7 16 7" />
      <line x1="7" y1="11" x2="13" y2="11" />
      <line x1="7" y1="14" x2="11" y2="14" />
    </svg>
  );
}

function IconMail() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="16" height="12" rx="2" />
      <polyline points="2 7 10 12 18 7" />
    </svg>
  );
}

function IconSparkles() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor">
      <path d="M10 2 L11.8 7.5 L17.5 9 L11.8 10.5 L10 16 L8.2 10.5 L2.5 9 L8.2 7.5 Z" />
      <path d="M16 13 L16.9 15.6 L19.5 16.5 L16.9 17.4 L16 20 L15.1 17.4 L12.5 16.5 L15.1 15.6 Z" opacity="0.6" />
      <path d="M4.5 1 L5.1 2.8 L7 3.4 L5.1 4 L4.5 5.8 L3.9 4 L2 3.4 L3.9 2.8 Z" opacity="0.45" />
    </svg>
  );
}

function IconCapture() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7.5V5a2 2 0 0 1 2-2h2.5M13.5 3H15a2 2 0 0 1 2 2v2.5M17 12.5V15a2 2 0 0 1-2 2h-2.5M6.5 17H5a2 2 0 0 1-2-2v-2.5" />
      <circle cx="10" cy="10" r="2.5" />
    </svg>
  );
}

function IconLayers() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="10 2 18 6.5 10 11 2 6.5" />
      <polyline points="2 10.5 10 15 18 10.5" />
      <polyline points="2 14.5 10 19 18 14.5" />
    </svg>
  );
}

function IconDownload() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 3v9" />
      <polyline points="7 10 10 13 13 10" />
      <path d="M3 15v1.5A1.5 1.5 0 0 0 4.5 18h11A1.5 1.5 0 0 0 17 16.5V15" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="2 6 5 9 10 3" />
    </svg>
  );
}

function IconBookmark() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 3h10a1 1 0 0 1 1 1v13l-6-4-6 4V4a1 1 0 0 1 1-1z" />
    </svg>
  );
}

function IconInfo() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="8" />
      <line x1="10" y1="9" x2="10" y2="14" />
      <circle cx="10" cy="6.5" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconChevronDown() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 6 8 10 12 6" />
    </svg>
  );
}

function IconLinkedIn() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.45 20.45h-3.55v-5.56c0-1.33-.02-3.03-1.85-3.03-1.85 0-2.13 1.45-2.13 2.94v5.65H9.37V9h3.41v1.56h.05c.47-.9 1.64-1.85 3.37-1.85 3.6 0 4.26 2.37 4.26 5.45v6.29ZM5.36 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12Zm1.78 13.02H3.57V9h3.57v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0Z" />
    </svg>
  );
}

// ── Helpers ────────────────────────────────────────────────────────
function send<T>(message: RuntimeRequest): Promise<T> {
  return chrome.runtime.sendMessage(message).then((response) => {
    if (response?.error) throw new Error(String(response.error));
    return response as T;
  });
}

const emptyState: PopupState = {
  enabled: false,
  includeCustomCv: true,
  includeCoverLetter: true,
  signedIn: false,
  user: null,
};

function hostFrom(url?: string): string {
  if (!url) return "Current tab";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Current tab";
  }
}

function contactTypeLabel(type: ContactRecommendation["contactType"]): string {
  if (type === "recruiter") return "Recruiter";
  if (type === "hiring_manager") return "Hiring manager";
  if (type === "team_lead") return "Team lead";
  if (type === "exec") return "Executive";
  return "Team contact";
}

// ── Result card ────────────────────────────────────────────────────
interface ResultCardProps {
  state: PopupState;
  busy: string | null;
  focus: string | null;
  onCapture: () => void;
}

function CapturedCard({ captured }: { captured: number }) {
  return (
    <div className="result-card">
      <div className="result-head">
        <span className="result-icon"><IconCheck /></span>
        <span className="result-title">Answers captured</span>
      </div>
      <p className="result-detail">
        {captured} field answer{captured !== 1 ? "s" : ""} saved. Jobpal will reuse these for similar
        questions next time.
      </p>
    </div>
  );
}

function BatchCard({ completed, total, failed }: { completed: number; total: number; failed: number }) {
  return (
    <div className="result-card">
      <div className="result-head">
        <span className="result-icon"><IconCheck /></span>
        <span className="result-title">Batch complete</span>
      </div>
      <p className="result-detail">
        {completed} of {total} tab{total !== 1 ? "s" : ""} filled
        {failed > 0 ? `, ${failed} failed` : ""}.
      </p>
    </div>
  );
}

function ResultCard({ state, busy, focus, onCapture }: ResultCardProps) {
  if (state.error) {
    return (
      <div className="result-card error">
        <div className="result-head">
          <span className="result-icon"><IconCheck /></span>
          <span className="result-title">Something went wrong</span>
        </div>
        <p className="result-detail">{state.error}</p>
      </div>
    );
  }

  if (focus === "capture" && state.lastCapture) return <CapturedCard captured={state.lastCapture.captured} />;
  if (focus === "batch" && state.lastBatch) {
    return <BatchCard completed={state.lastBatch.completed} total={state.lastBatch.total} failed={state.lastBatch.failed} />;
  }

  if (state.lastResult) {
    const r = state.lastResult;
    const skipped = r.skipped?.length ?? 0;
    return (
      <div className="result-card">
        <div className="result-head">
          <span className="result-icon"><IconCheck /></span>
          <span className="result-title">Magic Fill complete</span>
        </div>
        <p className="result-detail">
          Review the page before submitting. Edit anything you want, then capture corrections so Jobpal
          learns for next time.
        </p>
        <div className="result-stats">
          <div className="result-stat"><strong>{r.detected}</strong><span>Detected</span></div>
          <div className="result-stat filled"><strong>{r.filled}</strong><span>Filled</span></div>
          <div className="result-stat"><strong>{skipped}</strong><span>Skipped</span></div>
        </div>
        <button className={`btn-capture${busy === "capture" ? " working" : ""}`} disabled={Boolean(busy)} onClick={onCapture}>
          {busy === "capture" ? (
            <><span className="spinner" />Capturing…</>
          ) : (
            <><IconCapture />Capture Corrections</>
          )}
        </button>
      </div>
    );
  }

  if (state.lastCapture) return <CapturedCard captured={state.lastCapture.captured} />;
  if (state.lastBatch) {
    return <BatchCard completed={state.lastBatch.completed} total={state.lastBatch.total} failed={state.lastBatch.failed} />;
  }

  return null;
}

function ContactCard({ contact, disabled }: { contact: ContactRecommendation; disabled: boolean }) {
  const confidence = Math.round(contact.confidence * 100);
  const evidence = contact.evidence[0]?.snippet;
  return (
    <article className="contact-card">
      <div className="contact-main">
        <div className="contact-avatar">{contact.name.trim().charAt(0).toUpperCase() || "J"}</div>
        <div className="contact-copy">
          <strong>{contact.name}</strong>
          <span>{contact.title}</span>
        </div>
        <button
          className="contact-link"
          type="button"
          aria-label={`Open ${contact.name} on LinkedIn`}
          title="Open LinkedIn"
          disabled={disabled}
          onClick={() => void chrome.tabs.create({ url: contact.linkedinUrl, active: true })}
        >
          <IconLinkedIn />
        </button>
      </div>
      <div className="contact-meta">
        <span>{contactTypeLabel(contact.contactType)}</span>
        <span>{confidence}% match</span>
      </div>
      <p className="contact-reason">{contact.reason}</p>
      {evidence && <p className="contact-evidence">{evidence}</p>}
    </article>
  );
}

// ── App ────────────────────────────────────────────────────────────
function App() {
  const [state, setState] = useState<PopupState>(emptyState);
  const [busy, setBusy] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [batchExpanded, setBatchExpanded] = useState(false);
  const [contactsExpanded, setContactsExpanded] = useState(false);

  async function refresh() {
    const next = await send<PopupState>({ type: "GET_STATE" });
    // Always enable for signed-in users — no manual toggle needed
    if (next.signedIn && !next.enabled) {
      await send({ type: "SET_ENABLED", enabled: true }).catch(() => undefined);
      const updated = await send<PopupState>({ type: "GET_STATE" });
      setState(updated);
    } else {
      setState(next);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const selectedTabs = state.selectedTabs ?? [];
  const batchReady = selectedTabs.length > 1;

  useEffect(() => {
    if (batchReady) setBatchExpanded(true);
  }, [batchReady]);

  async function run<T>(label: string, fn: () => Promise<T>) {
    setBusy(label);
    setState((s) => ({ ...s, error: undefined }));
    try {
      const result = await fn();
      setFocus(label);
      if (result && typeof result === "object" && "signedIn" in result && "enabled" in result) {
        setState(result as unknown as PopupState);
      } else {
        await refresh();
      }
    } catch (err) {
      setState((s) => ({
        ...s,
        error: err instanceof Error ? err.message : "Jobpal could not finish.",
      }));
    } finally {
      setBusy(null);
    }
  }

  async function setMagicFillIncludeCv(includeCustomCv: boolean) {
    setState((s) => ({ ...s, includeCustomCv, error: undefined }));
    try {
      const next = await send<PopupState>({ type: "SET_MAGIC_FILL_INCLUDE_CV", includeCustomCv });
      setState(next);
    } catch {
      setState((s) => ({ ...s, includeCustomCv: !includeCustomCv }));
    }
  }

  async function setMagicFillIncludeCoverLetter(includeCoverLetter: boolean) {
    setState((s) => ({ ...s, includeCoverLetter, error: undefined }));
    try {
      const next = await send<PopupState>({ type: "SET_MAGIC_FILL_INCLUDE_COVER_LETTER", includeCoverLetter });
      setState(next);
    } catch {
      setState((s) => ({ ...s, includeCoverLetter: !includeCoverLetter }));
    }
  }

  async function saveJob() {
    setSaveState("saving");
    try {
      await send({ type: "SAVE_JOB" });
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2500);
    } catch {
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 3000);
    }
  }

  async function toggleContacts() {
    const nextOpen = !contactsExpanded;
    setContactsExpanded(nextOpen);
    if (!nextOpen) return;
    await run("contacts", () => send({ type: "FIND_CONTACTS" }));
  }

  const loading = Boolean(busy);
  const userInitial = (state.user?.name || state.user?.email || "J").trim().charAt(0).toUpperCase();

  const resolvedJob = state.jobContext?.context;
  const jobContextReady = Boolean(resolvedJob && (state.jobContext?.confidence ?? 0) >= 0.72);
  const generated = state.lastGenerated;
  const customCvReady = Boolean(generated?.cvDownloadPath);
  const coverLetterReady = Boolean(generated?.coverLetterDownloadPath);
  const contacts = state.contactRecommendations;

  // Magic Fill works for general form filling even without job context.
  // Custom CV and Cover Letter require a captured job description.
  const canMagicFill = Boolean(state.user?.hasProfile);
  const canGenerateDocs = canMagicFill && jobContextReady;

  return (
    <main className="shell">

      {/* ── Header ── */}
      <header className="top">
        <div className="brand">
          <div className="mark">J</div>
          <div className="brand-text">
            <h1>Jobpal</h1>
            <p>Magic Fill</p>
          </div>
        </div>

        {state.signedIn && (
          <div className="profile-menu">
            <button
              className="avatar"
              type="button"
              aria-label="Profile menu"
              aria-expanded={profileOpen}
              disabled={loading}
              onClick={() => setProfileOpen((v) => !v)}
            >
              {userInitial}
            </button>

            {profileOpen && (
              <div className="profile-popover">
                <strong>{state.user?.name || "Jobpal user"}</strong>
                <span>{state.user?.email}</span>
                {state.user?.title && <em>{state.user.title}</em>}
                <button
                  disabled={loading}
                  onClick={() => {
                    setProfileOpen(false);
                    void run("signout", () => send({ type: "SIGN_OUT" }));
                  }}
                >
                  {busy === "signout" ? "Signing out…" : "Sign out"}
                </button>
              </div>
            )}
          </div>
        )}
      </header>

      {/* ── Signed-out ── */}
      {!state.signedIn ? (
        <section className="signed-out-panel">
          <div className="signed-out-hero">
            <IconUser />
          </div>
          <h2>Sign in to Jobpal</h2>
          <p>
            Fill job applications instantly using your saved resume and career profile.
          </p>
          <div className="auth-actions">
            <button
              className="btn btn-primary"
              disabled={loading}
              onClick={() => run("signin", () => send({ type: "SIGN_IN", mode: "signin" }))}
            >
              {busy === "signin" ? <><span className="spinner" />Opening…</> : "Sign in"}
            </button>
            <button
              className="btn btn-ghost"
              disabled={loading}
              onClick={() => run("signup", () => send({ type: "SIGN_IN", mode: "signup" }))}
            >
              {busy === "signup" ? <><span className="spinner" />Opening…</> : "Create account"}
            </button>
          </div>
        </section>
      ) : (
        <>
          {/* ── Save Job ── */}
          <div className="save-job-row">
            <button
              className={`btn-save-job${saveState === "saved" ? " saved" : ""}${saveState === "error" ? " error" : ""}`}
              disabled={loading || saveState === "saving"}
              onClick={saveJob}
            >
              {saveState === "saving" ? (
                <><span className="spinner" />Saving…</>
              ) : saveState === "saved" ? (
                <><IconCheck />Job Saved!</>
              ) : saveState === "error" ? (
                "Could not save — try again"
              ) : (
                <><IconBookmark />Save Job</>
              )}
            </button>
          </div>

          {/* ── Contact finder ── */}
          <section className={`card contacts-card${contactsExpanded ? " expanded" : ""}`}>
            <button
              className="contacts-head"
              type="button"
              disabled={loading && busy !== "contacts"}
              aria-expanded={contactsExpanded}
              onClick={() => void toggleContacts()}
            >
              <span className="contacts-icon"><IconLinkedIn /></span>
              <span className="contacts-title">
                <strong>Right person to contact</strong>
                <span>
                  {jobContextReady && resolvedJob
                    ? [resolvedJob.company, resolvedJob.role].filter(Boolean).join(" · ")
                    : "Open a job posting first"}
                </span>
              </span>
              <span className={`contacts-chevron${contactsExpanded ? " open" : ""}`}>
                <IconChevronDown />
              </span>
            </button>

            {contactsExpanded && (
              <div className="contacts-body">
                {busy === "contacts" ? (
                  <div className="contacts-loading">
                    <span className="spinner" />
                    <span>Finding recruiters and team leads…</span>
                  </div>
                ) : contacts?.contacts.length ? (
                  <div className="contacts-list">
                    {contacts.contacts.map((contact) => (
                      <ContactCard key={contact.id} contact={contact} disabled={loading} />
                    ))}
                  </div>
                ) : contacts?.warnings.length ? (
                  <div className="contacts-empty">
                    {contacts.warnings[0]}
                  </div>
                ) : (
                  <div className="contacts-empty">
                    Click to find recruiters, hiring managers, or team leads for this role.
                  </div>
                )}
              </div>
            )}
          </section>

          {/* ── Result card ── */}
          <ResultCard
            state={state}
            busy={busy}
            focus={focus}
            onCapture={() => run("capture", () => send({ type: "CAPTURE_ANSWERS" }))}
          />

          {/* ── Magic Fill card ── */}
          <section className="card magic-card">
            <div className="magic-card-header">
              <span className="magic-card-icon"><IconSparkles /></span>
              <span className="magic-card-title">Magic Fill</span>
              {!state.user?.hasProfile && (
                <span className="magic-card-hint">Add resume to enable</span>
              )}
            </div>

            {/* Option tiles — only active when job context is captured */}
            <div className="magic-options">
              <button
                className={`magic-option-tile${state.includeCustomCv && canGenerateDocs ? " on" : ""}${!canGenerateDocs ? " locked" : ""}`}
                disabled={loading || !canGenerateDocs}
                onClick={() => void setMagicFillIncludeCv(!state.includeCustomCv)}
                aria-pressed={state.includeCustomCv && canGenerateDocs}
                title={!canGenerateDocs ? "Open a job posting first — Jobpal needs the role description to tailor your CV" : undefined}
              >
                <div className="option-tile-top">
                  <span className="option-icon"><IconFile /></span>
                  <span className={`option-check${state.includeCustomCv && canGenerateDocs ? " on" : ""}`}>
                    {state.includeCustomCv && canGenerateDocs && <IconCheck />}
                  </span>
                </div>
                <div className="option-text">
                  <strong>Custom CV</strong>
                  <span>Tailored for this role</span>
                </div>
              </button>

              <button
                className={`magic-option-tile${state.includeCoverLetter && canGenerateDocs ? " on" : ""}${!canGenerateDocs ? " locked" : ""}`}
                disabled={loading || !canGenerateDocs}
                onClick={() => void setMagicFillIncludeCoverLetter(!state.includeCoverLetter)}
                aria-pressed={state.includeCoverLetter && canGenerateDocs}
                title={!canGenerateDocs ? "Open a job posting first — Jobpal needs the role description to write your cover letter" : undefined}
              >
                <div className="option-tile-top">
                  <span className="option-icon"><IconMail /></span>
                  <span className={`option-check${state.includeCoverLetter && canGenerateDocs ? " on" : ""}`}>
                    {state.includeCoverLetter && canGenerateDocs && <IconCheck />}
                  </span>
                </div>
                <div className="option-text">
                  <strong>Cover Letter</strong>
                  <span>Personalized draft</span>
                </div>
              </button>
            </div>

            {/* Context hint when no job description captured */}
            {!jobContextReady && canMagicFill && (
              <p className="docs-hint">
                Open a job posting to enable Custom CV & Cover Letter
              </p>
            )}

            {/* Generated documents list */}
            {generated && (customCvReady || coverLetterReady) && (
              <div className="generated-docs">
                <div className="generated-for">
                  <span className="generated-for-label">Generated for</span>
                  <span className="generated-for-role">
                    {[generated.role, generated.company].filter(Boolean).join(" · ") || "this role"}
                  </span>
                </div>
                <div className="generated-items">
                  {customCvReady && (
                    <button
                      className={`generated-item${busy === "download-cv" ? " working" : ""}`}
                      disabled={loading}
                      onClick={() => run("download-cv", () => send({ type: "DOWNLOAD_GENERATED_FILE", kind: "cv" }))}
                    >
                      <span className="gi-icon"><IconFile /></span>
                      <span className="gi-name">Custom CV</span>
                      <span className="gi-action">
                        {busy === "download-cv" ? <span className="spinner" /> : <IconDownload />}
                      </span>
                    </button>
                  )}
                  {coverLetterReady && (
                    <button
                      className={`generated-item${busy === "download-cover" ? " working" : ""}`}
                      disabled={loading}
                      onClick={() => run("download-cover", () => send({ type: "DOWNLOAD_GENERATED_FILE", kind: "coverLetter" }))}
                    >
                      <span className="gi-icon"><IconMail /></span>
                      <span className="gi-name">Cover Letter</span>
                      <span className="gi-action">
                        {busy === "download-cover" ? <span className="spinner" /> : <IconDownload />}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Magic Fill button */}
            <button
              className={`btn-magic${busy === "magic" ? " working" : ""}`}
              disabled={loading || !canMagicFill}
              onClick={() =>
                run("magic", () =>
                  send({
                    type: "MAGIC_FILL",
                    includeCustomCv: canGenerateDocs && state.includeCustomCv,
                    includeCoverLetter: canGenerateDocs && state.includeCoverLetter,
                  })
                )
              }
            >
              {busy === "magic" ? (
                <>
                  <span className="spinner" />
                  {canGenerateDocs && state.includeCustomCv ? "Preparing CV…" : "Filling form…"}
                </>
              ) : (
                <>
                  <IconSparkles />
                  Magic Fill
                </>
              )}
            </button>
          </section>

          {/* ── Batch Apply ── */}
          <section className={`card batch-card${batchExpanded ? " expanded" : ""}`}>
            <div className="batch-head" onClick={() => setBatchExpanded((v) => !v)} role="button" tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && setBatchExpanded((v) => !v)}>
              <span className="batch-icon"><IconLayers /></span>
              <div className="batch-info">
                <strong>Batch Apply</strong>
                <span>
                  {batchReady
                    ? `${selectedTabs.length} tabs selected`
                    : "Select multiple tabs in Chrome"}
                </span>
              </div>
              <div
                className="batch-help"
                title="How to use: hold Ctrl (or Cmd on Mac) and click multiple browser tabs to select them. Once selected, the tabs appear here. Click Run Batch to auto-fill all job applications simultaneously."
                onClick={(e) => e.stopPropagation()}
              >
                <IconInfo />
              </div>
              <span className={`batch-chevron${batchExpanded ? " open" : ""}`}>
                <IconChevronDown />
              </span>
            </div>

            {batchExpanded && (
              <div className="batch-body">
                {selectedTabs.length > 0 ? (
                  <div className="tab-chips">
                    {selectedTabs.slice(0, 5).map((tab) => (
                      <span key={tab.id} className="tab-chip" title={tab.title || tab.url}>
                        {hostFrom(tab.url)}
                      </span>
                    ))}
                    {selectedTabs.length > 5 && (
                      <span className="tab-chip">+{selectedTabs.length - 5} more</span>
                    )}
                  </div>
                ) : (
                  <p className="batch-empty">
                    Hold <kbd>Ctrl</kbd> (or <kbd>⌘</kbd> on Mac) and click multiple tabs in your browser to select them, then they&apos;ll appear here.
                  </p>
                )}
                <button
                  className={`batch-run-btn${busy === "batch" ? " working" : ""}`}
                  disabled={loading || !batchReady || !state.user?.hasProfile}
                  onClick={(e) => {
                    e.stopPropagation();
                    void run("batch", () => send({ type: "START_BATCH_SELECTED_TABS" }));
                  }}
                >
                  {busy === "batch" ? (
                    <><span className="spinner" />Running…</>
                  ) : (
                    "Run Batch"
                  )}
                </button>
              </div>
            )}
          </section>

          {/* ── Profile hint ── */}
          {!state.user?.hasProfile && (
            <p className="hint">Add your resume in Jobpal to enable Magic Fill.</p>
          )}
        </>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
