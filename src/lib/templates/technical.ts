/**
 * technical.ts — "Technical": engineer-oriented single-column template.
 *
 * Grotesk body with JetBrains Mono accents (section headings, dates, and the
 * skill category labels). Tuned for engineers/data roles where a dense, well-
 * organized skills block and project links matter. The mono is purely visual —
 * the structure stays single-column with standard headings and real bullet
 * lists, so it parses cleanly in ATS.
 */

import { esc } from "./helpers";
import { buildAtsTemplate, contactLine } from "./ats-base";

export const technical = buildAtsTemplate({
  id: "technical",
  name: "Technical",
  tag: "Engineering",
  defaultAccent: "#34859a",
  summaryHeading: "Summary",
  fonts: `<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600&display=swap" rel="stylesheet" />`,
  header: (c) => `
    <div class="name">${esc(c.name || "Your Name")}</div>
    ${c.title ? `<div class="role">${esc(c.title)}</div>` : ""}
    <div class="contact">${contactLine(c)}</div>`,
  css: ({ accent, pageWidth }) => `
  body { font-family: 'Hanken Grotesk', Helvetica, Arial, sans-serif; font-size: 11px; line-height: 1.5; color: #22282a; background: #fff; }
  .page { width: 100%; max-width: ${pageWidth}; margin: 0 auto; padding: 44px 50px; }
  header { padding-bottom: 13px; border-bottom: 1.5px solid #e2e6e7; }
  .name { font-size: 26px; font-weight: 700; letter-spacing: -0.01em; color: #14191b; }
  .role { font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 500; color: ${accent}; margin-top: 5px; }
  .contact { font-family: 'JetBrains Mono', monospace; display: flex; flex-wrap: wrap; gap: 3px 8px; font-size: 9.5px; color: #5a6064; margin-top: 8px; }
  .contact .sep { color: #c5cacc; }
  .block { margin-top: 18px; }
  h2 { font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 600; letter-spacing: 0.02em; color: ${accent}; margin-bottom: 9px; padding-bottom: 4px; border-bottom: 1px solid #e2e6e7; }
  h2::before { content: "# "; color: #b4c1c4; }
  .summary { font-size: 11px; line-height: 1.65; color: #33393b; }
  .entry { margin-bottom: 13px; }
  .entry-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
  .entry-title { font-weight: 700; font-size: 11.5px; color: #14191b; }
  .entry-date { font-family: 'JetBrains Mono', monospace; font-size: 9.5px; color: #80878a; white-space: nowrap; }
  .entry-meta { font-size: 11px; font-weight: 600; color: ${accent}; margin-top: 1px; }
  .entry-desc { font-size: 10.5px; color: #44494b; margin-top: 3px; line-height: 1.55; }
  .entry ul { padding-left: 16px; margin-top: 6px; list-style: square; }
  .entry li { font-size: 10.5px; line-height: 1.55; color: #33393b; margin-bottom: 4px; }
  .entry li::marker { color: ${accent}; }
  .entry-tags { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px; }
  .entry-tag { font-family: 'JetBrains Mono', monospace; font-size: 9px; font-weight: 500; color: ${accent}; background: rgba(52,133,154,.08); border: 1px solid rgba(52,133,154,.22); padding: 2px 7px; border-radius: 3px; }
  .entry-link { font-family: 'JetBrains Mono', monospace; font-size: 9px; color: #80878a; margin-top: 3px; }
  .skills { display: flex; flex-direction: column; gap: 5px; }
  .skill-row { font-size: 10.5px; color: #33393b; line-height: 1.55; }
  .skill-cat { font-family: 'JetBrains Mono', monospace; font-size: 9.5px; font-weight: 600; color: ${accent}; }`,
});
