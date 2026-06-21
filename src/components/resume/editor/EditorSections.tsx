"use client";

import { type ReactNode, type RefObject } from "react";
import { Icon } from "@/components/ui";
import type { IconName } from "@/lib/icon-paths";
import type { ResumeSection, SectionKind } from "@/lib/schema";
import { Field, TextArea, Labeled, TagEditor } from "./fields";
import { kindIcon } from "./EditorRail";
import type { ResumeEditorApi } from "./useResumeEditor";

const KIND_OPTIONS: { value: SectionKind; label: string }[] = [
  { value: "experience", label: "Experience" },
  { value: "education", label: "Education" },
  { value: "projects", label: "Projects" },
  { value: "skills", label: "Skills" },
  { value: "certifications", label: "Certifications" },
  { value: "awards", label: "Awards" },
  { value: "custom", label: "Custom" },
];

/** A glass card wrapping one editable block, with an anchor for scroll-to. */
function Card({
  anchor,
  icon,
  header,
  headerClassName,
  innerRef,
  children,
}: {
  anchor: string;
  icon: IconName;
  header: ReactNode;
  headerClassName?: string;
  innerRef: (el: HTMLDivElement | null) => void;
  children: ReactNode;
}) {
  return (
    <section
      ref={innerRef}
      data-anchor={anchor}
      className="glass sheen"
      style={{ borderRadius: "var(--r-lg)", padding: "20px 24px", scrollMarginTop: 12 }}
    >
      <div
        className={headerClassName}
        style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 16 }}
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
          <Icon name={icon} size={18} />
        </div>
        {header}
      </div>
      {children}
    </section>
  );
}

const innerCard: React.CSSProperties = {
  borderRadius: "var(--r-md)",
  border: "1px solid var(--hairline)",
  background: "rgba(255,255,255,.45)",
  padding: 18,
};

