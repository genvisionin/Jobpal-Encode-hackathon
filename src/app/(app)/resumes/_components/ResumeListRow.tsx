import Link from "next/link";
import type { StoredTailoredCV } from "@/lib/db/types";
import { Icon } from "@/components/ui";
import { ResumeThumbnail, DownloadPdfButton } from "@/components/resume";

/** ResumeListRow — a dense list row for a tailored CV with a real thumbnail. */
export function ResumeListRow({ cv }: { cv: StoredTailoredCV }) {
  const date = new Date(cv.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <div
      className="glass row-hover resume-row"
      style={{
        borderRadius: "var(--r-md)",
        padding: "14px 18px",
      }}
    >
      <Link
        href={`/cv/${cv.id}`}
        className="resume-row-thumb"
        style={{
          width: 46,
          flexShrink: 0,
          borderRadius: 8,
          overflow: "hidden",
          boxShadow: "var(--shadow-sm)",
          display: "block",
        }}
        aria-label={`Open ${cv.company} resume`}
      >
        <ResumeThumbnail cvId={cv.id} templateId={cv.templateId} ratio={1.3} />
      </Link>

      <div className="resume-row-body" style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>{cv.company}</span>
        </div>
        <div style={{ fontSize: 13.5, color: "var(--ink-3)", marginTop: 2 }}>
          {cv.role} · tailored {date}
        </div>
      </div>

      <div className="resume-row-meta" style={{ display: "flex", alignItems: "center", gap: 7, marginRight: 8 }}>
        <div
          style={{
            width: 70,
            height: 6,
            borderRadius: 99,
            background: "rgba(26,26,42,.1)",
            overflow: "hidden",
          }}
        >
          <div style={{ width: cv.matchScore + "%", height: "100%", background: "var(--accent)" }} />
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--accent-ink)", width: 34 }}>
          {cv.matchScore}%
        </span>
      </div>

      <div className="resume-row-actions">
        <Link href={`/cv/${cv.id}`} className="btn btn-glass btn-sm resume-row-open">
          <Icon name="eye" size={15} /> Open
        </Link>
        <DownloadPdfButton cvId={cv.id} templateId={cv.templateId} />
      </div>
    </div>
  );
}
