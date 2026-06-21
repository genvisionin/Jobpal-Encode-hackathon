import Link from "next/link";
import type { StoredTailoredCV } from "@/lib/db/types";
import { Icon, MatchRing } from "@/components/ui";
import { ResumeThumbnail, DownloadPdfButton } from "@/components/resume";

/** GeneratedCVCard — a real tailored CV from the store, with a live thumbnail + actions. */
export function GeneratedCVCard({ cv }: { cv: StoredTailoredCV }) {
  const date = new Date(cv.createdAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

  return (
    <div
      className="glass sheen row-hover"
      style={{ borderRadius: "var(--r-lg)", padding: 14, display: "flex", flexDirection: "column" }}
    >
      <Link
        href={`/cv/${cv.id}`}
        style={{
          borderRadius: "var(--r-md)",
          overflow: "hidden",
          boxShadow: "var(--shadow-sm)",
          display: "block",
        }}
        aria-label={`Open ${cv.company} resume`}
      >
        <ResumeThumbnail cvId={cv.id} templateId={cv.templateId} />
      </Link>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 15.5,
              fontWeight: 600,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {cv.company}
          </div>
          <div
            style={{
              fontSize: 13,
              color: "var(--ink-3)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {cv.role} · {date}
          </div>
        </div>
        <MatchRing pct={cv.matchScore} />
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <Link href={`/cv/${cv.id}`} className="btn btn-glass btn-sm" style={{ flex: 1, justifyContent: "center" }}>
          <Icon name="eye" size={15} /> Open
        </Link>
        <DownloadPdfButton cvId={cv.id} templateId={cv.templateId} />
      </div>
    </div>
  );
}
