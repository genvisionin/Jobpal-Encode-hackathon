"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon, Logo, StepDots, ProcessingOverlay, type ProcessingStep, FadeIn } from "@/components/ui";
import type { IconName } from "@/lib/icon-paths";
import { uploadResume, ApiError } from "@/lib/api-client";
import type { StoredProfile } from "@/lib/db/types";

type Step = "upload" | "extract";

const ACCEPT = ".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain";

/** Narrated steps while the model reads an uploaded resume. */
const PARSE_STEPS: ProcessingStep[] = [
  { icon: "doc", label: "Reading your document" },
  { icon: "search", label: "Finding every role, project and skill" },
  { icon: "layers", label: "Structuring it into your profile" },
  { icon: "check", label: "Double-checking the details" },
];

function ExtractRow({
  icon,
  label,
  value,
  confidence,
}: {
  icon: IconName;
  label: string;
  value: string;
  confidence: "high" | "med" | "low";
}) {
  const color =
    confidence === "high" ? "var(--green)" : confidence === "med" ? "var(--amber)" : "var(--ink-4)";
  const text = confidence === "high" ? "Confident" : confidence === "med" ? "Check this" : "Add";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 13,
        padding: "13px 0",
        borderBottom: "1px solid var(--hairline-2)",
      }}
    >
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: 9,
          background: "var(--accent-soft)",
          color: "var(--accent-ink)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon name={icon} size={17} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="label" style={{ marginBottom: 3 }}>
          {label}
        </div>
        <div style={{ fontSize: 14.5, color: "var(--ink)", lineHeight: 1.4 }}>{value}</div>
      </div>
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          fontSize: 11.5,
          color,
          flexShrink: 0,
          marginTop: 2,
        }}
      >
        <span className="dot" style={{ background: color }} /> {text}
      </span>
    </div>
  );
}

