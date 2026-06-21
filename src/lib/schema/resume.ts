/**
 * resume.ts — the canonical, FULLY DYNAMIC resume data contract.
 *
 * A resume is `contact` + `summary` + an ordered list of `sections`. Every
 * other part of the CV (experience, education, projects, awards, publications,
 * volunteering, languages, or anything custom) is captured as a section with
 * its verbatim heading and a list of entries. Nothing is dropped, and new or
 * unusual section types need no code changes.
 *
 * This is the single source of truth across the app:
 * - the parser extracts an uploaded CV into this shape (every section)
 * - the LLM tailors a `ResumeData` into a new `ResumeData` for a job
 * - every HTML template renders from this shape
 * - the in-app editor edits this shape
 *
 * Fields use the lenient LLM helpers (null/missing → safe defaults) so real
 * model output never fails validation over a stray null.
 */

import { z } from "zod";
import { llmString, llmStringArray } from "./helpers";

export const contactSchema = z.object({
  name: llmString(),
  title: llmString(),
  email: llmString(),
  phone: llmString(),
  location: llmString(),
  linkedin: llmString(),
  website: llmString(),
  github: llmString(),
});

/**
 * One item within a section. Not every field applies to every kind —
 * renderers show only what's present:
 * - experience: title=role, organization=company, location, start, end, bullets
 * - education:  title=degree, organization=school, location, start, end, bullets
 * - projects:   title=name, description, link, tags(tech), bullets
 * - certifications/awards: title=name, organization=issuer/event, end=year, description
 * - skills:     title=group label (optional), tags=the skills
 * - custom:     any combination — bullets and/or description and/or tags
 */
export const resumeEntrySchema = z.object({
  title: llmString(),
  organization: llmString(),
  location: llmString(),
  start: llmString(),
  end: llmString(),
  description: llmString(),
  link: llmString(),
  bullets: llmStringArray(),
  tags: llmStringArray(),
});

/** Known section kinds drive nice rendering; "custom" is the catch-all. */
export const sectionKindSchema = z
  .enum(["experience", "education", "projects", "skills", "certifications", "awards", "custom"])
  .catch("custom");

export const resumeSectionSchema = z.object({
  /** Stable slug; generated from the heading if the model omits it. */
  id: llmString(),
  /** The heading exactly as it appears on the CV, e.g. "VIBE CODED PROJECTS". */
  heading: llmString(),
  kind: sectionKindSchema.default("custom"),
  entries: z.array(resumeEntrySchema).default([]),
});

/**
 * The full resume. `contact` and `summary` are universal (templates put them
 * in the header); everything else lives in ordered `sections`.
 */
export const resumeSchema = z.object({
  contact: contactSchema.prefault(() => contactSchema.parse({})),
  summary: llmString(),
  sections: z.array(resumeSectionSchema).default([]),
});

export type Contact = z.infer<typeof contactSchema>;
export type ResumeEntry = z.infer<typeof resumeEntrySchema>;
export type ResumeSection = z.infer<typeof resumeSectionSchema>;
export type SectionKind = z.infer<typeof sectionKindSchema>;
export type ResumeData = z.infer<typeof resumeSchema>;

/* ---------- helpers ---------- */

/** An empty, valid resume — useful as a safe default. */
export function emptyResume(): ResumeData {
  return resumeSchema.parse({});
}

/** A slug for a section heading (used when the model omits an id). */
export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "section"
  );
}

/** Ensure every section has a stable, unique id. Mutates a copy and returns it. */
export function withSectionIds(resume: ResumeData): ResumeData {
  const seen = new Set<string>();
  const sections = resume.sections.map((s, i) => {
    let id = s.id?.trim() || slugify(s.heading) || `section-${i}`;
    while (seen.has(id)) id = `${id}-${i}`;
    seen.add(id);
    return { ...s, id };
  });
  return { ...resume, sections };
}

/** All sections of a given kind, in order. */
export function sectionsByKind(resume: ResumeData, kind: SectionKind): ResumeSection[] {
  return resume.sections.filter((s) => s.kind === kind);
}

/** Flattened skill items across all skill sections. */
export function allSkills(resume: ResumeData): string[] {
  return sectionsByKind(resume, "skills").flatMap((s) =>
    s.entries.flatMap((e) => (e.tags.length ? e.tags : e.bullets)),
  );
}

/** A compact text blob of the whole resume — handy for scoring/keywords. */
export function resumeToPlainText(resume: ResumeData): string {
  const parts: string[] = [resume.contact.name, resume.contact.title, resume.summary];
  for (const s of resume.sections) {
    parts.push(s.heading);
    for (const e of s.entries) {
      parts.push(e.title, e.organization, e.description, ...e.bullets, ...e.tags);
    }
  }
  return parts.filter(Boolean).join("\n");
}
