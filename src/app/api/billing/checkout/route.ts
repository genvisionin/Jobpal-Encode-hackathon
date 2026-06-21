import { NextResponse } from "next/server";
import { requireUserId, getCurrentUser, UnauthorizedError } from "@/lib/auth";
import { createCheckoutSession } from "@/lib/billing/dodo";
import { getSubscription } from "@/lib/billing/service";
import { isPaidPlan } from "@/lib/billing/plans";
import { env } from "@/lib/env";
import { parseJson, RequestValidationError, validationErrorResponse } from "@/lib/api/validation";
import { z } from "zod";

export const runtime = "nodejs";

const checkoutSchema = z.object({ plan: z.string() }).strict();

/**
 * POST /api/billing/checkout — start an upgrade. Body: { plan: "pro"|"premium" }.
 * Returns a `{ checkoutUrl }` to redirect to. When Dodo isn't configured the
 * URL points at the local simulate route so the upgrade → welcome flow is
 * testable end-to-end without credentials.
 */
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const user = await getCurrentUser();
    const body = await parseJson(req, checkoutSchema);
    const plan = body.plan;

    if (!plan || !isPaidPlan(plan)) {
      return NextResponse.json({ error: "Choose a paid plan to upgrade." }, { status: 400 });
    }

    // Reuse the Dodo customer across upgrades when we already have one.
    const sub = await getSubscription(userId);

    const returnUrl =
      env.dodo.returnUrl || `${env.app.baseUrl}/welcome?plan=${plan}`;

    const { checkoutUrl, simulated } = await createCheckoutSession({
      plan,
      userId,
      email: user?.email || "you@example.com",
      name: user?.name,
      customerId: sub?.dodoCustomerId,
      returnUrl,
    });

    return NextResponse.json({ checkoutUrl, simulated });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof RequestValidationError) {
      return validationErrorResponse(err);
    }
    console.error("[api.billing.checkout]", err);
    return NextResponse.json({ error: "Failed to start checkout." }, { status: 500 });
  }
}
