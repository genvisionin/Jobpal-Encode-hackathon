/**
 * index.ts — the resume template registry.
 *
 * Six selectable templates, each its own single-column, ATS-safe renderer
 * (built on `ats-base`). They differ by typography, header treatment, density,
 * and heading style — never by introducing columns/tables/graphics, so every
 * option parses cleanly. `renderResume` is the single entry point used by the
 * preview + PDF routes. `accent` here is each template's default; callers may
 * still override it via RenderOptions.
 */

import type { ResumeData } from "@/lib/schema";
import type { TemplateDefinition, RenderOptions } from "./types";
import { modernSerif } from "./modern-serif";
import { classic } from "./classic";
import { minimal } from "./minimal";
import { executive } from "./executive";
import { technical } from "./technical";
import { compact } from "./compact";

interface RegistryEntry {
  id: string;
  name: string;
  tag: string;
  base: TemplateDefinition;
  accent: string;
  /** One-liner shown under the name on the picker tile. */
  blurb: string;
  pro?: boolean;
}

/**
 * All six selectable templates. Every entry is a distinct single-column,
 * ATS-friendly design (no two-column/sidebar layouts — those scramble parse
 * order). `accent` is the design's default tint.
 */
export const TEMPLATE_REGISTRY: RegistryEntry[] = [
  {
    id: "modern-serif",
    name: "Modern Serif",
    tag: "Editorial",
    base: modernSerif,
    accent: "#5E5CE6",
    blurb: "Editorial serif name with a clean grotesk body. A polished default.",
  },
  {
    id: "classic",
    name: "Classic",
    tag: "Timeless",
    base: classic,
    accent: "#1a1a22",
    blurb: "Centered, traditional layout recruiters and parsers know best.",
  },
  {
    id: "minimal",
    name: "Minimal",
    tag: "Clean",
    base: minimal,
    accent: "#1a1a22",
    blurb: "Whitespace-forward and near-monochrome. Maximum legibility.",
  },
  {
    id: "executive",
    name: "Executive",
    tag: "Leadership",
    base: executive,
    accent: "#1f3a5f",
    blurb: "Authoritative type and roomy spacing for senior profiles.",
  },
  {
    id: "technical",
    name: "Technical",
    tag: "Engineering",
    base: technical,
    accent: "#34859a",
    blurb: "Mono-accented headings and skills, tuned for engineering roles.",
  },
  {
    id: "compact",
    name: "Compact",
    tag: "Dense",
    base: compact,
    accent: "#5E5CE6",
    blurb: "Tighter spacing to fit experience-heavy resumes on fewer pages.",
  },
];

export const DEFAULT_TEMPLATE_ID = "modern-serif";

export function getTemplate(id: string): RegistryEntry {
  return TEMPLATE_REGISTRY.find((t) => t.id === id) ?? TEMPLATE_REGISTRY[0];
}

/** Render a resume to a full HTML document for the given template id. */
export function renderResume(
  resume: ResumeData,
  templateId: string,
  options: RenderOptions = {},
): string {
  const entry = getTemplate(templateId);
  return entry.base.render(resume, { accent: entry.accent, ...options });
}

export type { TemplateDefinition, RenderOptions } from "./types";
