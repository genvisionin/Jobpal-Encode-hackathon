import Link from "next/link";
import { Icon, Stagger, StaggerItem } from "@/components/ui";
import { Screen, PageHeader } from "@/components/layout";
import { listTailoredCVs } from "@/lib/services/tailor-service";
import { requireUserId } from "@/lib/auth";
import { ResumeListRow } from "./_components/ResumeListRow";

export const metadata = { title: "My Resumes · Jobpal" };
export const dynamic = "force-dynamic";

/** My Resumes — every tailored CV in one list, with a quick command bar. */
export default async function ResumesPage() {
  const userId = await requireUserId();
  const cvs = await listTailoredCVs(userId);

  return (
    <Screen max={960}>
      <PageHeader
        title="My resumes"
        subtitle="Every resume you've tailored, named after the company."
      />

      {/* smart command bar */}
      <Link
        href="/customize"
        className="glass-strong sheen"
        style={{
          borderRadius: "var(--pill)",
          padding: "8px 8px 8px 22px",
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
      >
        <Icon name="link" size={20} style={{ color: "var(--accent-ink)", flexShrink: 0 }} />
        <div style={{ flex: 1, fontSize: 15.5, color: "var(--ink-2)" }}>
          Paste a job link or description…{" "}
          <span style={{ color: "var(--ink-4)" }}>we&apos;ll detect which it is</span>
        </div>
        <span className="btn btn-primary btn-lg">
          <Icon name="sparkle" size={18} /> Tailor
        </span>
      </Link>

      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "26px 0 16px" }}>
        <h2 style={{ fontSize: 19, fontWeight: 600 }}>All resumes</h2>
        <span className="chip">{cvs.length}</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 13, color: "var(--ink-3)" }}>Most recent first</span>
      </div>

      {cvs.length === 0 ? (
        <div
          className="glass"
          style={{
            borderRadius: "var(--r-lg)",
            padding: "48px 24px",
            textAlign: "center",
            color: "var(--ink-2)",
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--ink)" }}>No tailored resumes yet</div>
          <p style={{ fontSize: 14, marginTop: 6 }}>
            Paste a job description on the Customize CV page to generate your first one.
          </p>
          <Link href="/customize" className="btn btn-primary" style={{ marginTop: 16 }}>
            <Icon name="sparkle" size={16} /> Customize a CV
          </Link>
        </div>
      ) : (
        <Stagger style={{ display: "flex", flexDirection: "column", gap: 12 }} gap={0.045} delay={0.05}>
          {cvs.map((cv) => (
            <StaggerItem key={cv.id}>
              <ResumeListRow cv={cv} />
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </Screen>
  );
}
