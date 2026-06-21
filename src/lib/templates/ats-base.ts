/**
 * ats-base.ts — the shared engine behind every selectable resume template.
 *
 * Every template Jobpal ships is **single-column and ATS-safe** by
 * construction: real selectable text, standard headings rendered verbatim from
 * the resume's `sections`, system-safe font stacks, disc bullet lists, and no
 * tables / text-boxes / images / icons / multi-column layouts (the formatting
 * that scrambles or drops content in applicant-tracking parsers).
 *
 * A template is therefore just a *theme*: a font import, a header layout, and a
 * block of CSS. `buildAtsTemplate` assembles those into a complete, self-
 * contained HTML document using the shared `renderSections` body, so the six
 * designs share one battle-tested DOM (which the paginator + thumbnailer in
 * embed.ts already understand) and differ only in typography and spacing.
 */

import type { TemplateDefinition, RenderOptions } from "./types";
import { PAGE_WIDTH } from "./types";
import type { ResumeData, Contact } from "@/lib/schema";
import { esc, contactParts, hasSummary, renderSections, baseHead, PRINT_CSS } from "./helpers";

export interface AtsTemplateConfig {
  id: string;
  name: string;
  /** Short descriptor shown on the picker tile. */
  tag: string;
  /** The template's signature accent (overridable via RenderOptions.accent). */
  defaultAccent: string;
  /** Font `<link>`/`<style>` markup injected into <head>. Omit for system fonts. */
  fonts?: string;
  /** Per-template CSS; receives the resolved accent + page width. */
  css: (ctx: { accent: string; pageWidth: string }) => string;
  /** Renders the inner HTML of the single in-body <header> block. */
  header: (c: Contact, accent: string) => string;
  /** Heading for the professional-summary block (kept standard for ATS). */
  summaryHeading?: string;
}

/** Build a contact line; caller styles `.contact` / `.sep` to taste. */
export function contactLine(c: Contact, separator = "·"): string {
  return contactParts(c)
    .map((p) => `<span>${p}</span>`)
    .join(`<span class="sep">${separator}</span>`);
}

/** Assemble a config into a complete, ATS-safe single-column template. */
export function buildAtsTemplate(config: AtsTemplateConfig): TemplateDefinition {
  function render(resume: ResumeData, options: RenderOptions = {}): string {
    const paper = options.paper ?? "letter";
    const accent = options.accent ?? config.defaultAccent;
    const pageWidth = PAGE_WIDTH[paper];
    const c = resume.contact;
    const docTitle = options.documentTitle || c.name || "Resume";

    const summary = hasSummary(resume)
      ? `<section class="block avoid-break"><h2>${esc(config.summaryHeading ?? "Summary")}</h2><p class="summary">${esc(resume.summary)}</p></section>`
      : "";

    return `<!DOCTYPE html>
<html lang="en">
<head>
${baseHead(docTitle)}
${config.fonts ?? ""}
<style>
${PRINT_CSS}
${config.css({ accent, pageWidth })}
</style>
</head>
<body>
<div class="page">
  <header class="avoid-break">${config.header(c, accent)}</header>
  ${summary}
  ${renderSections(resume)}
</div>
</body>
</html>`;
  }

  return { id: config.id, name: config.name, tag: config.tag, render };
}
