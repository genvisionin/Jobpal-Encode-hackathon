"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon, Spinner } from "@/components/ui";
import { changeTemplate, generateCoverLetterForCV } from "@/lib/api-client";
import { downloadCoverLetterPdf, downloadCvPdf } from "@/lib/download-pdf";
import { TEMPLATE_REGISTRY } from "@/lib/templates";
import type { StoredTailoredCV } from "@/lib/db/types";
import type { Contact, CoverLetter } from "@/lib/schema";
import { InsightsPanel } from "./InsightsPanel";
import { ResumeFrame } from "./ResumeFrame";

type ViewMode = "cv" | "letter";

function CoverLetterSheet({ letter, contact }: { letter: CoverLetter; contact: Contact }) {
  const name = contact.name || letter.signature;
  const contactItems = [
    contact.email,
    contact.phone,
    contact.location,
    contact.linkedin,
    contact.website,
  ].filter(Boolean);

  return (
    <div className="cover-letter-frame-host">
      <article
        className="cover-letter-page"
        style={{
          width: "100%",
          background: "#fff",
          color: "#111",
          minHeight: 1123,
          boxShadow: "var(--shadow-lg)",
          padding: "76px 82px",
          fontFamily: "Arial, Helvetica, sans-serif",
          fontSize: 14.5,
          lineHeight: 1.55,
        }}
      >
        <header style={{ borderBottom: "1px solid #d8d8d8", paddingBottom: 16, marginBottom: 30 }}>
          <h1 style={{ fontSize: 25, lineHeight: 1.2, margin: 0, fontWeight: 700 }}>
            {name || "Cover Letter"}
          </h1>
          {contactItems.length > 0 && (
            <div style={{ fontSize: 12.5, color: "#333", marginTop: 6 }}>
              {contactItems.join(" | ")}
            </div>
          )}
        </header>

        <div style={{ fontSize: 13, color: "#333", marginBottom: 24 }}>
          {letter.company} | {letter.role}
        </div>

        <p style={{ marginBottom: 16 }}>{letter.salutation}</p>
        <p style={{ marginBottom: 16 }}>{letter.opening}</p>

        {letter.highlights.length > 0 && (
          <ul style={{ margin: "0 0 18px", paddingLeft: 20 }}>
            {letter.highlights.map((h, i) => (
              <li key={i} style={{ marginBottom: 8 }}>
                {h}
              </li>
            ))}
          </ul>
        )}

        <p style={{ marginBottom: 16 }}>{letter.body}</p>
        <p style={{ marginBottom: 28 }}>{letter.closing}</p>
        <p style={{ whiteSpace: "pre-line" }}>{letter.signature || name}</p>
      </article>
    </div>
  );
}

function CoverLetterEmpty({
  busy,
  error,
  onGenerate,
}: {
  busy: boolean;
  error: string | null;
  onGenerate: () => void;
}) {
  return (
    <div style={{ width: "min(794px, 100%)", margin: "0 auto", padding: "22px 0" }}>
      <div
        className="glass-strong"
        style={{
          minHeight: 520,
          borderRadius: "var(--r-lg)",
          padding: 34,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          gap: 14,
        }}
      >
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            background: "var(--accent-soft)",
            color: "var(--accent-ink)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="mail" size={24} />
        </div>
        <div>
          <h2 style={{ fontSize: 21, marginBottom: 6 }}>Create a customized cover letter</h2>
          <p style={{ fontSize: 14, color: "var(--ink-3)", lineHeight: 1.55, maxWidth: 460 }}>
            We will use this tailored CV, the job description, and your proof points to draft a one-page letter for this role.
          </p>
        </div>
        {error && <div style={{ color: "#d6447a", fontSize: 13.5 }}>{error}</div>}
        <button className="btn btn-primary" onClick={onGenerate} disabled={busy}>
          {busy ? <Spinner size={16} color="#fff" /> : <Icon name="sparkle" size={16} />}
          {busy ? "Creating letter..." : "Create cover letter"}
        </button>
      </div>
    </div>
  );
}

