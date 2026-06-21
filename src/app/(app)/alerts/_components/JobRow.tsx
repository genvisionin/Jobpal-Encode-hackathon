import type { JobListing } from "@/lib/jobs/types";
import { Icon } from "@/components/ui";
import { CompanyMark } from "@/components/resume";

/** JobRow — a single matched job posting in the alerts feed. */
export function JobRow({ job, onTailor }: { job: JobListing; onTailor?: (job: JobListing) => void }) {
  return (
    <div
      className="glass sheen row-hover job-row"
      style={{
        borderRadius: "var(--r-lg)",
        padding: "18px 22px",
      }}
    >
      <CompanyMark color={job.brandColor} />

      <div className="job-row-body" style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span className="job-row-title" style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.02em" }}>{job.title}</span>
          {job.isNew && (
            <span className="badge badge-new">
              <span className="dot" style={{ background: "#fff" }} /> NEW
            </span>
          )}
        </div>
        <div
          style={{
            fontSize: 14,
            color: "var(--ink-2)",
            marginTop: 3,
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontWeight: 600, color: "var(--ink)" }}>{job.company}</span>
          {job.location && (
            <>
              <span style={{ color: "var(--ink-4)" }}>·</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <Icon name="map" size={13} /> {job.location}
              </span>
            </>
          )}
        </div>
        <div style={{ display: "flex", gap: 7, marginTop: 11, flexWrap: "wrap" }}>
          {job.salary && (
            <span className="chip" style={{ fontSize: 12, padding: "4px 10px" }}>
              <Icon name="money" size={12} /> {job.salary}
            </span>
          )}
          {job.tags.map((t) => (
            <span key={t} className="chip" style={{ fontSize: 12, padding: "4px 10px" }}>
              {t}
            </span>
          ))}
        </div>
      </div>

      <div className="job-row-side">
        <div className="job-row-meta" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
            <Icon name="clock" size={13} style={{ verticalAlign: "-2px" }} /> {job.postedAt}
          </span>
          <span className="chip chip-accent" style={{ fontSize: 12, padding: "4px 10px" }}>
            {job.matchPct}% match
          </span>
        </div>
        <div className="job-row-actions">
          <button className="btn btn-glass btn-sm btn-grow" onClick={() => onTailor?.(job)}>
            <Icon name="sparkle" size={14} /> Tailor CV
          </button>
          <a
            href={job.applyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary btn-sm btn-grow"
          >
            Apply <Icon name="arrow" size={14} style={{ transform: "rotate(-45deg)" }} />
          </a>
        </div>
      </div>
    </div>
  );
}
