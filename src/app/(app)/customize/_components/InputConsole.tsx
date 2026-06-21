"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon, Spinner, ProcessingOverlay, Toggle, type ProcessingStep } from "@/components/ui";
import { customize, getBilling, ApiError, type BillingStatus } from "@/lib/api-client";
import { getTemplate, DEFAULT_TEMPLATE_ID } from "@/lib/templates";
import {
  LEGACY_TEMPLATE_STORAGE_KEYS,
  TemplatePickerModal,
  TEMPLATE_STORAGE_KEY,
} from "./TemplatePickerModal";

type Mode = "text" | "url";

/** The narrated steps shown while the model tailors the resume. */
const TAILOR_STEPS: ProcessingStep[] = [
  { icon: "doc", label: "Reading the job description" },
  { icon: "search", label: "Pinpointing what this role rewards" },
  { icon: "user", label: "Matching it against your experience" },
  { icon: "sparkle", label: "Rewriting your resume for the role" },
  { icon: "check", label: "Scoring the fit and finishing up" },
];

/**
 * InputConsole — the Customize CV entry point. Paste a job description or a
 * job link, pick a template, and generate a tailored resume.
 */
export function InputConsole({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const prefillJd = params.get("jd");
  const [mode, setMode] = useState<Mode>("text");
  const [text, setText] = useState(prefillJd ?? "");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsProfile, setNeedsProfile] = useState(false);
  const [quotaHit, setQuotaHit] = useState(false);
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [templateId, setTemplateId] = useState(DEFAULT_TEMPLATE_ID);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [createCoverLetter, setCreateCoverLetter] = useState(false);

  function chooseTemplate(id: string) {
    setTemplateId(id);
    try {
      window.localStorage.setItem(TEMPLATE_STORAGE_KEY, id);
    } catch {
      // ignore storage failures
    }
    setPickerOpen(false);
  }

  // Pick up the template chosen in the picker (persisted to localStorage).
  useEffect(() => {
    try {
      const saved =
        window.localStorage.getItem(TEMPLATE_STORAGE_KEY) ??
        LEGACY_TEMPLATE_STORAGE_KEYS.map((key) => window.localStorage.getItem(key)).find(Boolean);
      if (saved) {
        setTemplateId(saved);
        window.localStorage.setItem(TEMPLATE_STORAGE_KEY, saved);
      }
    } catch {
      // ignore
    }
  }, []);

  // Load live quota so we can show real "X left" and pre-empt the gate.
  useEffect(() => {
    let alive = true;
    getBilling()
      .then((b) => alive && setBilling(b))
      .catch(() => {
        /* non-fatal — the server still enforces quota */
      });
    return () => {
      alive = false;
    };
  }, []);

  const templateName = getTemplate(templateId).name;
  const outOfQuota = quotaHit || (billing != null && billing.remaining <= 0);

  async function handleGenerate() {
    setError(null);
    setNeedsProfile(false);
    const value = mode === "text" ? text : url;
    if (!value.trim()) {
      setError(mode === "text" ? "Paste a job description first." : "Paste a job link first.");
      return;
    }
    setBusy(true);
    try {
      const { cv } = await customize({ mode, value, templateId, createCoverLetter });
      router.push(`/cv/${cv.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === "NO_PROFILE") {
        setNeedsProfile(true);
      } else if (err instanceof ApiError && err.code === "QUOTA_EXCEEDED") {
        setQuotaHit(true);
      } else {
        const message =
          err instanceof ApiError ? err.message : "Something went wrong. Please try again.";
        setError(message);
      }
      setBusy(false);
    }
  }

  return (
    <div className="glass-strong sheen" style={{ borderRadius: "var(--r-lg)", padding: compact ? 20 : 26 }}>
      <div style={{ marginBottom: 16 }}>
        <div className="seg seg-fill">
          <button className={mode === "text" ? "on" : ""} onClick={() => setMode("text")} disabled={busy}>
            <Icon name="doc" size={15} /> Job description
          </button>
          <button className={mode === "url" ? "on" : ""} onClick={() => setMode("url")} disabled={busy}>
            <Icon name="link" size={15} /> Job link
          </button>
        </div>
      </div>

      {mode === "text" ? (
        <textarea
          className="field"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={busy}
          placeholder="Paste the full job description here"
          style={{ minHeight: compact ? 72 : 104, lineHeight: 1.5, padding: "14px 16px" }}
          aria-label="Job description"
        />
      ) : (
        <input
          className="field"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={busy}
          placeholder="https://company.com/careers/role…"
          style={{ padding: "14px 16px" }}
          aria-label="Job link"
        />
      )}

      {error && (
        <div
          role="alert"
          style={{
            marginTop: 12,
            fontSize: 13.5,
            color: "#d6447a",
            display: "flex",
            alignItems: "center",
            gap: 7,
          }}
        >
          <Icon name="xcircle" size={15} /> {error}
        </div>
      )}

      {needsProfile && (
        <div
          role="alert"
          className="glass"
          style={{
            marginTop: 14,
            borderRadius: "var(--r-md)",
            padding: "14px 16px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <Icon name="user" size={18} style={{ color: "var(--accent-ink)", flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Set up your profile first</div>
            <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 1 }}>
              We tailor your own resume to each job, so we need it on file before the first run.
            </div>
          </div>
          <Link href="/onboarding" className="btn btn-primary btn-sm">
            <Icon name="upload" size={15} /> Add my resume
          </Link>
        </div>
      )}

      {outOfQuota && (
        <div
          role="alert"
          className="glass"
          style={{
            marginTop: 14,
            borderRadius: "var(--r-md)",
            padding: "16px 18px",
            display: "flex",
            alignItems: "center",
            gap: 14,
            flexWrap: "wrap",
            border: "1px solid var(--accent-line)",
            background: "var(--accent-soft)",
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: "var(--accent)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Icon name="bolt" size={20} />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 14.5, fontWeight: 600 }}>
              You&apos;ve hit your monthly limit
            </div>
            <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 2 }}>
              Upgrade for more tailored CVs each month, or wait for your allowance to reset next
              month.
            </div>
          </div>
          <Link href="/settings/billing" className="btn btn-primary btn-sm">
            <Icon name="arrowUp" size={15} /> See plans
          </Link>
        </div>
      )}

      <div
        className="glass"
        style={{
          marginTop: 14,
          borderRadius: "var(--r-md)",
          padding: "13px 15px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          boxShadow: "none",
        }}
      >
        <Icon name="mail" size={17} style={{ color: "var(--accent-ink)", flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Create a custom cover letter</div>
          <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 1 }}>
            Uses the same JD, tailored CV, and proof points.
          </div>
        </div>
        <Toggle on={createCoverLetter} onChange={setCreateCoverLetter} label="Create custom cover letter" />
      </div>

      <div className="console-actions" style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
        <button type="button" className="btn btn-glass console-tpl" onClick={() => setPickerOpen(true)}>
          <Icon name="grid" size={16} /> Template: {templateName}
          <Icon name="chevronD" size={14} style={{ opacity: 0.5 }} />
        </button>
        <div className="console-spacer" style={{ flex: 1 }} />
        <button className="btn btn-primary btn-lg console-go" onClick={handleGenerate} disabled={busy || outOfQuota}>
          {busy ? <Spinner size={18} color="#fff" /> : <Icon name="sparkle" size={18} />}{" "}
          {busy ? "Tailoring…" : createCoverLetter ? "Tailor resume + letter" : "Tailor my resume"}
        </button>
      </div>

      <TemplatePickerModal
        open={pickerOpen}
        selected={templateId}
        onSelect={chooseTemplate}
        onClose={() => setPickerOpen(false)}
      />

      <ProcessingOverlay
        open={busy}
        title="Tailoring your resume"
        subtitle="Reading the role and rewriting your profile to match. This usually takes around half a minute."
        steps={TAILOR_STEPS}
        estimateMs={30000}
        accentIcon="sparkle"
      />
    </div>
  );
}