/** IntakeFlow — the "I have a resume" path: upload, parse, then review the extracted profile. */
export function IntakeFlow() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<StoredProfile | null>(null);
  const [source, setSource] = useState<string>("");

  async function handleFile(selected: File) {
    setError(null);
    setFile(selected);
    setBusy(true);
    try {
      const result = await uploadResume(selected);
      setProfile(result.profile);
      setSource(result.source);
      setStep("extract");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't process that file.");
    } finally {
      setBusy(false);
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) void handleFile(f);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) void handleFile(f);
  }

  if (step === "upload") {
    return (
      <div
        className="intake-upload-wrap"
        style={{
          position: "relative",
          zIndex: 2,
          minHeight: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 40,
        }}
      >
        <div
          className="glass-strong sheen intake-card"
          style={{ width: 720, maxWidth: "100%", borderRadius: "var(--r-xl)", padding: "48px 52px" }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Link href="/customize" aria-label="Jobpal home">
              <Logo size={20} />
            </Link>
            <StepDots count={4} active={2} />
          </div>
          <h1 className="intake-title" style={{ fontSize: 40, marginTop: 28, lineHeight: 1.05, fontWeight: 800, letterSpacing: "-0.03em" }}>
            Upload your resume
          </h1>
          <p style={{ fontSize: 16, color: "var(--ink-2)", marginTop: 10 }}>
            We&apos;ll read it once and build your profile. You&apos;ll review everything before it&apos;s saved.
          </p>

          <input ref={fileInput} type="file" accept={ACCEPT} onChange={onPick} style={{ display: "none" }} />

          {/* dropzone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            onClick={() => fileInput.current?.click()}
            role="button"
            tabIndex={0}
            style={{
              marginTop: 28,
              borderRadius: "var(--r-lg)",
              border: "2px dashed var(--accent-line)",
              background: "var(--accent-soft)",
              padding: "46px 24px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              gap: 14,
              cursor: "pointer",
            }}
          >
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 18,
                background: "linear-gradient(145deg,#7b79f0,var(--accent))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                boxShadow: "0 10px 24px rgba(94,92,230,.4), inset 0 1px 0 rgba(255,255,255,.4)",
              }}
            >
              <Icon name="upload" size={28} />
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>Drag &amp; drop your file here</div>
              <div style={{ fontSize: 14, color: "var(--ink-2)", marginTop: 4 }}>
                or click to browse — PDF, DOCX up to 10MB
              </div>
            </div>
            <button className="btn btn-primary" style={{ marginTop: 6 }} disabled={busy}>
              <Icon name="doc" size={16} /> {busy ? "Reading…" : "Choose file"}
            </button>
          </div>

          {file && (
            <div
              className="glass"
              style={{
                marginTop: 16,
                borderRadius: "var(--r-md)",
                padding: "14px 16px",
                display: "flex",
                alignItems: "center",
                gap: 14,
              }}
            >
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 10,
                  background: "rgba(255,107,157,.16)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#d6447a",
                }}
              >
                <Icon name="doc" size={20} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {file.name}
                </div>
                <div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
                  {(file.size / 1024).toFixed(0)} KB · {busy ? "reading…" : "ready"}
                </div>
              </div>
              {busy ? (
                <span className="chip" style={{ color: "var(--accent-ink)" }}>
                  <Icon name="sparkle" size={13} /> Extracting
                </span>
              ) : (
                <span className="chip" style={{ color: "var(--green)" }}>
                  <Icon name="check" size={13} /> Ready
                </span>
              )}
            </div>
          )}

          {error && (
            <div role="alert" style={{ marginTop: 14, fontSize: 13.5, color: "#d6447a", display: "flex", alignItems: "center", gap: 7 }}>
              <Icon name="xcircle" size={15} /> {error}
            </div>
          )}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 30,
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontSize: 13, color: "var(--ink-3)", display: "flex", alignItems: "center", gap: 7 }}>
              <Icon name="eye" size={15} /> Private — used only to build your profile
            </span>
            <button
              className="btn btn-primary btn-lg"
              onClick={() => fileInput.current?.click()}
              disabled={busy}
            >
              <Icon name="sparkle" size={17} /> {busy ? "Extracting…" : "Choose a file"}
            </button>
          </div>
        </div>

        <ProcessingOverlay
          open={busy}
          title="Reading your resume"
          subtitle="We're pulling out every role, project, and skill so your profile is complete from the start."
          steps={PARSE_STEPS}
          estimateMs={18000}
          accentIcon="doc"
        />
      </div>
    );
  }

  // extract / review — driven by the real parsed profile
  const resume = profile?.resume;
  const sections = resume?.sections ?? [];
  const expSection = sections.find((s) => s.kind === "experience");
  const eduSection = sections.find((s) => s.kind === "education");
  const firstExp = expSection?.entries[0];
  const skillsFlat = sections
    .filter((s) => s.kind === "skills")
    .flatMap((s) => s.entries.flatMap((e) => (e.tags.length ? e.tags : e.bullets)))
    .filter(Boolean);
  const sectionCount = sections.length;

  return (
    <div className="intake-review" style={{ position: "relative", zIndex: 2, minHeight: "100%", display: "flex", padding: 36, gap: 24, flexWrap: "wrap" }}>
      {/* left: confirmation card */}
      <FadeIn
        className="glass sheen intake-review-card"
        style={{ width: "40%", minWidth: 300, borderRadius: "var(--r-lg)", padding: 24, display: "flex", flexDirection: "column" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <span className="chip chip-accent">
            <Icon name="doc" size={13} /> {file?.name ?? "Source document"}
          </span>
          <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
            {source === "azure" ? "AI PARSED" : "PARSED"}
          </span>
        </div>
        <div
          style={{
            flex: 1,
            borderRadius: "var(--r-md)",
            background: "#fff",
            boxShadow: "var(--shadow-md)",
            padding: "28px 26px",
            minHeight: 360,
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.025em", color: "var(--ink)" }}>
            {resume?.contact.name || "Your name"}
          </div>
          <div className="mono" style={{ fontSize: 11, color: "var(--accent-ink)", marginTop: 6 }}>
            {(resume?.contact.title || "").toUpperCase()}
          </div>
          <div style={{ height: 1, background: "var(--hairline)", margin: "16px 0" }} />
          <p style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.6 }}>
            {resume?.summary || "No summary detected — you can add one in the builder."}
          </p>
        </div>
      </FadeIn>

      {/* right: extracted profile */}
      <FadeIn delay={0.1} className="intake-review-main" style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 320 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.025em" }}>Here&apos;s what we found</h1>
          <span className="chip" style={{ color: "var(--green)" }}>
            <Icon name="check" size={13} /> {sectionCount} section{sectionCount === 1 ? "" : "s"}
          </span>
        </div>
        <p style={{ fontSize: 15, color: "var(--ink-2)", marginTop: 8 }}>
          Review and tweak anything before we save it to your profile. Amber items are worth a glance.
        </p>

        <div className="glass" style={{ marginTop: 20, borderRadius: "var(--r-lg)", padding: "8px 24px", flex: 1 }}>
          <ExtractRow
            icon="user"
            label="Name & title"
            value={[resume?.contact.name, resume?.contact.title].filter(Boolean).join(" — ") || "Not detected"}
            confidence={resume?.contact.name ? "high" : "low"}
          />
          <ExtractRow
            icon="map"
            label="Contact"
            value={[resume?.contact.email, resume?.contact.phone, resume?.contact.location].filter(Boolean).join(" · ") || "Not detected"}
            confidence={resume?.contact.email ? "high" : "med"}
          />
          <ExtractRow
            icon="briefcase"
            label="Most recent role"
            value={firstExp ? `${firstExp.title || "Role"}${firstExp.organization ? `, ${firstExp.organization}` : ""} · ${firstExp.bullets.length} bullet points` : "Not detected"}
            confidence={firstExp ? "high" : "low"}
          />
          <ExtractRow
            icon="cap"
            label="Education"
            value={eduSection?.entries[0]?.title || "Couldn't find any — add if relevant"}
            confidence={eduSection?.entries.length ? "med" : "low"}
          />
          <ExtractRow
            icon="star"
            label="Skills"
            value={skillsFlat.length ? `${skillsFlat.slice(0, 6).join(", ")}${skillsFlat.length > 6 ? ` +${skillsFlat.length - 6}` : ""}` : "Not detected"}
            confidence={skillsFlat.length ? "high" : "low"}
          />
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 20,
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <button className="btn btn-glass" onClick={() => { setStep("upload"); setFile(null); }}>
            <Icon name="upload" size={16} /> Replace file
          </button>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button className="btn btn-ghost" onClick={() => router.push("/profile")}>
              View profile
            </button>
            <button className="btn btn-primary btn-lg" onClick={() => router.push("/customize")}>
              <Icon name="check" size={17} /> Looks good — start tailoring
            </button>
          </div>
        </div>
      </FadeIn>
    </div>
  );
}