function CoverLetterRail({
  letter,
  contact,
  error,
}: {
  letter?: CoverLetter;
  contact: Contact;
  error: string | null;
}) {
  return (
    <aside className="glass-strong" style={{ borderRadius: "var(--r-lg)", padding: 18 }}>
      <div className="label" style={{ marginBottom: 12 }}>
        Cover letter
      </div>
      {letter ? (
        <>
          <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" }}>
            {letter.wordCount || 0} words
          </div>
          <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 4 }}>
            Ready to download as a plain professional PDF using {contact.name || "the candidate"}&apos;s profile and this job&apos;s requirements.
          </div>
          {letter.keyEvidence.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Evidence used</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {letter.keyEvidence.slice(0, 5).map((e, i) => (
                  <div key={i} style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.4 }}>
                    {e}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <p style={{ fontSize: 13.5, color: "var(--ink-3)", lineHeight: 1.5 }}>
            No cover letter has been created yet. Use the center action to generate one, then the download button in the toolbar will unlock.
          </p>
          {error && <div style={{ color: "#d6447a", fontSize: 13, marginTop: 10 }}>{error}</div>}
        </>
      )}
    </aside>
  );
}

/**
 * CVViewer — the generated CV view. Renders the real populated template in
 * an iframe, supports switching templates live, and downloads via print.
 */
