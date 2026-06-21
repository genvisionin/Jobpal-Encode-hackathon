/**
 * executive.ts — "Executive": authoritative single-column template.
 *
 * For senior / leadership profiles. A large name with a generously letter-
 * spaced uppercase title, a full-width rule under the header, and section
 * headings marked by a short accent tab on the left. Slightly larger type and
 * roomy spacing read as seniority while staying strictly single-column and
 * ATS-parseable (standard headings, real bullets, no graphics).
 */

import { esc } from "./helpers";
import { buildAtsTemplate, contactLine } from "./ats-base";

export const executive = buildAtsTemplate({
  id: "executive",
  name: "Executive",
  tag: "Leadership",
  defaultAccent: "#1f3a5f",
  summaryHeading: "Executive Summary",
  fonts: `<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700;800&display=swap" rel="stylesheet" />`,
  header: (c) => `
    <div class="name">${esc(c.name || "Your Name")}</div>
    ${c.title ? `<div class="role">${esc(c.title)}</div>` : ""}
    <div class="contact">${contactLine(c)}</div>`,
  css: ({ accent, pageWidth }) => `
  body { font-family: 'Hanken Grotesk', Helvetica, Arial, sans-serif; font-size: 11px; line-height: 1.55; color: #24242c; background: #fff; }
  .page { width: 100%; max-width: ${pageWidth}; margin: 0 auto; padding: 46px 54px; }
  header { padding-bottom: 13px; border-bottom: 2.5px solid ${accent}; }
  .name { font-size: 30px; font-weight: 800; letter-spacing: -0.015em; color: ${accent}; line-height: 1.04; }
  .role { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.16em; color: #55555f; margin-top: 6px; }
  .contact { display: flex; flex-wrap: wrap; gap: 4px 8px; font-size: 10.5px; color: #55555f; margin-top: 9px; }
  .contact .sep { color: #c5c5cc; }
  .block { margin-top: 19px; }
  h2 { font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: ${accent}; margin-bottom: 10px; padding-left: 11px; border-left: 3px solid ${accent}; }
  .summary { font-size: 11px; line-height: 1.68; color: #33333d; }
  .entry { margin-bottom: 13px; }
  .entry-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
  .entry-title { font-weight: 700; font-size: 12px; color: #1a1a22; }
  .entry-date { font-size: 10.5px; font-weight: 500; color: #77777f; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .entry-meta { font-size: 11px; font-weight: 600; color: ${accent}; margin-top: 1px; }
  .entry-desc { font-size: 10.5px; color: #44444d; margin-top: 3px; line-height: 1.6; }
  .entry ul { padding-left: 16px; margin-top: 6px; list-style: disc; }
  .entry li { font-size: 10.5px; line-height: 1.58; color: #33333d; margin-bottom: 4px; }
  .entry li::marker { color: ${accent}; }
  .entry-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 5px; }
  .entry-tag { font-size: 9.5px; font-weight: 600; color: ${accent}; background: rgba(31,58,95,.07); padding: 2px 8px; border-radius: 3px; }
  .entry-link { font-size: 9.5px; color: #8a8a95; margin-top: 2px; }
  .skills { display: flex; flex-direction: column; gap: 5px; }
  .skill-row { font-size: 10.5px; color: #3a3a42; line-height: 1.55; }
  .skill-cat { font-weight: 700; color: ${accent}; }`,
});
