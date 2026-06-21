"use client";

import type { CSSProperties } from "react";
import { Icon } from "@/components/ui";
import type { StoredProfileEnrichment } from "@/lib/db/types";
import type { ResumeData, ResumeSection, ProfileInsights } from "@/lib/schema";
import { hasInsights } from "@/lib/schema";
import { structuredProfileRows } from "@/lib/extension/structured-profile";
import { kindIcon } from "@/components/resume/editor/EditorRail";
import { ApplicationMemorySection } from "./ApplicationMemorySection";
import { ProfileSection } from "./ProfileSection";

type IconLike = "check" | "plus";

/** True if a section has anything worth showing. */
function hasContent(s: ResumeSection): boolean {
  return s.entries.some(
    (e) => e.title || e.organization || e.description || e.bullets.some(Boolean) || e.tags.length || e.link,
  );
}

/** Render one dynamic section's body, adapting to its kind. */
function SectionBody({ section }: { section: ResumeSection }) {
  // Skills / tag-only sections render as chips grouped by entry.
  const tagOnly =
    section.kind === "skills" ||
    section.entries.every((e) => e.tags.length && !e.description && !e.title);

  if (tagOnly) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {section.entries.map((e, i) => {
          const items = [...e.tags, ...e.bullets.filter(Boolean)];
          if (!items.length && !e.title) return null;
          return (
            <div key={i}>
              {e.title && (
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-2)", marginBottom: 7 }}>
                  {e.title}
                </div>
              )}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {items.map((s, j) => (
                  <span key={j} className="chip" style={{ fontSize: 12.5 }}>
                    {s}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <>
      {section.entries.map((e, i) => {
        const dates = [e.start, e.end].filter(Boolean).join(" — ");
        const meta = [e.organization, e.location].filter(Boolean).join(" · ");
        return (
          <div key={i} style={{ padding: "12px 0", borderTop: i === 0 ? "none" : "1px solid var(--hairline-2)" }}>
            {(e.title || dates) && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>{e.title}</span>
                {dates && <span style={{ fontSize: 12.5, color: "var(--ink-3)", whiteSpace: "nowrap" }}>{dates}</span>}
              </div>
            )}
            {meta && (
              <div style={{ fontSize: 13.5, color: "var(--accent-ink)", fontWeight: 600, marginTop: 1 }}>{meta}</div>
            )}
            {e.description && (
              <p style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.55, marginTop: 5 }}>{e.description}</p>
            )}
            {e.bullets.filter(Boolean).length > 0 && (
              <ul style={{ margin: "7px 0 0", paddingLeft: 17 }}>
                {e.bullets.filter(Boolean).map((b, j) => (
                  <li key={j} style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5, marginBottom: 3 }}>
                    {b}
                  </li>
                ))}
              </ul>
            )}
            {e.tags.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 7 }}>
                {e.tags.map((t, j) => (
                  <span key={j} className="chip" style={{ fontSize: 12 }}>
                    {t}
                  </span>
                ))}
              </div>
            )}
            {e.link && (
              <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 5 }}>{e.link}</div>
            )}
          </div>
        );
      })}
    </>
  );
}

function StructuredProfileTable({
  resume,
  insights,
  enrichment,
}: {
  resume: ResumeData;
  insights?: ProfileInsights;
  enrichment: StoredProfileEnrichment | null;
}) {
  const rows = structuredProfileRows({ resume, insights }, enrichment).slice(0, 80);
  if (!rows.length) return null;

  return (
    <ProfileSection icon="layers" title="Structured profile" count={`${rows.length} facts`}>
      <div style={{ overflowX: "auto" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "130px minmax(160px, .8fr) minmax(220px, 1.2fr)",
            minWidth: 620,
            borderTop: "1px solid var(--hairline-2)",
            fontSize: 13,
          }}
        >
          {rows.map((row) => (
            <div key={`${row.category}-${row.key}-${row.value}`} style={{ display: "contents" }}>
              <div style={structuredCellMuted}>{row.category}</div>
              <div style={structuredCellMuted}>{row.label}</div>
              <div style={structuredCellStrong}>{row.value}</div>
            </div>
          ))}
        </div>
      </div>
    </ProfileSection>
  );
}

const structuredCellMuted = {
  padding: "9px 10px",
  borderBottom: "1px solid var(--hairline-2)",
  color: "var(--ink-3)",
  minWidth: 0,
  overflowWrap: "anywhere",
} satisfies CSSProperties;

