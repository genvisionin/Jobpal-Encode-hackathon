/**
 * service.ts — SERVER-ONLY billing + quota orchestration.
 *
 * Resolves a user's *entitlements* (effective plan, feature access, monthly
 * quota and how much of it is left), enforces the tailored-CV quota, and
 * records usage. Every function takes an explicit `userId` (resolved from the
 * auth session by the caller) so users never see each other's billing state.
 *
 * Do NOT import this from client components — it touches the DB store. The
 * plan *shapes* live in `plans.ts` (client-safe); this module is the runtime
 * that hangs entitlements off real subscription + usage rows.
 */

import { getStore } from "@/lib/db/store";
import type { Subscription } from "@/lib/db/types";
import {
  getPlan,
  planQuota,
  planHasFeature,
  type FeatureId,
  type Plan,
  type PlanId,
} from "./plans";

/** Metric key for the metered tailored-CV generations. */
export const METRIC_TAILORED_CV = "tailored_cv";

/** The current billing period key ("YYYY-MM", UTC). Quotas reset monthly. */
export function currentPeriod(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/**
 * The fully resolved view of what a user can do right now. This is the single
 * object the UI and gates consume — it folds the subscription row + usage
 * counter into plain, ready-to-render numbers and booleans.
 */
export interface Entitlements {
  plan: Plan;
  planId: PlanId;
  status: Subscription["status"] | "none";
  /** Monthly tailored-CV allowance for the effective plan. */
  quota: number;
  /** How many tailored CVs have been generated this period. */
  used: number;
  /** quota − used, floored at 0. */
  remaining: number;
  /** True when the user can still generate a tailored CV this period. */
  canTailor: boolean;
  /** End of the paid period (ISO), if on a paid plan. */
  currentPeriodEnd?: string;
  /** True when a paid plan is set to lapse at period end. */
  cancelAtPeriodEnd: boolean;
  /** True when this user has any paid billing history (drives portal access). */
  hasBillingAccount: boolean;
}

/**
 * Resolve the EFFECTIVE plan from a subscription row, honoring the grace
 * period: a cancelled/expired subscription still grants its plan until
 * `currentPeriodEnd` passes, after which the user drops to free.
 */
export function effectivePlanId(sub: Subscription | null, now: Date = new Date()): PlanId {
  if (!sub) return "free";
  if (sub.status === "active" || sub.status === "on_hold") return sub.plan;
  // cancelled / expired / failed — keep access until the paid period ends.
  if (sub.currentPeriodEnd && new Date(sub.currentPeriodEnd) > now) return sub.plan;
  return "free";
}

/** Load (or synthesize) the user's entitlements for the current period. */
export async function getEntitlements(userId: string): Promise<Entitlements> {
  const store = await getStore();
  const [sub, usage] = await Promise.all([
    store.getSubscription(userId),
    store.getUsage(userId, METRIC_TAILORED_CV, currentPeriod()),
  ]);

  const planId = effectivePlanId(sub);
  const plan = getPlan(planId);
  const quota = planQuota(planId);
  const used = usage?.count ?? 0;
  const remaining = Math.max(0, quota - used);

  return {
    plan,
    planId,
    status: sub?.status ?? "none",
    quota,
    used,
    remaining,
    canTailor: remaining > 0,
    currentPeriodEnd: sub?.currentPeriodEnd,
    cancelAtPeriodEnd: Boolean(sub?.cancelAtPeriodEnd),
    hasBillingAccount: Boolean(sub?.dodoCustomerId),
  };
}

/** Does the user's effective plan unlock a feature? */
export async function hasFeature(userId: string, feature: FeatureId): Promise<boolean> {
  const store = await getStore();
  const sub = await store.getSubscription(userId);
  return planHasFeature(effectivePlanId(sub), feature);
}

/** Thrown when a metered action is attempted past the plan's quota. */
export class QuotaExceededError extends Error {
  code = "QUOTA_EXCEEDED" as const;
  constructor(
    readonly entitlements: Entitlements,
    message = "You've used all your tailored CVs for this month.",
  ) {
    super(message);
    this.name = "QuotaExceededError";
  }
}

/** Thrown when a gated feature is used on a plan that doesn't include it. */
export class FeatureLockedError extends Error {
  code = "FEATURE_LOCKED" as const;
  constructor(
    readonly feature: FeatureId,
    message = "Your plan doesn't include this feature.",
  ) {
    super(message);
    this.name = "FeatureLockedError";
  }
}

/**
 * Assert the user has quota for one more tailored CV, throwing
 * `QuotaExceededError` if not. Returns the current entitlements so callers
 * can avoid a second lookup. Does NOT consume quota — call `recordTailoredCV`
 * only after the generation succeeds.
 */
export async function assertCanTailor(userId: string): Promise<Entitlements> {
  const ent = await getEntitlements(userId);
  if (!ent.canTailor) throw new QuotaExceededError(ent);
  return ent;
}

/** Assert the user's plan unlocks a feature, throwing `FeatureLockedError`. */
export async function assertFeature(userId: string, feature: FeatureId): Promise<void> {
  if (!(await hasFeature(userId, feature))) throw new FeatureLockedError(feature);
}

/** Consume one unit of tailored-CV quota for the current period. */
export async function recordTailoredCV(userId: string): Promise<number> {
  const store = await getStore();
  const counter = await store.incrementUsage(userId, METRIC_TAILORED_CV, currentPeriod(), 1);
  return counter.count;
}

/**
 * Apply a plan change resolved from a Dodo webhook / checkout. Upserts the
 * subscription row with the new plan + lifecycle fields. Idempotent.
 */
export async function applySubscriptionChange(input: {
  userId: string;
  plan: PlanId;
  status: Subscription["status"];
  dodoCustomerId?: string;
  dodoSubscriptionId?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
}): Promise<Subscription> {
  const store = await getStore();
  const existing = await store.getSubscription(input.userId);
  const sub: Subscription = {
    userId: input.userId,
    plan: input.plan,
    status: input.status,
    dodoCustomerId: input.dodoCustomerId ?? existing?.dodoCustomerId,
    dodoSubscriptionId: input.dodoSubscriptionId ?? existing?.dodoSubscriptionId,
    currentPeriodEnd: input.currentPeriodEnd ?? existing?.currentPeriodEnd,
    cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
    updatedAt: new Date().toISOString(),
  };
  return store.saveSubscription(sub);
}

/** The user's raw subscription row (or null). */
export async function getSubscription(userId: string): Promise<Subscription | null> {
  const store = await getStore();
  return store.getSubscription(userId);
}

/**
 * Reconcile a Dodo subscription webhook into our store. Resolves the owning
 * user (metadata.userId set at checkout, falling back to the existing row keyed
 * by the Dodo subscription id), maps the product id → plan, and persists the
 * lifecycle state. Idempotent — safe to call for duplicate webhook deliveries.
 *
 * Returns the saved subscription, or null when the event can't be attributed
 * to a user (e.g. metadata missing and no prior row) so the caller can log it.
 */
export async function reconcileSubscriptionEvent(input: {
  metadataUserId?: string;
  dodoSubscriptionId: string;
  dodoCustomerId?: string;
  plan: PlanId | null;
  status: Subscription["status"];
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
}): Promise<Subscription | null> {
  const store = await getStore();

  // Resolve the owning user.
  let userId = input.metadataUserId;
  if (!userId) {
    const existing = await store.getSubscriptionByDodoId(input.dodoSubscriptionId);
    userId = existing?.userId;
  }
  if (!userId) return null;

  // Resolve the plan: prefer the product mapping; otherwise keep the user's
  // current plan (e.g. a status-only event with no product id).
  let plan = input.plan;
  if (!plan) {
    const existing = await store.getSubscription(userId);
    plan = existing?.plan ?? "free";
  }

  return applySubscriptionChange({
    userId,
    plan,
    status: input.status,
    dodoCustomerId: input.dodoCustomerId,
    dodoSubscriptionId: input.dodoSubscriptionId,
    currentPeriodEnd: input.currentPeriodEnd,
    cancelAtPeriodEnd: input.cancelAtPeriodEnd,
  });
}
