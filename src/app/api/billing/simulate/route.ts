import { NextResponse } from "next/server";
import { requireUserId, UnauthorizedError } from "@/lib/auth";
import { isDodoConfigured, env } from "@/lib/env";
import { applySubscriptionChange } from "@/lib/billing/service";
import { isPaidPlan } from "@/lib/billing/plans";

export const runtime = "nodejs";

/**
 * GET /api/billing/simulate?plan=pro — DEV-ONLY completed-checkout stand-in.
 *
 * When Dodo Payments isn't configured, the checkout route hands back a link
 * here instead of a hosted checkout. This grants the chosen plan immediately
 * (one billing month) and redirects to the welcome screen — mirroring what a
 * real webhook would do — so the whole upgrade UX is testable locally. It is
 * a hard no-op once Dodo is configured, so it can never be used to bypass
 * payment in production.
 */
export async function GET(req: Request) {
  try {
    // Refuse to grant plans for free once real payments are wired up.
    if (isDodoConfigured || process.env.NODE_ENV === "production") {
      return NextResponse.redirect(new URL("/settings/billing", env.app.baseUrl));
    }

    const userId = await requireUserId();
    const url = new URL(req.url);
    const plan = url.searchParams.get("plan");

    if (!plan || !isPaidPlan(plan)) {
      return NextResponse.redirect(new URL("/settings/billing", env.app.baseUrl));
    }

    // 30-day period from now, mirroring a monthly subscription.
    const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await applySubscriptionChange({
      userId,
      plan,
      status: "active",
      dodoCustomerId: `sim_cus_${userId}`,
      dodoSubscriptionId: `sim_sub_${userId}_${plan}`,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
    });

    return NextResponse.redirect(new URL(`/welcome?plan=${plan}`, env.app.baseUrl));
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.redirect(new URL("/login", env.app.baseUrl));
    }
    console.error("[api.billing.simulate]", err);
    return NextResponse.redirect(new URL("/settings/billing", env.app.baseUrl));
  }
}
