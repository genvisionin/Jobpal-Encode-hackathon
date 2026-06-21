import { NextResponse } from "next/server";
import { requireUserId, UnauthorizedError } from "@/lib/auth";
import { createPortalSession } from "@/lib/billing/dodo";
import { getSubscription } from "@/lib/billing/service";

export const runtime = "nodejs";

/**
 * POST /api/billing/portal — open the Dodo customer self-service portal
 * (manage card, view invoices, cancel). Requires a Dodo customer id, which a
 * user only has after a real (non-simulated) checkout.
 */
export async function POST() {
  try {
    const userId = await requireUserId();
    const sub = await getSubscription(userId);

    if (!sub?.dodoCustomerId) {
      return NextResponse.json(
        { error: "No billing account yet. Upgrade to a paid plan first.", code: "NO_CUSTOMER" },
        { status: 409 },
      );
    }

    const url = await createPortalSession(sub.dodoCustomerId);
    if (!url) {
      return NextResponse.json(
        { error: "Billing portal isn't available in this environment.", code: "PORTAL_UNAVAILABLE" },
        { status: 503 },
      );
    }
    return NextResponse.json({ portalUrl: url });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error("[api.billing.portal]", err);
    return NextResponse.json({ error: "Failed to open billing portal." }, { status: 500 });
  }
}
