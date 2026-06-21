/**
 * plans.ts — the single source of truth for plans, limits, and features.
 *
 * CLIENT-SAFE: this module has NO server dependencies (no fs, no network, no
 * env beyond build-time constants), so it can be imported by both server
 * services and client components (pricing UI, gates, usage meters). Keep it
 * that way — the actual quota/entitlement *resolution* lives server-side in
 * `service.ts`, but the shape of every plan is described here once.
 *
 * The three tiers (matching product pricing):
 *   • Free      — 5 tailored CVs / month, no automation
 *   • Pro       — $9.99/mo, 30 tailored CVs / month + ranking + Gmail tracker
 *   • Premium   — $19.99/mo, 70 tailored CVs / month + everything in Pro
 */

/** The plans we sell. `free` is the implicit default for every new user. */
export type PlanId = "free" | "pro" | "premium";

/** Feature flags a plan can unlock. Add new gated capabilities here. */
export type FeatureId =
  /** Multi-dimensional fit analysis + match ranking on a tailored CV. */
  | "ranking"
  /** Automatic application tracking by linking a Gmail inbox. */
  | "gmail_tracker"
  /** Priority (24h) job alerts. */
  | "priority_alerts";

export interface PlanLimits {
  /**
   * Tailored CV generations allowed per calendar month.
   * `Infinity` means unmetered (not currently used, but supported).
   */
  tailoredCvsPerMonth: number;
}

export interface Plan {
  id: PlanId;
  name: string;
  /** Monthly price in USD (the headline number). 0 for free. */
  priceMonthly: number;
  /** Short positioning line shown under the name on pricing cards. */
  tagline: string;
  /** Hard limits enforced by the quota system. */
  limits: PlanLimits;
  /** Features this plan unlocks. */
  features: FeatureId[];
  /** Bullet list shown on the pricing card (human copy, ordered). */
  highlights: string[];
}

/**
 * Plan definitions. Order matters — this is the display order on the pricing
 * page (cheapest → most expensive), and `rank` derives from it.
 */
export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    priceMonthly: 0,
    tagline: "Tailor a few resumes a month and see how it feels.",
    limits: { tailoredCvsPerMonth: 5 },
    features: [],
    highlights: [
      "5 tailored CVs per month",
      "All 6 résumé templates",
      "Browse live job alerts",
      "Manual application list",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceMonthly: 9.99,
    tagline: "For an active search — more tailoring, ranked and automated.",
    limits: { tailoredCvsPerMonth: 30 },
    features: ["ranking", "gmail_tracker", "priority_alerts"],
    highlights: [
      "30 tailored CVs per month",
      "Match ranking & fit analysis",
      "Automatic Gmail application tracking",
      "Priority job alerts (24h)",
      "All 6 résumé templates",
    ],
  },
  premium: {
    id: "premium",
    name: "Premium",
    priceMonthly: 19.99,
    tagline: "Maximum throughput for a full-time job hunt.",
    limits: { tailoredCvsPerMonth: 70 },
    features: ["ranking", "gmail_tracker", "priority_alerts"],
    highlights: [
      "70 tailored CVs per month",
      "Everything in Pro",
      "Match ranking & fit analysis",
      "Automatic Gmail application tracking",
      "Priority job alerts (24h)",
    ],
  },
};

/** Plans in display / upgrade order (cheapest → most expensive). */
export const PLAN_ORDER: PlanId[] = ["free", "pro", "premium"];

/** Numeric rank used to compare tiers (free=0, pro=1, premium=2). */
export function planRank(id: PlanId): number {
  return PLAN_ORDER.indexOf(id);
}

/** Safe lookup — falls back to the free plan for unknown ids. */
export function getPlan(id: string | null | undefined): Plan {
  if (id && id in PLANS) return PLANS[id as PlanId];
  return PLANS.free;
}

/** Runtime guard for untrusted plan ids from URLs, JSON bodies, or webhooks. */
export function isPlanId(id: unknown): id is PlanId {
  return typeof id === "string" && id in PLANS;
}

/** Whether a plan unlocks a given feature. */
export function planHasFeature(id: PlanId, feature: FeatureId): boolean {
  return PLANS[id].features.includes(feature);
}

/** The monthly tailored-CV allowance for a plan. */
export function planQuota(id: PlanId): number {
  return PLANS[id].limits.tailoredCvsPerMonth;
}

/** A paid plan is anything above free. */
export function isPaidPlan(id: unknown): id is Exclude<PlanId, "free"> {
  return isPlanId(id) && id !== "free";
}

/** Human label for a feature (used in upgrade prompts). */
export const FEATURE_LABELS: Record<FeatureId, string> = {
  ranking: "Match ranking & fit analysis",
  gmail_tracker: "Automatic Gmail application tracking",
  priority_alerts: "Priority job alerts",
};

/** The lowest plan that unlocks a feature — used to phrase upgrade CTAs. */
export function lowestPlanWith(feature: FeatureId): Plan {
  for (const id of PLAN_ORDER) {
    if (planHasFeature(id, feature)) return PLANS[id];
  }
  return PLANS.premium;
}

/** Format a plan price for display, e.g. "$9.99" or "Free". */
export function formatPrice(plan: Plan): string {
  if (plan.priceMonthly === 0) return "Free";
  // Drop the trailing ".00" but keep cents like ".99".
  const n = plan.priceMonthly;
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}
