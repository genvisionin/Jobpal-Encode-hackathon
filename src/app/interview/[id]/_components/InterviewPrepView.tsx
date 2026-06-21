"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon, Aurora } from "@/components/ui";
import {
  getInterviewPrep,
  generateInterviewPrep,
  ApiError,
} from "@/lib/api-client";
import type { InterviewPrep } from "@/lib/schema/interview-prep";
import { PrepReport } from "./PrepReport";

/**
 * InterviewPrepView — owns the prep state for one booked interview. If a pack
 * already exists it renders immediately; otherwise it kicks off generation
 * (the deep-research LLM pass) with a calm progress screen, then renders the
 * report. Supports regenerating a fresh pack.
 */
export function InterviewPrepView({
  applicationId,
  company,
  role,
  initialPrep,
  initialSource,
}: {
  applicationId: string;
  company: string;
  role: string;
  initialPrep: InterviewPrep | null;
  initialSource: "azure" | "mock" | null;
}) {
  const [prep, setPrep] = useState<InterviewPrep | null>(initialPrep);
  const [source, setSource] = useState<"azure" | "mock" | null>(initialSource);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const generate = useCallback(
    async (regenerate: boolean) => {
      setGenerating(true);
      setError(null);
      try {
        const res = await generateInterviewPrep(applicationId, regenerate);
        setPrep(res.prep.prep);
        setSource(res.prep.source);
      } catch (err) {
        if (err instanceof ApiError && err.code === "NO_PROFILE") {
          setError(err.message);
        } else {
          setError(
            err instanceof ApiError ? err.message : "Couldn't build your prep pack. Try again.",
          );
        }
      } finally {
        setGenerating(false);
      }
    },
    [applicationId],
  );

  // Auto-generate on first visit when no pack exists yet.
  useEffect(() => {
    if (!prep && !started.current) {
      started.current = true;
      // Re-check the server once (in case it was generated in another tab),
      // then generate if still missing.
      void (async () => {
        try {
          const existing = await getInterviewPrep(applicationId);
          if (existing.prep) {
            setPrep(existing.prep.prep);
            setSource(existing.prep.source);
            return;
          }
        } catch {
          /* fall through to generate */
        }
        void generate(false);
      })();
    }
  }, [applicationId, prep, generate]);

  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column" }}>
      {/* toolbar */}
      <div
        className="glass"
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
        <Link href="/tracker" className="btn btn-ghost btn-sm">
          <Icon name="chevron" size={16} style={{ transform: "rotate(180deg)" }} /> Tracker
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0, flex: "1 1 auto" }}>
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
            <Icon name="sparkle" size={18} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15.5, fontWeight: 600 }}>
              Interview prep · {role}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
              {company}
              {source === "mock" ? " · offline draft" : ""}
            </div>
          </div>
        </div>
        <div style={{ flex: "0 0 auto" }} />
        {prep && !generating && (
          <button className="btn btn-glass btn-sm" onClick={() => generate(true)}>
            <Icon name="sync" size={15} /> Regenerate
          </button>
        )}
      </div>

      {/* body */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          position: "relative",
          background: "var(--canvas-bg)",
        }}
      >
        <Aurora />
        {generating && !prep ? (
          <GeneratingState company={company} role={role} />
        ) : error && !prep ? (
          <ErrorState error={error} onRetry={() => generate(false)} />
        ) : prep ? (
          <PrepReport prep={prep} />
        ) : (
          <GeneratingState company={company} role={role} />
        )}
      </div>
    </div>
  );
}

/* ---------- states ---------- */

function GeneratingState({ company, role }: { company: string; role: string }) {
  const steps = [
    `Finding the live job posting for ${role} at ${company}`,
    `Reading the real job description`,
    `Searching Glassdoor, Reddit & Blind for ${company}`,
    `Collecting questions candidates were asked`,
    "Matching your resume to each answer",
    "Writing your talking points",
  ];
  return (
    <div
      style={{
        position: "relative",
        zIndex: 1,
        minHeight: "70vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        padding: 24,
        textAlign: "center",
      }}
    >
      <div
        className="glass-strong sheen"
        style={{
          width: 64,
          height: 64,
          borderRadius: 18,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--accent-ink)",
        }}
      >
        <span className="prep-pulse" style={{ display: "inline-flex" }}>
          <Icon name="sparkle" size={30} />
        </span>
      </div>
      <div>
        <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.025em", margin: 0 }}>
          Building your prep pack
        </h1>
        <p style={{ fontSize: 14.5, color: "var(--ink-2)", marginTop: 8, maxWidth: 420 }}>
          Researching {company} across Glassdoor, Reddit and forums, then tailoring everything to your
          resume. This takes a moment.
        </p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 260 }}>
        {steps.map((s, i) => (
          <div
            key={s}
            className="chip"
            style={{
              justifyContent: "flex-start",
              gap: 9,
              animation: `prepFade .5s ease both`,
              animationDelay: `${i * 0.12}s`,
            }}
          >
            <span className="dot" style={{ background: "var(--accent)" }} /> {s}
          </div>
        ))}
      </div>
      <style>{`
        @keyframes prepFade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
        .prep-pulse { animation: prepPulse 1.4s ease-in-out infinite; }
        @keyframes prepPulse { 0%,100% { opacity: .55; transform: scale(.94); } 50% { opacity: 1; transform: scale(1.06); } }
      `}</style>
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div
      style={{
        position: "relative",
        zIndex: 1,
        minHeight: "60vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        padding: 24,
        textAlign: "center",
      }}
    >
      <div
        className="glass"
        style={{
          maxWidth: 460,
          padding: "32px 28px",
          borderRadius: "var(--r-lg)",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          alignItems: "center",
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            background: "rgba(255,159,10,.14)",
            color: "var(--amber)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="bolt" size={22} />
        </div>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Couldn&apos;t build your prep pack</div>
        <p style={{ fontSize: 14, color: "var(--ink-2)", margin: 0 }}>{error}</p>
        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          {/NO_PROFILE|resume/i.test(error) ? (
            <Link href="/intake" className="btn btn-primary">
              <Icon name="upload" size={15} /> Add your resume
            </Link>
          ) : (
            <button className="btn btn-primary" onClick={onRetry}>
              <Icon name="sync" size={15} /> Try again
            </button>
          )}
          <Link href="/tracker" className="btn btn-glass">
            Back to tracker
          </Link>
        </div>
      </div>
    </div>
  );
}
