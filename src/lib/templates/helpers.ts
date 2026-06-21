/**
 * helpers.ts — shared HTML building blocks for resume templates.
 *
 * Templates render from the DYNAMIC resume shape: contact + summary + an
 * ordered list of `sections`, each with a verbatim heading and entries. The
 * builders here render whatever fields an entry actually has, so any section
 * kind (experience, education, projects, awards, skills, custom) renders
 * cleanly without hardcoding. All dynamic content runs through `esc`.
 */

import type { ResumeData, Contact, ResumeSection, ResumeEntry } from "@/lib/schema";

/** Escape user/LLM text for safe HTML interpolation. */
export function esc(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Build the contact line as separate, separator-joined parts. */
export function contactParts(contact: Contact): string[] {
  const parts: string[] = [];
  if (contact.email) parts.push(esc(contact.email));
  if (contact.phone) parts.push(esc(contact.phone));
  if (contact.location) parts.push(esc(contact.location));
  if (contact.linkedin) parts.push(esc(contact.linkedin));
  if (contact.website) parts.push(esc(contact.website));
  if (contact.github) parts.push(esc(contact.github));
  return parts;
}

export function dateRange(start: string, end: string): string {
  if (start && end) return `${esc(start)} — ${esc(end)}`;
  return esc(start || end || "");
}

export function hasSummary(r: ResumeData): boolean {
  return Boolean(r.summary?.trim());
}

/** True if a section has anything worth rendering. */
export function sectionHasContent(s: ResumeSection): boolean {
  return s.entries.some(
    (e) =>
      e.title ||
      e.organization ||
      e.description ||
      e.bullets.length ||
      e.tags.length ||
      e.link,
  );
}

/** True if an entry carries only tags (typical of skill groups). */
function isTagOnly(e: ResumeEntry): boolean {
  return (
    e.tags.length > 0 &&
    !e.title &&
    !e.organization &&
    !e.description &&
    e.bullets.length === 0
  );
}

/**
 * Render one section's body using a shared set of class names. Templates
 * supply the CSS for these classes, so a single renderer styles every kind:
 *   .skills .skill-row .skill-cat
 *   .entry .entry-head .entry-title .entry-date .entry-meta .entry-desc
 *   .entry ul/li .entry-tags .entry-tag .entry-link
 */
export function renderEntries(section: ResumeSection): string {
  // Skills (or any tag-only section): compact grouped rows.
  if (section.kind === "skills" || section.entries.every(isTagOnly)) {
    const rows = section.entries
      .map((e) => {
        const items = [...e.tags, ...e.bullets].map(esc).join(" · ");
        if (!items) return "";
        return `<div class="skill-row">${e.title ? `<span class="skill-cat">${esc(e.title)}:</span> ` : ""}${items}</div>`;
      })
      .filter(Boolean)
      .join("");
    return `<div class="skills">${rows}</div>`;
  }

  // Generic entries: show only the fields that are present.
  return section.entries
    .map((e) => {
      const date = dateRange(e.start, e.end);
      const meta = [e.organization, e.location].filter(Boolean).map(esc).join(" · ");
      const head =
        e.title || date
          ? `<div class="entry-head"><span class="entry-title">${esc(e.title)}</span>${date ? `<span class="entry-date">${date}</span>` : ""}</div>`
          : "";
      const metaLine = meta ? `<div class="entry-meta">${meta}</div>` : "";
      const desc = e.description ? `<div class="entry-desc">${esc(e.description)}</div>` : "";
      const bullets = e.bullets.length
        ? `<ul>${e.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>`
        : "";
      const tags = e.tags.length
        ? `<div class="entry-tags">${e.tags.map((t) => `<span class="entry-tag">${esc(t)}</span>`).join("")}</div>`
        : "";
      const link = e.link ? `<div class="entry-link">${esc(e.link)}</div>` : "";
      return `<div class="entry avoid-break">${head}${metaLine}${desc}${bullets}${tags}${link}</div>`;
    })
    .join("");
}

/** Render all sections of the resume in order, as single-column blocks. */
export function renderSections(resume: ResumeData): string {
  return resume.sections
    .filter(sectionHasContent)
    .map(
      (s) =>
        `<section class="block avoid-break"><h2>${esc(s.heading || "Section")}</h2>${renderEntries(s)}</section>`,
    )
    .join("");
}

/**
 * Shared meta + document title. The `<title>` is what browsers use as the
 * default "Save as PDF" filename, so callers pass a clean, filename-ready
 * string (e.g. "Avery Chen - Acme"); we don't decorate it.
 */
export function baseHead(title: string): string {
  return `<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)}</title>`;
}

/**
 * Print-safety CSS shared by all templates.
 *
 * NOTE: we intentionally do NOT zero `.page` padding on print. The padding is
 * what gives the resume its top/side margins, and the paged renderer relies on
 * it for a true WYSIWYG print (it sets `@page { margin: 0 }` and lets the
 * template's own `.page` padding be the printed margin). Zeroing it here made
 * downloaded PDFs go edge-to-edge.
 */
export const PRINT_CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  a { color: inherit; text-decoration: none; white-space: nowrap; }
  ul { list-style: none; }
  .avoid-break { break-inside: avoid; page-break-inside: avoid; }
`;
