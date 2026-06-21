"use client";

import { Icon } from "@/components/ui";
import type { IconName } from "@/lib/icon-paths";
import type { ResumeData, SectionKind } from "@/lib/schema";

/** Icon for a section kind — drives the rail and section headers. */
export function kindIcon(kind: SectionKind): IconName {
  switch (kind) {
    case "experience":
      return "briefcase";
    case "education":
      return "cap";
    case "projects":
      return "layers";
    case "skills":
      return "star";
    case "certifications":
      return "shield";
    case "awards":
      return "award";
    default:
      return "doc";
  }
}

/**
 * EditorRail — the section navigator inside the resume editor. Lists Contact,
 * Summary, then every dynamic section in order. Each row scrolls to its target
 * and shows a live done/empty state. `active` is the anchor currently in view.
 */
export function EditorRail({
  resume,
  active,
  onJump,
}: {
  resume: ResumeData;
  active: string;
  onJump: (anchor: string) => void;
}) {
  const rows: { anchor: string; icon: IconName; label: string; done: boolean }[] = [
    {
      anchor: "contact",
      icon: "user",
      label: "Contact",
      done: Boolean(resume.contact.name && resume.contact.email),
    },
    { anchor: "summary", icon: "doc", label: "Summary", done: Boolean(resume.summary.trim()) },
    ...resume.sections.map((s, i) => ({
      anchor: `section-${i}`,
      icon: kindIcon(s.kind),
      label: s.heading || "Untitled",
      done: s.entries.some(
        (e) => e.title || e.organization || e.bullets.some(Boolean) || e.tags.length,
      ),
    })),
  ];
  const done = rows.filter((r) => r.done).length;

  return (
    <aside className="editor-rail" style={{ width: 220, flexShrink: 0, position: "sticky", top: 0 }}>
      <div className="label editor-rail-label" style={{ padding: "0 4px 10px" }}>
        Sections · {done}/{rows.length}
      </div>
      <div className="editor-rail-list" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {rows.map((r) => {
          const on = r.anchor === active;
          return (
            <button
              key={r.anchor}
              onClick={() => onJump(r.anchor)}
              aria-current={on ? "true" : undefined}
              className={"subnav-item" + (on ? " on" : "")}
              style={{ width: "100%", cursor: "pointer", border: "none", background: undefined }}
            >
              <Icon
                name={r.icon}
                size={17}
                style={{ color: on ? "var(--accent-ink)" : "var(--ink-3)" }}
              />
              <span
                style={{
                  flex: 1,
                  textAlign: "left",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {r.label}
              </span>
              {r.done ? (
                <Icon name="check" size={15} style={{ color: "var(--green)" }} />
              ) : (
                <span className="dot" style={{ background: "var(--ink-4)" }} />
              )}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
