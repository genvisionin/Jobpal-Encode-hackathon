"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  withSectionIds,
  type ResumeData,
  type ResumeSection,
  type ResumeEntry,
  type SectionKind,
} from "@/lib/schema";

/** A blank entry row (all optional fields empty). */
export function blankEntry(): ResumeEntry {
  return {
    title: "",
    organization: "",
    location: "",
    start: "",
    end: "",
    description: "",
    link: "",
    bullets: [],
    tags: [],
  };
}

/** A blank section of a given kind, with one starter entry. */
export function blankSection(kind: SectionKind = "custom", heading = ""): ResumeSection {
  const defaultHeadings: Record<SectionKind, string> = {
    experience: "Experience",
    education: "Education",
    projects: "Projects",
    skills: "Skills",
    certifications: "Certifications",
    awards: "Awards",
    custom: "New Section",
  };
  return {
    id: "",
    heading: heading || defaultHeadings[kind],
    kind,
    entries: [blankEntry()],
  };
}

/** True if a section has anything worth keeping. */
export function sectionHasContent(s: ResumeSection): boolean {
  return s.entries.some(
    (e) => e.title || e.organization || e.description || e.bullets.some(Boolean) || e.tags.length || e.link,
  );
}

/**
 * useResumeEditor — owns a single, controlled ResumeData draft and exposes
 * typed mutators for contact, summary, and the FULLY DYNAMIC list of
 * sections (add/remove/reorder sections, entries, bullets and tags, and edit
 * headings). Tracks dirtiness against the initial value so callers can
 * enable/disable save and warn on unsaved changes.
 */
export function useResumeEditor(initial: ResumeData) {
  const initialRef = useRef(withSectionIds(initial));
  const [draft, setDraft] = useState<ResumeData>(initialRef.current);

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(initialRef.current),
    [draft],
  );

  // ---- contact ----
  const setContact = useCallback(
    (key: keyof ResumeData["contact"], value: string) =>
      setDraft((d) => ({ ...d, contact: { ...d.contact, [key]: value } })),
    [],
  );

  // ---- summary ----
  const setSummary = useCallback(
    (value: string) => setDraft((d) => ({ ...d, summary: value })),
    [],
  );

  // ---- section-level mutators (operate by index) ----
  const mutateSection = useCallback(
    (si: number, fn: (s: ResumeSection) => ResumeSection) =>
      setDraft((d) => ({
        ...d,
        sections: d.sections.map((s, i) => (i === si ? fn(s) : s)),
      })),
    [],
  );

  const addSection = useCallback((kind: SectionKind = "custom") => {
    setDraft((d) => withSectionIds({ ...d, sections: [...d.sections, blankSection(kind)] }));
  }, []);

  const removeSection = useCallback((si: number) => {
    setDraft((d) => ({ ...d, sections: d.sections.filter((_, i) => i !== si) }));
  }, []);

  const moveSection = useCallback((si: number, dir: -1 | 1) => {
    setDraft((d) => {
      const target = si + dir;
      if (target < 0 || target >= d.sections.length) return d;
      const sections = [...d.sections];
      [sections[si], sections[target]] = [sections[target], sections[si]];
      return { ...d, sections };
    });
  }, []);

  const setSectionHeading = useCallback(
    (si: number, heading: string) => mutateSection(si, (s) => ({ ...s, heading })),
    [mutateSection],
  );
  const setSectionKind = useCallback(
    (si: number, kind: SectionKind) => mutateSection(si, (s) => ({ ...s, kind })),
    [mutateSection],
  );

  // ---- entry-level mutators ----
  const addEntry = useCallback(
    (si: number) => mutateSection(si, (s) => ({ ...s, entries: [...s.entries, blankEntry()] })),
    [mutateSection],
  );
  const removeEntry = useCallback(
    (si: number, ei: number) =>
      mutateSection(si, (s) => ({ ...s, entries: s.entries.filter((_, i) => i !== ei) })),
    [mutateSection],
  );
  const moveEntry = useCallback(
    (si: number, ei: number, dir: -1 | 1) =>
      mutateSection(si, (s) => {
        const target = ei + dir;
        if (target < 0 || target >= s.entries.length) return s;
        const entries = [...s.entries];
        [entries[ei], entries[target]] = [entries[target], entries[ei]];
        return { ...s, entries };
      }),
    [mutateSection],
  );
  const setEntryField = useCallback(
    (si: number, ei: number, key: keyof ResumeEntry, value: string) =>
      mutateSection(si, (s) => ({
        ...s,
        entries: s.entries.map((e, i) => (i === ei ? { ...e, [key]: value } : e)),
      })),
    [mutateSection],
  );

  // ---- bullet-level mutators ----
  const addBullet = useCallback(
    (si: number, ei: number) =>
      mutateSection(si, (s) => ({
        ...s,
        entries: s.entries.map((e, i) => (i === ei ? { ...e, bullets: [...e.bullets, ""] } : e)),
      })),
    [mutateSection],
  );
  const setBullet = useCallback(
    (si: number, ei: number, bi: number, value: string) =>
      mutateSection(si, (s) => ({
        ...s,
        entries: s.entries.map((e, i) =>
          i === ei ? { ...e, bullets: e.bullets.map((b, j) => (j === bi ? value : b)) } : e,
        ),
      })),
    [mutateSection],
  );
  const removeBullet = useCallback(
    (si: number, ei: number, bi: number) =>
      mutateSection(si, (s) => ({
        ...s,
        entries: s.entries.map((e, i) =>
          i === ei ? { ...e, bullets: e.bullets.filter((_, j) => j !== bi) } : e,
        ),
      })),
    [mutateSection],
  );

  // ---- tag-level mutators (skills etc.) ----
  const setTags = useCallback(
    (si: number, ei: number, tags: string[]) =>
      mutateSection(si, (s) => ({
        ...s,
        entries: s.entries.map((e, i) => (i === ei ? { ...e, tags } : e)),
      })),
    [mutateSection],
  );

  // ---- strength meter ----
  const strength = useMemo(() => {
    const checks = [
      Boolean(draft.contact.name && draft.contact.email),
      Boolean(draft.summary.trim()),
      draft.sections.some((s) => s.kind === "experience" && sectionHasContent(s)),
      draft.sections.some((s) => s.kind === "education" && sectionHasContent(s)),
      draft.sections.some((s) => s.kind === "skills" && sectionHasContent(s)),
      draft.sections.filter(sectionHasContent).length >= 4,
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [draft]);

  /** Mark the current draft as the new baseline (call after a successful save). */
  const commit = useCallback(
    (next?: ResumeData) => {
      if (next) {
        const normalized = withSectionIds(next);
        initialRef.current = normalized;
        setDraft(normalized);
      } else {
        initialRef.current = draft;
      }
    },
    [draft],
  );

  return {
    draft,
    dirty,
    strength,
    setContact,
    setSummary,
    addSection,
    removeSection,
    moveSection,
    setSectionHeading,
    setSectionKind,
    addEntry,
    removeEntry,
    moveEntry,
    setEntryField,
    addBullet,
    setBullet,
    removeBullet,
    setTags,
    commit,
  };
}

export type ResumeEditorApi = ReturnType<typeof useResumeEditor>;
