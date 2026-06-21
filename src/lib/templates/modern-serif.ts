/**
 * modern-serif.ts — "Aurora": editorial single-column template.
 *
 * Instrument Serif display name over an indigo→pink hairline, Hanken Grotesk
 * body. Standard headings + clean single column keep it fully ATS-parseable;
 * the serif name is the only flourish. Body content renders from the shared
 * `renderSections` DOM, so every heading and entry appears verbatim.
 */

import { esc } from "./helpers";
import { buildAtsTemplate, contactLine } from "./ats-base";

export const modernSerif = buildAtsTemplate({
  id: "modern-serif",
  name: "Modern Serif",
  tag: "Editorial",
  defaultAccent: "#5E5CE6",
  summaryHeading: "Professional Summary",
  fonts: `<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif&family=Hanken+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />`,
  header: (c) => `
    <div class="name">${esc(c.name || "Your Name")}</div>
    <div class="gradient"></div>
    <div class="contact">${contactLine(c)}</div>
    ${c.title ? `<div class="role">${esc(c.title)}</div>` : ""}`,
  css: ({ accent, pageWidth }) => `
  body { font-family: 'Hanken Grotesk', Helvetica, Arial, sans-serif; font-size: 11px; line-height: 1.5; color: #1a1a22; background: #fff; }
  .page { width: 100%; max-width: ${pageWidth}; margin: 0 auto; padding: 44px 52px; }
  .name { font-family: 'Instrument Serif', Georgia, serif; font-size: 34px; line-height: 1.05; color: #1a1a22; }
  .gradient { height: 2px; background: linear-gradient(to right, ${accent}, #ff6b9d); border-radius: 1px; margin: 8px 0 9px; }
  .contact { display: flex; flex-wrap: wrap; gap: 4px 8px; font-size: 10.5px; color: #55555f; }
  .contact .sep { color: #c5c5cc; }
  .role { font-size: 12px; font-weight: 600; color: ${accent}; margin-top: 6px; }
  .block { margin-top: 18px; }
  h2 { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: ${accent}; border-bottom: 1.5px solid #e7e7ee; padding-bottom: 4px; margin-bottom: 9px; }
  .summary { font-size: 11px; line-height: 1.65; color: #2f2f37; }
  .entry { margin-bottom: 13px; }
  .entry-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
  .entry-title { font-weight: 700; font-size: 12px; color: #1a1a22; }
  .entry-date { font-size: 10.5px; color: #8a8a95; white-space: nowrap; }
  .entry-meta { font-size: 11px; font-weight: 600; color: ${accent}; margin-top: 1px; }
  .entry-desc { font-size: 10.5px; color: #44444d; margin-top: 3px; line-height: 1.55; }
  .entry ul { padding-left: 16px; margin-top: 6px; list-style: disc; }
  .entry li { font-size: 10.5px; line-height: 1.55; color: #33333d; margin-bottom: 4px; }
  .entry-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 5px; }
  .entry-tag { font-size: 9.5px; font-weight: 500; color: ${accent}; background: rgba(94,92,230,.09); border: 1px solid rgba(94,92,230,.2); padding: 2px 8px; border-radius: 4px; }
  .entry-link { font-size: 9.5px; color: #8a8a95; margin-top: 2px; }
  .skills { display: flex; flex-direction: column; gap: 5px; }
  .skill-row { font-size: 10.5px; color: #44444d; line-height: 1.5; }
  .skill-cat { font-weight: 600; color: #1a1a22; }`,
});
