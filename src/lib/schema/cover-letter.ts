/**
 * cover-letter.ts — structured, job-specific cover letter output.
 *
 * A cover letter belongs to one tailored CV. It is generated from the same
 * source material: the candidate's tailored resume, the parsed JD, the
 * requirement match analysis, and the reusable career-intelligence layer.
 */

import { z } from "zod";
import { llmString, llmStringArray } from "./helpers";

export const coverLetterSchema = z.object({
  company: llmString(),
  role: llmString(),
  salutation: llmString("Dear hiring team,"),
  opening: llmString(),
  highlights: llmStringArray(),
  body: llmString(),
  closing: llmString(),
  signature: llmString(),
  tone: llmString(),
  wordCount: z
    .union([z.number(), z.string(), z.null()])
    .optional()
    .transform((v) => {
      const n = typeof v === "string" ? Number(v.replace(/[^0-9.-]/g, "")) : v;
      return n == null || Number.isNaN(n) ? 0 : Math.max(0, Math.round(n as number));
    }),
  keyEvidence: llmStringArray(),
  generatedAt: llmString(),
});

export type CoverLetter = z.infer<typeof coverLetterSchema>;

export function coverLetterToPlainText(letter: CoverLetter): string {
  const parts = [
    letter.salutation,
    letter.opening,
    letter.highlights.length ? letter.highlights.map((h) => `- ${h}`).join("\n") : "",
    letter.body,
    letter.closing,
    letter.signature,
  ];
  return parts.filter(Boolean).join("\n\n");
}