export function CVViewer({ cv: initial, showRanking = true }: { cv: StoredTailoredCV; showRanking?: boolean }) {
  const [cv, setCv] = useState(initial);
  const [templateId, setTemplateId] = useState(initial.templateId);
  const [picking, setPicking] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [view, setView] = useState<ViewMode>("cv");
  const [letterBusy, setLetterBusy] = useState(false);
  const [letterError, setLetterError] = useState<string | null>(null);
  const [downloadBusy, setDownloadBusy] = useState<ViewMode | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const renderSrc = `/api/cv/${cv.id}/render?template=${templateId}`;
  const date = new Date(cv.createdAt).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  async function pick(id: string) {
    setTemplateId(id);
    setPicking(false);
    setSavingTemplate(true);
    try {
      const result = await changeTemplate(cv.id, id);
      setCv(result.cv);
    } catch {
      // non-fatal, the preview already reflects the choice
    } finally {
      setSavingTemplate(false);
    }
  }

  async function downloadResume() {
    setDownloadBusy("cv");
    setDownloadError(null);
    try {
      await downloadCvPdf(cv.id, templateId);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : "Failed to download the PDF.");
    } finally {
      setDownloadBusy(null);
    }
  }

  async function downloadLetter() {
    if (!cv.coverLetter) return;
    setDownloadBusy("letter");
    setDownloadError(null);
    try {
      await downloadCoverLetterPdf(cv.id);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : "Failed to download the PDF.");
    } finally {
      setDownloadBusy(null);
    }
  }

  async function createLetter() {
    setLetterBusy(true);
    setLetterError(null);
    try {
      const result = await generateCoverLetterForCV(cv.id);
      setCv(result.cv);
      setView("letter");
    } catch (err) {
      setLetterError(err instanceof Error ? err.message : "Failed to create the cover letter.");
    } finally {
      setLetterBusy(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column" }}>
      <div
        className="glass cv-toolbar"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "14px 24px",
          borderRadius: 0,
          borderLeft: "none",
          borderRight: "none",
          borderTop: "none",
          flexWrap: "wrap",
          position: "relative",
          zIndex: 3,
        }}
      >
        <Link href="/customize" className="btn btn-ghost btn-sm cv-back">
          <Icon name="chevron" size={16} style={{ transform: "rotate(180deg)" }} /> Back
        </Link>
        <div className="cv-toolbar-meta" style={{ display: "flex", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 15.5, fontWeight: 600 }}>
              {cv.company} — {cv.role}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
              Tailored {date}
              {savingTemplate ? " · saving template..." : ""}
            </div>
          </div>
        </div>
        <div className="cv-toolbar-spacer" style={{ flex: 1 }} />

        <div className="cv-template-control" style={{ position: "relative" }}>
          <button
            className="btn btn-glass btn-sm"
            onClick={() => view === "cv" && setPicking((p) => !p)}
            disabled={view !== "cv"}
            title={view === "cv" ? "Change resume template" : "Templates only apply to the CV"}
            style={{ minWidth: 154, justifyContent: "center", opacity: view === "cv" ? 1 : 0.55 }}
          >
            {savingTemplate ? <Spinner size={15} /> : <Icon name="grid" size={15} />} Change template
            <Icon name="chevronD" size={13} style={{ opacity: 0.5 }} />
          </button>
          {picking && view === "cv" && (
            <div
              className="glass-strong"
              style={{
                position: "absolute",
                top: "calc(100% + 8px)",
                right: 0,
                width: 220,
                borderRadius: "var(--r-md)",
                padding: 8,
                zIndex: 10,
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              {TEMPLATE_REGISTRY.map((t) => (
                <button
                  key={t.id}
                  onClick={() => pick(t.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "9px 11px",
                    borderRadius: "var(--r-sm)",
                    border: "none",
                    cursor: "pointer",
                    fontFamily: "var(--sans)",
                    fontSize: 14,
                    textAlign: "left",
                    background: t.id === templateId ? "var(--accent-soft)" : "transparent",
                    color: t.id === templateId ? "var(--accent-ink)" : "var(--ink-2)",
                  }}
                >
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: t.accent }} />
                  <span style={{ flex: 1 }}>{t.name}</span>
                  {t.id === templateId && <Icon name="check" size={14} />}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="seg cv-mode-switch" style={{ padding: 3 }}>
          <button className={view === "cv" ? "on" : ""} onClick={() => setView("cv")}>
            <Icon name="doc" size={14} /> CV
          </button>
          <button className={view === "letter" ? "on" : ""} onClick={() => setView("letter")}>
            <Icon name="mail" size={14} /> Cover letter
          </button>
        </div>

        <div className="cv-download-control">
          {view === "cv" ? (
            <button className="btn btn-primary btn-sm" onClick={downloadResume} disabled={downloadBusy === "cv"}>
              {downloadBusy === "cv" ? <Spinner size={15} color="#fff" /> : <Icon name="download" size={15} />}
              Download PDF
            </button>
          ) : (
            <button
              className="btn btn-primary btn-sm"
              onClick={downloadLetter}
              disabled={!cv.coverLetter || downloadBusy === "letter"}
              title={cv.coverLetter ? "Download PDF" : "Create the cover letter first"}
              style={{ minWidth: 142, justifyContent: "center", opacity: cv.coverLetter ? 1 : 0.55 }}
            >
              {downloadBusy === "letter" ? <Spinner size={15} color="#fff" /> : <Icon name="download" size={15} />}
              Download PDF
            </button>
          )}
        </div>
        {downloadError && (
          <div className="cv-download-error" style={{ fontSize: 12.5, color: "#d6447a", flexBasis: "100%", textAlign: "right" }}>
            {downloadError}
          </div>
        )}
      </div>

      <div className="cv-body">
        <div className="cv-paper">
          {view === "cv" ? (
            <ResumeFrame src={renderSrc} />
          ) : cv.coverLetter ? (
            <CoverLetterSheet letter={cv.coverLetter} contact={cv.resume.contact} />
          ) : (
            <CoverLetterEmpty busy={letterBusy} error={letterError} onGenerate={createLetter} />
          )}
        </div>
        <div className="cv-rail">
          {view === "cv" ? (
            <InsightsPanel
              matchScore={cv.matchScore}
              company={cv.company}
              archetype={cv.archetype}
              archetypeRationale={cv.archetypeRationale}
              scoreBreakdown={cv.scoreBreakdown}
              requirementMatches={cv.requirementMatches}
              customizationPlan={cv.customizationPlan}
              changes={cv.changes}
              keywordCoverage={cv.keywordCoverage}
              sourceUrl={cv.job.sourceUrl}
              locked={!showRanking}
            />
          ) : (
            <CoverLetterRail
              letter={cv.coverLetter}
              contact={cv.resume.contact}
              error={letterError}
            />
          )}
        </div>
      </div>
    </div>
  );
}
