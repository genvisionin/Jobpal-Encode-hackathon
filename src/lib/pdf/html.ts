import type { Contact, CoverLetter } from "@/lib/schema";
import { esc } from "@/lib/templates/helpers";

export function safeFilename(value: string, fallback = "document"): string {
  const clean = (value || fallback)
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return clean || fallback;
}

export function resumePdfFilename(name: string, company: string): string {
  const base = [name, company].map((v) => safeFilename(v, "")).filter(Boolean).join(" - ");
  return `${base || "Resume"}.pdf`;
}

export function coverLetterPdfFilename(contact: Contact, letter: CoverLetter): string {
  const name = contact.name || letter.signature || "Cover Letter";
  const company = letter.company || "Company";
  return `${safeFilename(`${name} - ${company} Cover Letter`, "Cover Letter")}.pdf`;
}

function contactLine(contact: Contact): string {
  return [contact.email, contact.phone, contact.location, contact.linkedin, contact.website]
    .filter(Boolean)
    .map(esc)
    .join(" | ");
}

export function coverLetterHtml(letter: CoverLetter, contact: Contact): string {
  const name = contact.name || letter.signature || "Cover Letter";
  const title = safeFilename(`${name} - ${letter.company} Cover Letter`, "Cover Letter");
  const highlights = letter.highlights.length
    ? `<ul>${letter.highlights.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${esc(title)}</title>
<style>
  @page { size: letter; margin: 0.75in; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    background: #fff;
    color: #111;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 11pt;
    line-height: 1.45;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  main { width: 100%; }
  header {
    border-bottom: 1px solid #d8d8d8;
    padding-bottom: 12pt;
    margin-bottom: 24pt;
  }
  h1 {
    margin: 0 0 4pt;
    font-size: 17pt;
    line-height: 1.2;
    font-weight: 700;
  }
  .contact { font-size: 9.5pt; color: #333; }
  .meta {
    margin-bottom: 18pt;
    color: #333;
    font-size: 10pt;
  }
  p { margin: 0 0 12pt; }
  ul { margin: 0 0 13pt 18pt; padding: 0; }
  li { margin: 0 0 6pt; padding-left: 2pt; }
  .signature { margin-top: 18pt; white-space: pre-line; }
</style>
</head>
<body>
<main>
  <header>
    <h1>${esc(name)}</h1>
    <div class="contact">${contactLine(contact)}</div>
  </header>
  <div class="meta">${esc(letter.company)} | ${esc(letter.role)}</div>
  <p>${esc(letter.salutation)}</p>
  <p>${esc(letter.opening)}</p>
  ${highlights}
  <p>${esc(letter.body)}</p>
  <p>${esc(letter.closing)}</p>
  <p class="signature">${esc(letter.signature || name)}</p>
</main>
</body>
</html>`;
}
