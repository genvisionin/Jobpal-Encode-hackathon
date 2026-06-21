/**
 * linker.ts — deterministic dedup + status-progression for the tracker.
 *
 * Given a classified email and the user's existing applications, decide
 * whether to CREATE a new application or UPDATE an existing one, then apply a
 * monotonic status progression so a later "rejection" correctly resolves the
 * right application instead of spawning a duplicate.
 *
 * Matching is done in code (not the LLM) for reliability and idempotency:
 *   - normalize the company name to a stable key
 *   - match on companyKey + fuzzy role similarity
 *   - stage only moves FORWARD; outcome (offer/rejected) sets the decision
 */

import { randomUUID } from "crypto";
import type { EmailClassification } from "@/lib/schema/tracker";
import type { TrackedApplication } from "@/lib/db/types";

const COMPANY_SUFFIXES =
  /\b(inc|inc\.|llc|ltd|ltd\.|limited|corp|corp\.|co|co\.|gmbh|plc|technologies|technology|labs|software|the)\b/gi;

/** Normalize a company name to a stable matching key. */
export function companyKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(COMPANY_SUFFIXES, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Token-overlap similarity (0–1) between two role titles. */
export function roleSimilarity(a: string, b: string): number {
  if (!a || !b) return a === b ? 1 : 0.5; // unknown role shouldn't block a company match
  const norm = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 1 && !["the", "of", "and", "ii", "iii", "sr", "jr"].includes(w)),
    );
  const sa = norm(a);
  const sb = norm(b);
  if (sa.size === 0 || sb.size === 0) return 0.5;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  return inter / Math.max(sa.size, sb.size);
}

/**
 * Find the application a classified email belongs to, if any.
 * Same company + (similar role OR the existing role is unknown) wins.
 */
export function findMatch(
  c: EmailClassification,
  existing: TrackedApplication[],
): TrackedApplication | null {
  const key = companyKey(c.company);
  if (!key) return null;

  const candidates = existing.filter((a) => a.companyKey === key);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  // Multiple roles at the same company → pick the best role match.
  let best: TrackedApplication | null = null;
  let bestScore = 0;
  for (const cand of candidates) {
    const score = roleSimilarity(c.role, cand.role);
    if (score > bestScore) {
      bestScore = score;
      best = cand;
    }
  }
  // If the best role match is weak, prefer the most recently updated one.
  if (bestScore < 0.34) {
    return [...candidates].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  }
  return best;
}

export interface LinkResult {
  application: TrackedApplication;
  created: boolean;
}

/**
 * Apply a classified email to the application set: update an existing match,
 * or create a new application. Returns the resulting application.
 */
export function linkEmail(
  userId: string,
  c: EmailClassification,
  existing: TrackedApplication[],
  emailReceivedAt?: string,
  emailMeta?: { id?: string; threadId?: string },
): LinkResult | null {
  // Only application-bearing kinds create/advance rows.
  if (!c.isJobRelated || c.kind === "not_job" || c.kind === "other_job") return null;
  if (!c.company) return null;

  const match = findMatch(c, existing);
  const eventIso = emailReceivedAt || new Date().toISOString();
  const actionDueAt = c.eventDate || undefined;

  if (!match) {
    // Don't create a brand-new row from a terminal-only signal unless it's
    // genuinely the first contact (e.g. a rejection with no prior confirmation
    // still deserves a row so the user sees it).
    const app: TrackedApplication = {
      id: randomUUID(),
      userId,
      company: c.company,
      companyKey: companyKey(c.company),
      role: c.role || "Role",
      stage: c.stage,
      outcome: c.outcome,
      needsAction: c.needsAction,
      actionSummary: c.actionSummary || undefined,
      actionDueAt,
      latestEmailId: emailMeta?.id,
      latestThreadId: emailMeta?.threadId,
      appliedAt: eventIso,
      updatedAt: eventIso,
      source: "gmail",
    };
    return { application: app, created: true };
  }

  // Update the matched application with monotonic progression.
  const next: TrackedApplication = { ...match };

  // Fill in a role if we now know it and didn't before.
  if ((!next.role || next.role === "Role") && c.role) next.role = c.role;

  // Stage only moves forward; a decision (offer/rejection) forces stage 3.
  if (c.outcome) {
    next.stage = 3;
    next.outcome = c.outcome;
    next.needsAction = c.outcome === "offer"; // an offer needs a response
  } else {
    next.stage = Math.max(next.stage, c.stage) as TrackedApplication["stage"];
    // Don't override a resolved decision with an earlier-stage email.
    if (next.outcome === null) next.needsAction = c.needsAction;
  }

  // Keep the freshest action summary for whatever the current state is.
  if (c.actionSummary && next.outcome !== "rejected") next.actionSummary = c.actionSummary;
  if (next.outcome === "rejected") next.needsAction = false;
  if (actionDueAt && next.outcome !== "rejected") next.actionDueAt = actionDueAt;
  if (emailMeta?.id) next.latestEmailId = emailMeta.id;
  if (emailMeta?.threadId) next.latestThreadId = emailMeta.threadId;

  next.updatedAt = eventIso;

  return { application: next, created: false };
}
