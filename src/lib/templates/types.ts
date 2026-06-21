import type { ResumeData } from "@/lib/schema";

/** A resume template renders structured resume data into a full HTML document. */
export interface TemplateDefinition {
  id: string;
  name: string;
  tag: string;
  /** Renders a complete, self-contained HTML document (inline styles/CSS). */
  render: (resume: ResumeData, options?: RenderOptions) => string;
}

export interface RenderOptions {
  /** Paper size — letter for US/Canada, a4 elsewhere. */
  paper?: "letter" | "a4";
  /** Accent color override (defaults to the template's own). */
  accent?: string;
  /**
   * Document `<title>`. Browsers use this as the default "Save as PDF"
   * filename, so the print route sets it to e.g. "Avery Chen - Acme".
   * Falls back to the candidate's name when omitted.
   */
  documentTitle?: string;
}

export const PAGE_WIDTH = {
  letter: "8.5in",
  a4: "210mm",
} as const;