const structuredCellStrong = {
  padding: "9px 10px",
  borderBottom: "1px solid var(--hairline-2)",
  color: "var(--ink-1)",
  fontWeight: 600,
  minWidth: 0,
  overflowWrap: "anywhere",
} satisfies CSSProperties;

/**
 * ProfileView — the read-only presentation of the base profile. It renders
 * contact + summary, then EVERY dynamic section in order (experience,
 * education, projects, awards, skills, custom…), so nothing from the parsed
 * resume is ever hidden. A strength rail summarizes completeness.
 */
export function ProfileView({
  resume,
  lastUpdated,
  onEdit,
  insights,
  enrichment,
  capturedCount,
  onEnrichmentChange,
}: {
  resume: ResumeData;
  lastUpdated: string;
  onEdit: (section?: string) => void;
  insights?: ProfileInsights;
  enrichment: StoredProfileEnrichment | null;
  capturedCount: number;
  onEnrichmentChange: (enrichment: StoredProfileEnrichment, capturedCount?: number) => void;
}) {
  const { contact, summary, sections } = resume;
  const visible = sections.filter(hasContent);

  const hasKind = (k: ResumeSection["kind"]) => visible.some((s) => s.kind === k);
  const checks = [
    Boolean(contact.name && contact.email),
    Boolean(summary),
    hasKind("experience"),
    hasKind("skills"),
    hasKind("education"),
  ];
  const strength = Math.round((checks.filter(Boolean).length / checks.length) * 100);

  const strengthItems: [IconLike, string, boolean][] = [
    ["check", "Contact complete", checks[0]],
    ["check", "Summary added", checks[1]],
    [checks[2] ? "check" : "plus", "Experience added", checks[2]],
    [checks[3] ? "check" : "plus", "Skills listed", checks[3]],
    [checks[4] ? "check" : "plus", checks[4] ? "Education added" : "Add your education", checks[4]],
  ];

  const contactRows: [string, string][] = (
    [
      ["Name", contact.name],
      ["Title", contact.title],
      ["Email", contact.email],
      ["Location", contact.location],
      ["Phone", contact.phone],
      ["LinkedIn", contact.linkedin],
      ["Website", contact.website],
      ["GitHub", contact.github],
    ] as [string, string][]
  ).filter(([, v]) => v);

  return (
    <div className="profile-shell" style={{ display: "flex", gap: 26, alignItems: "flex-start" }}>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
        <ProfileSection icon="user" title="Contact" onEdit={() => onEdit("contact")}>
          <div className="profile-contact-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 24px", fontSize: 14 }}>
            {contactRows.map(([k, v]) => (
              <div
                key={k}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  borderBottom: "1px solid var(--hairline-2)",
                  paddingBottom: 8,
                }}
              >
                <span style={{ color: "var(--ink-3)" }}>{k}</span>
                <span style={{ fontWeight: 500, textAlign: "right", wordBreak: "break-word" }}>{v}</span>
              </div>
            ))}
          </div>
        </ProfileSection>

        <ProfileSection icon="doc" title="Summary" onEdit={() => onEdit("summary")}>
          {summary ? (
            <p style={{ fontSize: 14, color: "var(--ink-2)", lineHeight: 1.6 }}>{summary}</p>
          ) : (
            <p style={{ fontSize: 13.5, color: "var(--ink-4)" }}>
              No summary yet — add a few lines on the impact you bring.
            </p>
          )}
        </ProfileSection>

        <ApplicationMemorySection
          enrichment={enrichment}
          capturedCount={capturedCount}
          onChange={onEnrichmentChange}
        />

        <StructuredProfileTable resume={resume} insights={insights} enrichment={enrichment} />

        {visible.map((section, i) => {
          // Map back to the section's real index in the editor anchor scheme.
          const realIndex = sections.indexOf(section);
          const count =
            section.kind === "skills"
              ? undefined
              : `${section.entries.length} ${section.entries.length === 1 ? "entry" : "entries"}`;
          return (
            <ProfileSection
              key={section.id || i}
              icon={kindIcon(section.kind)}
              title={section.heading || "Section"}
              count={count}
              onEdit={() => onEdit(`section-${realIndex}`)}
            >
              <SectionBody section={section} />
            </ProfileSection>
          );
        })}

        {visible.length === 0 && (
          <div className="glass" style={{ borderRadius: "var(--r-lg)", padding: "20px 24px" }}>
            <p style={{ fontSize: 13.5, color: "var(--ink-4)" }}>
              No sections yet. Upload a resume or add sections to build your profile.
            </p>
          </div>
        )}
      </div>

      {/* right rail */}
      <div className="profile-rail" style={{ width: 280, flexShrink: 0 }}>
        <div className="glass sheen profile-rail-card" style={{ borderRadius: "var(--r-lg)", padding: 22 }}>
          <div className="label" style={{ marginBottom: 12 }}>
            Profile strength
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: 38, fontWeight: 700, letterSpacing: "-0.03em" }}>{strength}</span>
            <span style={{ fontSize: 15, color: "var(--ink-3)" }}>/ 100</span>
          </div>
          <div style={{ height: 8, borderRadius: 99, background: "rgba(26,26,42,.1)", overflow: "hidden", margin: "10px 0 18px" }}>
            <div style={{ width: `${strength}%`, height: "100%", background: "linear-gradient(90deg,#7b79f0,var(--accent))", borderRadius: 99 }} />
          </div>
          {strengthItems.map(([icon, label, done]) => (
            <button
              key={label}
              onClick={() => onEdit()}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "7px 0",
                fontSize: 13.5,
                color: done ? "var(--ink-2)" : "var(--accent-ink)",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                width: "100%",
                textAlign: "left",
                fontFamily: "var(--sans)",
              }}
            >
              <Icon name={icon} size={15} style={{ color: done ? "var(--green)" : "var(--accent-ink)" }} /> {label}
            </button>
          ))}
          <div style={{ height: 1, background: "var(--hairline)", margin: "16px 0" }} />
          <div style={{ fontSize: 12.5, color: "var(--ink-4)" }}>Last updated {lastUpdated}</div>
        </div>

        {hasInsights(insights) && insights && (
          <CareerIntelligence insights={insights} />
        )}
      </div>
    </div>
  );
}

