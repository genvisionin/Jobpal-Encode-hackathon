/**
 * helpers.ts — lenient Zod field helpers for LLM output.
 *
 * Models frequently emit `null` for "empty" string/array fields and numbers
 * as strings, and sometimes omit keys entirely. These helpers coerce all of
 * those into safe defaults so a single stray value never fails the whole
 * parse (which would drop us back to the mock path). Keep schemas strict in
 * shape, lenient in values.
 *
 * Each helper accepts string|number|null|undefined|missing and is `.default`ed
 * so an absent key is also valid.
 */

import { z } from "zod";

/** A string field that tolerates null/undefined/number/missing → "". */
export const llmString = (def = "") =>
  z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((v) => (v == null ? def : String(v)));

/** A string-array field that tolerates null/undefined/single-string/missing → []. */
export const llmStringArray = () =>
  z
    .union([z.array(z.union([z.string(), z.number()])), z.string(), z.null()])
    .optional()
    .transform((v) => {
      if (v == null) return [] as string[];
      if (Array.isArray(v)) return v.map((x) => String(x)).filter((s) => s.trim() !== "");
      return v.trim() ? [v] : [];
    });

/** A number field that tolerates string/null/missing and clamps to [min,max]. */
export const llmNumber = (def = 0, min = -Infinity, max = Infinity) =>
  z
    .union([z.number(), z.string(), z.null()])
    .optional()
    .transform((v) => {
      const n = typeof v === "string" ? Number(v.replace(/[^0-9.-]/g, "")) : v;
      if (n == null || Number.isNaN(n)) return def;
      return Math.min(max, Math.max(min, n as number));
    });

/** A boolean field that tolerates string/null/missing → false. */
export const llmBoolean = (def = false) =>
  z
    .union([z.boolean(), z.string(), z.null()])
    .optional()
    .transform((v) => {
      if (typeof v === "boolean") return v;
      if (typeof v === "string") return /^(true|yes|1)$/i.test(v.trim());
      return def;
    });
