import { NextResponse } from "next/server";
import { requireUserId, UnauthorizedError } from "@/lib/auth";
import { getEntitlements } from "@/lib/billing/service";

export const runtime = "nodejs";

/**
 * GET /api/billing — the current user's entitlements: effective plan, monthly
 * quota, how much is used/left, feature access, and billing-account status.
 * Drives the settings UI, sidebar usage meter, and feature gates.
 */
export async function GET() {
  try {
    const userId = await requireUserId();
    const ent = await getEntitlements(userId);
    return NextResponse.json({
      planId: ent.planId,
      status: ent.status,
      quota: ent.quota,
      used: ent.used,
      remaining: ent.remaining,
      canTailor: ent.canTailor,
      features: ent.plan.features,
      currentPeriodEnd: ent.currentPeriodEnd,
      cancelAtPeriodEnd: ent.cancelAtPeriodEnd,
      hasBillingAccount: ent.hasBillingAccount,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error("[api.billing.GET]", err);
    return NextResponse.json({ error: "Failed to load billing." }, { status: 500 });
  }
}
