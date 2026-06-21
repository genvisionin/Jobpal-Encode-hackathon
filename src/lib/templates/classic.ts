/**
 * classic.ts — "Heritage": timeless centered single-column template.
 *
 * Centered serif header, hairline rules, restrained ink palette. The format
 * recruiters and ATS parsers know best — single column, standard headings,
 * reverse-chronological body. Sections render from the shared `renderSections`
 * DOM so every heading and entry appears verbatim.
 */

import { esc } from "./helpers";
import { buildAtsTemplate, contactLine } from "./ats-base";

export const classic = buildAtsTemplate({
  id: "classic",
  name: "Classic",
  tag: "Timeless",
  defaultAccent: "#1a1a22",
  summaryHeading: "Summary",
  fonts: `<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif&family=Hanken+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />`,
  header: (c) => `
    <div class="name">${esc(c.name || "Your Name")}</div>
    ${c.title ? `<div class="title">${esc(c.title)}</div>` : ""}
    <div class="contact">${contactLine(c, "&nbsp;&nbsp;•&nbsp;&nbsp;")}</div>`,
  css: ({ accent, pageWidth }) => `
  body { font-family: 'Hanken Grotesk', Helvetica, Arial, sans-serif; font-size: 11px; line-height: 1.55; color: #23232b; background: #fff; }
  .page { width: 100%; max-width: ${pageWidth}; margin: 0 auto; padding: 46px 56px; }
  header { text-align: center; padding-bottom: 14px; border-bottom: 1px solid #d8d8e0; }
  .name { font-family: 'Instrument Serif', Georgia, serif; font-size: 36px; line-height: 1.05; color: #1a1a22; letter-spacing: 0.01em; }
  .title { font-size: 12px; font-weight: 600; color: ${accent}; margin-top: 4px; letter-spacing: 0.04em; text-transform: uppercase; }
  .contact { font-size: 10.5px; color: #55555f; margin-top: 8px; }
  .contact .sep { color: #c5c5cc; }
  .block { margin-top: 17px; }
  h2 { font-family: 'Instrument Serif', Georgia, serif; font-size: 16px; color: #1a1a22; text-align: center; letter-spacing: 0.02em; margin-bottom: 9px; position: relative; }
  h2::after { content: ""; display: block; width: 36px; height: 1.5px; background: ${accent}; margin: 5px auto 0; }
  .summary { font-size: 11px; line-height: 1.65; color: #33333d; text-align: center; }
  .entry { margin-bottom: 12px; }
  .entry-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
  .entry-title { font-weight: 700; font-size: 11.5px; color: #1a1a22; }
  .entry-date { font-size: 10.5px; color: #8a8a95; white-space: nowrap; }
  .entry-meta { font-size: 11px; font-style: italic; color: #55555f; margin-top: 1px; }
  .entry-desc { font-size: 10.5px; color: #33333d; margin-top: 2px; line-height: 1.55; }
  .entry ul { padding-left: 17px; margin-top: 5px; list-style: disc; }
  .entry li { font-size: 10.5px; line-height: 1.55; color: #33333d; margin-bottom: 3px; }
  .entry-tags { margin-top: 4px; font-size: 10px; color: #55555f; }
  .entry-tag { display: inline; }
  .entry-tag:not(:last-child)::after { content: " · "; color: #b5b5bc; }
  .entry-link { font-size: 9.5px; color: #8a8a95; margin-top: 1px; }
  .skills { display: flex; flex-direction: column; gap: 4px; }
  .skill-row { font-size: 10.5px; color: #33333d; }
  .skill-cat { font-weight: 700; color: #1a1a22; }`,
});