/** Editable fields for one entry, adapting to the section kind. */
function EntryEditor({
  editor,
  si,
  ei,
  kind,
  entry,
  canRemove,
}: {
  editor: ResumeEditorApi;
  si: number;
  ei: number;
  kind: SectionKind;
  entry: ResumeSection["entries"][number];
  canRemove: boolean;
}) {
  const isSkills = kind === "skills";
  const titleLabel =
    kind === "experience"
      ? "Job title"
      : kind === "education"
        ? "Degree"
        : kind === "projects"
          ? "Project name"
          : kind === "awards"
            ? "Award"
            : kind === "certifications"
              ? "Certification"
              : isSkills
                ? "Group label (optional)"
                : "Title";
  const orgLabel =
    kind === "experience"
      ? "Company"
      : kind === "education"
        ? "School"
        : kind === "awards" || kind === "certifications"
          ? "Issuer / event"
          : "Organization";

  return (
    <div style={innerCard}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-2)", flex: 1 }}>
          {isSkills ? `Group ${ei + 1}` : `Entry ${ei + 1}`}
        </span>
        <button
          className="btn btn-ghost btn-sm"
          style={{ color: "var(--ink-4)", padding: "6px 8px" }}
          onClick={() => editor.moveEntry(si, ei, -1)}
          aria-label="Move entry up"
        >
          <Icon name="arrowUp" size={14} />
        </button>
        <button
          className="btn btn-ghost btn-sm"
          style={{ color: "var(--ink-4)", padding: "6px 8px", transform: "rotate(180deg)" }}
          onClick={() => editor.moveEntry(si, ei, 1)}
          aria-label="Move entry down"
        >
          <Icon name="arrowUp" size={14} />
        </button>
        {canRemove && (
          <button
            className="btn btn-ghost btn-sm"
            style={{ color: "var(--ink-4)", padding: "6px 9px" }}
            onClick={() => editor.removeEntry(si, ei)}
            aria-label="Remove entry"
          >
            <Icon name="trash" size={15} />
          </button>
        )}
      </div>

      {isSkills ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Labeled label={titleLabel}>
            <Field
              value={entry.title}
              onChange={(v) => editor.setEntryField(si, ei, "title", v)}
              placeholder="e.g. Languages, Tools & Frameworks"
            />
          </Labeled>
          <Labeled label="Skills">
            <TagEditor
              tags={entry.tags}
              onChange={(next) => editor.setTags(si, ei, next)}
              placeholder="Type a skill and press Enter"
            />
          </Labeled>
        </div>
      ) : (
        <>
          <div className="editor-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Labeled label={titleLabel}>
              <Field value={entry.title} onChange={(v) => editor.setEntryField(si, ei, "title", v)} />
            </Labeled>
            <Labeled label={orgLabel}>
              <Field
                value={entry.organization}
                onChange={(v) => editor.setEntryField(si, ei, "organization", v)}
              />
            </Labeled>
            <Labeled label="Location">
              <Field
                value={entry.location}
                onChange={(v) => editor.setEntryField(si, ei, "location", v)}
              />
            </Labeled>
            <Labeled label="Dates">
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Field
                  value={entry.start}
                  onChange={(v) => editor.setEntryField(si, ei, "start", v)}
                  placeholder="Start"
                  ariaLabel="Start"
                />
                <span style={{ color: "var(--ink-3)" }}>–</span>
                <Field
                  value={entry.end}
                  onChange={(v) => editor.setEntryField(si, ei, "end", v)}
                  placeholder="End / Present"
                  ariaLabel="End"
                />
              </div>
            </Labeled>
          </div>

          {(kind === "projects" || kind === "awards" || kind === "certifications" || kind === "custom") && (
            <div style={{ marginTop: 14 }}>
              <Labeled label="Description">
                <TextArea
                  value={entry.description}
                  onChange={(v) => editor.setEntryField(si, ei, "description", v)}
                  rows={2}
                  placeholder="A sentence or two about this entry."
                />
              </Labeled>
            </div>
          )}

          {(kind === "projects" || kind === "custom") && (
            <div style={{ marginTop: 14 }}>
              <Labeled label="Link">
                <Field
                  value={entry.link}
                  onChange={(v) => editor.setEntryField(si, ei, "link", v)}
                  placeholder="https://…"
                />
              </Labeled>
            </div>
          )}

          {/* bullets */}
          <div style={{ marginTop: 16 }}>
            <div className="label" style={{ marginBottom: 8 }}>
              Bullet points
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {entry.bullets.map((b, bi) => (
                <div key={bi} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "var(--accent)",
                      marginTop: 13,
                      flexShrink: 0,
                    }}
                  />
                  <TextArea
                    value={b}
                    onChange={(v) => editor.setBullet(si, ei, bi, v)}
                    rows={2}
                    style={{ flex: 1 }}
                    placeholder="Lead with impact — what changed and by how much."
                    ariaLabel={`Bullet ${bi + 1}`}
                  />
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ color: "var(--ink-4)", padding: "6px 8px", marginTop: 4 }}
                    onClick={() => editor.removeBullet(si, ei, bi)}
                    aria-label="Remove bullet"
                  >
                    <Icon name="close" size={14} />
                  </button>
                </div>
              ))}
              <button
                className="btn btn-ghost btn-sm"
                style={{ alignSelf: "flex-start", color: "var(--ink-3)" }}
                onClick={() => editor.addBullet(si, ei)}
              >
                <Icon name="plus" size={14} /> Add a bullet
              </button>
            </div>
          </div>

          {/* tags (tech / keywords) for projects & custom */}
          {(kind === "projects" || kind === "custom") && (
            <div style={{ marginTop: 16 }}>
              <Labeled label="Tags / tech">
                <TagEditor
                  tags={entry.tags}
                  onChange={(next) => editor.setTags(si, ei, next)}
                  placeholder="Add a tag and press Enter"
                />
              </Labeled>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** One dynamic section: editable heading + kind, plus its entries. */
function SectionEditor({
  editor,
  si,
  section,
  total,
  registerRef,
}: {
  editor: ResumeEditorApi;
  si: number;
  section: ResumeSection;
  total: number;
  registerRef: (el: HTMLDivElement | null) => void;
}) {
  const itemWord = section.kind === "skills" ? "group" : "entry";
  return (
    <Card
      anchor={`section-${si}`}
      icon={kindIcon(section.kind)}
      innerRef={registerRef}
      headerClassName="editor-section-header"
      header={
        <>
          <input
            className="field editor-heading-input"
            value={section.heading}
            onChange={(e) => editor.setSectionHeading(si, e.target.value)}
            aria-label="Section heading"
            style={{ flex: 1, fontSize: 16, fontWeight: 600, padding: "8px 12px" }}
            placeholder="Section heading"
          />
          <select
            className="field editor-kind-select"
            value={section.kind}
            onChange={(e) => editor.setSectionKind(si, e.target.value as SectionKind)}
            aria-label="Section type"
            style={{ width: 140, padding: "8px 10px", fontSize: 13 }}
          >
            {KIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            className="btn btn-ghost btn-sm"
            style={{ color: "var(--ink-4)", padding: "6px 8px" }}
            onClick={() => editor.moveSection(si, -1)}
            disabled={si === 0}
            aria-label="Move section up"
          >
            <Icon name="arrowUp" size={15} />
          </button>
          <button
            className="btn btn-ghost btn-sm"
            style={{ color: "var(--ink-4)", padding: "6px 8px", transform: "rotate(180deg)" }}
            onClick={() => editor.moveSection(si, 1)}
            disabled={si === total - 1}
            aria-label="Move section down"
          >
            <Icon name="arrowUp" size={15} />
          </button>
          <button
            className="btn btn-ghost btn-sm"
            style={{ color: "var(--ink-4)", padding: "6px 9px" }}
            onClick={() => editor.removeSection(si)}
            aria-label="Remove section"
          >
            <Icon name="trash" size={15} />
          </button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {section.entries.map((entry, ei) => (
          <EntryEditor
            key={ei}
            editor={editor}
            si={si}
            ei={ei}
            kind={section.kind}
            entry={entry}
            canRemove={section.entries.length > 1}
          />
        ))}
        <button
          className="btn btn-glass btn-sm"
          style={{ justifyContent: "center", borderStyle: "dashed" }}
          onClick={() => editor.addEntry(si)}
        >
          <Icon name="plus" size={16} /> Add {itemWord}
        </button>
      </div>
    </Card>
  );
}

/** The stacked, controlled editing surface for the whole resume. */
export function EditorSections({
  editor,
  registerRef,
}: {
  editor: ResumeEditorApi;
  /** Register a DOM node for an anchor id so the parent can scroll-spy + jump. */
  registerRef: (anchor: string) => (el: HTMLDivElement | null) => void;
}) {
  const { draft } = editor;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Contact */}
      <Card anchor="contact" icon="user" innerRef={registerRef("contact")} header={<span style={{ fontSize: 16.5, fontWeight: 600 }}>Contact</span>}>
        <div className="editor-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Labeled label="Full name">
            <Field value={draft.contact.name} onChange={(v) => editor.setContact("name", v)} placeholder="Your name" />
          </Labeled>
          <Labeled label="Title">
            <Field value={draft.contact.title} onChange={(v) => editor.setContact("title", v)} placeholder="e.g. Senior Product Designer" />
          </Labeled>
          <Labeled label="Email">
            <Field type="email" value={draft.contact.email} onChange={(v) => editor.setContact("email", v)} placeholder="you@email.com" />
          </Labeled>
          <Labeled label="Phone">
            <Field value={draft.contact.phone} onChange={(v) => editor.setContact("phone", v)} placeholder="+1 555 000 0000" />
          </Labeled>
          <Labeled label="Location">
            <Field value={draft.contact.location} onChange={(v) => editor.setContact("location", v)} placeholder="City, Country" />
          </Labeled>
          <Labeled label="LinkedIn">
            <Field value={draft.contact.linkedin} onChange={(v) => editor.setContact("linkedin", v)} placeholder="linkedin.com/in/you" />
          </Labeled>
          <Labeled label="Website">
            <Field value={draft.contact.website} onChange={(v) => editor.setContact("website", v)} placeholder="yoursite.com" />
          </Labeled>
          <Labeled label="GitHub">
            <Field value={draft.contact.github} onChange={(v) => editor.setContact("github", v)} placeholder="github.com/you" />
          </Labeled>
        </div>
      </Card>

      {/* Summary */}
      <Card anchor="summary" icon="doc" innerRef={registerRef("summary")} header={<span style={{ fontSize: 16.5, fontWeight: 600 }}>Summary</span>}>
        <TextArea
          value={draft.summary}
          onChange={editor.setSummary}
          rows={4}
          placeholder="A few lines on who you are and the impact you bring. Lead with your strongest signal."
          ariaLabel="Professional summary"
        />
      </Card>

      {/* Dynamic sections */}
      {draft.sections.map((section, si) => (
        <SectionEditor
          key={si}
          editor={editor}
          si={si}
          section={section}
          total={draft.sections.length}
          registerRef={registerRef(`section-${si}`)}
        />
      ))}

      {/* Add section */}
      <div className="glass" style={{ borderRadius: "var(--r-lg)", padding: "16px 20px" }}>
        <div className="label" style={{ marginBottom: 10 }}>
          Add a section
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {KIND_OPTIONS.map((o) => (
            <button
              key={o.value}
              className="btn btn-glass btn-sm"
              onClick={() => editor.addSection(o.value)}
            >
              <Icon name="plus" size={14} /> {o.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
