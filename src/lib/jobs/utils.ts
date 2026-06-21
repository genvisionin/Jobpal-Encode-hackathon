/**
 * utils.ts — shared formatting/derivation helpers for job listings.
 */

import type { WorkArrangement } from "./types";

/** Deterministic, pleasant brand color from a company name. */
export function brandColorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 360;
  return `hsl(${hash}, 58%, 52%)`;
}

/** "3h ago" / "2 days ago" from an ISO date. */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
  const months = Math.round(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}

export function isWithin24h(iso: string): boolean {
  const then = new Date(iso).getTime();
  return !Number.isNaN(then) && Date.now() - then <= 24 * 60 * 60 * 1000;
}

const CURRENCY: Record<string, string> = {
  us: "$", gb: "£", in: "₹", au: "A$", ca: "C$", eu: "€",
  de: "€", fr: "€", es: "€", it: "€", nl: "€", at: "€", be: "€",
  ch: "CHF ", br: "R$", mx: "MX$", nz: "NZ$", pl: "zł ", sg: "S$", za: "R",
};

/** Format a salary range like "$120k–150k" (k-abbreviated above 10k). */
export function formatSalary(min?: number, max?: number, country = "us"): string {
  const sym = CURRENCY[country] ?? "$";
  const fmt = (n: number) => (n >= 10000 ? `${Math.round(n / 1000)}k` : `${Math.round(n)}`);
  if (min && max && min !== max) return `${sym}${fmt(min)}–${fmt(max)}`;
  if (min) return `${sym}${fmt(min)}+`;
  if (max) return `up to ${sym}${fmt(max)}`;
  return "";
}

/** Infer work arrangement from free text (title/description/location). */
export function detectArrangement(text: string): WorkArrangement | null {
  const t = text.toLowerCase();
  if (/\bremote\b|work from home|wfh|fully distributed/.test(t)) return "remote";
  if (/\bhybrid\b/.test(t)) return "hybrid";
  if (/\bon-?site\b|in office|in-office/.test(t)) return "onsite";
  return null;
}

/** Title-case a label for tags. */
export function titleCase(s: string): string {
  return s.replace(/(^|\s|-)\w/g, (c) => c.toUpperCase());
}