/**
 * CareerIntelligence — surfaces the derived "career intelligence" layer
 * (the career-ops `_profile.md` + `article-digest.md` equivalent): the
 * candidate's positioning headline, the role archetypes they're competitive
 * for, and the quantified proof points the tailoring step reuses. This is
 * auto-generated from the resume on upload, so users see exactly what the
 * tailoring engine knows about them.
 */
function CareerIntelligence({ insights }: { insights: ProfileInsights }) {
  return (
    <div
      className="glass sheen profile-rail-card"
      style={{ borderRadius: "var(--r-lg)", padding: 22, marginTop: 16 }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Icon name="sparkle" size={15} style={{ color: "var(--accent-ink)" }} />
        <span className="label" style={{ margin: 0 }}>
          Career intelligence
        </span>
      </div>

      {insights.headline && (
        <p style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink-1)", lineHeight: 1.45, margin: "0 0 6px" }}>
          {insights.headline}
        </p>
      )}
      {insights.narrative && (
        <p style={{ fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.5, margin: "0 0 4px" }}>
          {insights.narrative}
        </p>
      )}

      {insights.archetypes.length > 0 && (
        <>
          <div style={{ height: 1, background: "var(--hairline)", margin: "14px 0" }} />
          <div style={{ fontSize: 11.5, color: "var(--ink-3)", fontWeight: 600, marginBottom: 8 }}>
            Best-fit roles
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {insights.archetypes.map((a, i) => (
              <span key={i} className="chip chip-accent" style={{ fontSize: 12 }}>
                {a.name}
              </span>
            ))}
          </div>
        </>
      )}

      {insights.proofPoints.length > 0 && (
        <>
          <div style={{ height: 1, background: "var(--hairline)", margin: "14px 0" }} />
          <div style={{ fontSize: 11.5, color: "var(--ink-3)", fontWeight: 600, marginBottom: 8 }}>
            Proof points · {insights.proofPoints.length}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {insights.proofPoints.slice(0, 5).map((p, i) => (
              <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
                <Icon name="bolt" size={13} style={{ color: "var(--accent-ink)", flexShrink: 0, marginTop: 2 }} />
                <span style={{ fontSize: 12.3, color: "var(--ink-2)", lineHeight: 1.4 }}>{p.headline}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
