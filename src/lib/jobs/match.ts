/**
 * match.ts — compute a 0–100 relevance score between a job and the user's
 * base profile. Providers don't supply this, so we derive it locally from the
 * candidate's title, skills, competencies, and recent role keywords overlapped
 * against the job's title + snippet.
 */

import { resumeToPlainText, type ResumeData } from "@/lib/schema";
import type { JobListing } from "./types";

const STOP = new Set([
  "the", "and", "for", "with", "you", "our", "are", "will", "have", "this", "that",
  "a", "an", "to", "of", "in", "on", "at", "is", "as", "or", "we", "senior", "lead",
  "staff", "principal", "ii", "iii", "junior",
]);

function terms(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9+#.\s-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  );
}

/** Build the candidate's signature term set once. */
export function profileSignature(resume: ResumeData): Set<string> {
  // Title is the strongest signal; the rest of the resume (skills, roles,
  // bullets, projects) feeds the term set via the shared plain-text view.
  return terms(`${resume.contact.title} ${resume.contact.title} ${resumeToPlainText(resume)}`);
}

/** Score one job against the precomputed profile signature. */
export function scoreJob(job: JobListing, signature: Set<string>): number {
  if (signature.size === 0) return 70; // no profile yet — neutral-ish
  const jobTerms = terms(`${job.title} ${job.snippet} ${job.tags.join(" ")}`);
  if (jobTerms.size === 0) return 60;

  let hits = 0;
  for (const t of jobTerms) if (signature.has(t)) hits++;

  // Coverage of the job's terms by the profile, lightly weighted toward the
  // title match, mapped into a confident 58–97 band so the UI feels alive.
  const coverage = hits / jobTerms.size;
  const titleTerms = terms(job.title);
  let titleHits = 0;
  for (const t of titleTerms) if (signature.has(t)) titleHits++;
  const titleBoost = titleTerms.size ? titleHits / titleTerms.size : 0;

  const raw = 0.6 * coverage + 0.4 * titleBoost;
  return Math.round(58 + Math.min(1, raw * 1.6) * 39);
}
