/**
 * minimal.ts — "Minimal": whitespace-forward single-column template.
 *
 * The quietest design we ship: a clean grotesk throughout, generous leading,
 * left-aligned uppercase tracked headings over hairline rules, and a near-
 * monochrome palette (accent used only as a thin name underline). Maximum
 * legibility for both humans and ATS parsers — single column, standard
 * headings, real bullet lists, zero decoration.
 */

import { esc } from "./helpers";
import { buildAtsTemplate, contactLine } from "./ats-base";

export const minimal = buildAtsTemplate({
  id: "minimal",
  name: "Minimal",
  tag: "Clean",
  defaultAccent: "#1a1a22",
  summaryHeading: "Summary",
  fonts: `<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />`,
  header: (c) => `
    <div class="name">${esc(c.name || "Your Name")}</div>
    ${c.title ? `<div class="role">${esc(c.title)}</div>` : ""}
    <div class="contact">${contactLine(c, "/")}</div>`,
  css: ({ accent, pageWidth }) => `
  body { font-family: 'Hanken Grotesk', Helvetica, Arial, sans-serif; font-size: 11px; line-height: 1.6; color: #2a2a32; background: #fff; }
  .page { width: 100%; max-width: ${pageWidth}; margin: 0 auto; padding: 52px 58px; }
  header { padding-bottom: 18px; }
  .name { font-size: 25px; font-weight: 700; letter-spacing: -0.01em; color: #14141a; }
  .name::after { content: ""; display: block; width: 30px; height: 2px; background: ${accent}; margin-top: 9px; }
  .role { font-size: 12px; font-weight: 500; color: #55555f; margin-top: 11px; }
  .contact { display: flex; flex-wrap: wrap; gap: 4px 9px; font-size: 10.5px; color: #6a6a73; margin-top: 6px; }
  .contact .sep { color: #c8c8ce; }
  .block { margin-top: 22px; }
  h2 { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.18em; color: #14141a; border-bottom: 1px solid #e4e4ea; padding-bottom: 6px; margin-bottom: 11px; }
  .summary { font-size: 11px; line-height: 1.7; color: #3a3a42; }
  .entry { margin-bottom: 15px; }
  .entry-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
  .entry-title { font-weight: 600; font-size: 11.5px; color: #14141a; }
  .entry-date { font-size: 10px; color: #9a9aa2; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .entry-meta { font-size: 10.5px; color: #6a6a73; margin-top: 1px; }
  .entry-desc { font-size: 10.5px; color: #44444d; margin-top: 3px; line-height: 1.6; }
  .entry ul { padding-left: 15px; margin-top: 6px; list-style: disc; }
  .entry li { font-size: 10.5px; line-height: 1.6; color: #3a3a42; margin-bottom: 4px; }
  .entry li::marker { color: #b8b8be; }
  .entry-tags { margin-top: 5px; font-size: 10px; color: #6a6a73; }
  .entry-tag { display: inline; }
  .entry-tag:not(:last-child)::after { content: "  ·  "; color: #c8c8ce; }
  .entry-link { font-size: 9.5px; color: #9a9aa2; margin-top: 2px; }
  .skills { display: flex; flex-direction: column; gap: 5px; }
  .skill-row { font-size: 10.5px; color: #3a3a42; line-height: 1.55; }
  .skill-cat { font-weight: 600; color: #14141a; }`,
});
