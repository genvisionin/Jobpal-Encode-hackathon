/**
 * compact.ts — "Compact": dense, space-efficient single-column template.
 *
 * Tighter type and spacing to fit experience-heavy resumes onto fewer pages,
 * with a slim two-line header and inline-ruled headings. Still strictly single
 * column with standard headings and real bullet lists, so the density never
 * costs ATS parseability. Best for long careers / many projects.
 */

import { esc } from "./helpers";
import { buildAtsTemplate, contactLine } from "./ats-base";

export const compact = buildAtsTemplate({
  id: "compact",
  name: "Compact",
  tag: "Dense",
  defaultAccent: "#5E5CE6",
  summaryHeading: "Summary",
  fonts: `<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />`,
  header: (c) => `
    <div class="name-row">
      <span class="name">${esc(c.name || "Your Name")}</span>
      ${c.title ? `<span class="role">${esc(c.title)}</span>` : ""}
    </div>
    <div class="contact">${contactLine(c)}</div>`,
  css: ({ accent, pageWidth }) => `
  body { font-family: 'Hanken Grotesk', Helvetica, Arial, sans-serif; font-size: 10px; line-height: 1.42; color: #2a2a32; background: #fff; }
  .page { width: 100%; max-width: ${pageWidth}; margin: 0 auto; padding: 34px 44px; }
  header { padding-bottom: 8px; border-bottom: 1.5px solid ${accent}; }
  .name-row { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .name { font-size: 21px; font-weight: 700; letter-spacing: -0.01em; color: #14141a; }
  .role { font-size: 11px; font-weight: 600; color: ${accent}; }
  .contact { display: flex; flex-wrap: wrap; gap: 2px 7px; font-size: 9.5px; color: #5a5a63; margin-top: 5px; }
  .contact .sep { color: #c8c8ce; }
  .block { margin-top: 12px; }
  h2 { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: ${accent}; border-bottom: 1px solid #e6e6ec; padding-bottom: 2px; margin-bottom: 6px; }
  .summary { font-size: 10px; line-height: 1.5; color: #33333d; }
  .entry { margin-bottom: 8px; }
  .entry-head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
  .entry-title { font-weight: 700; font-size: 10.5px; color: #14141a; }
  .entry-date { font-size: 9.5px; color: #8a8a92; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .entry-meta { font-size: 10px; font-weight: 600; color: ${accent}; margin-top: 0; }
  .entry-desc { font-size: 9.5px; color: #44444d; margin-top: 2px; line-height: 1.45; }
  .entry ul { padding-left: 14px; margin-top: 3px; list-style: disc; }
  .entry li { font-size: 9.5px; line-height: 1.45; color: #33333d; margin-bottom: 2px; }
  .entry li::marker { color: #b0b0b8; }
  .entry-tags { margin-top: 3px; font-size: 9px; color: #5a5a63; }
  .entry-tag { display: inline; }
  .entry-tag:not(:last-child)::after { content: " · "; color: #c2c2c8; }
  .entry-link { font-size: 9px; color: #8a8a92; margin-top: 1px; }
  .skills { display: flex; flex-direction: column; gap: 3px; }
  .skill-row { font-size: 9.5px; color: #33333d; line-height: 1.45; }
  .skill-cat { font-weight: 700; color: #14141a; }`,
});
