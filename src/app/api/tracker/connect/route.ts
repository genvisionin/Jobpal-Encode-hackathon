import { NextResponse } from "next/server";
import { isGoogleConfigured } from "@/lib/env";
import { buildAuthUrl, buildOAuthState } from "@/lib/tracker/gmail";
import { requireUserId, UnauthorizedError } from "@/lib/auth";
import { assertFeature, FeatureLockedError } from "@/lib/billing/service";
import { lowestPlanWith } from "@/lib/billing/plans";

export const runtime = "nodejs";

/**
 * POST /api/tracker/connect
 * Returns the Google OAuth consent URL, with the user id encoded in `state`
 * so the callback attaches the connection to the right user. When Gmail OAuth
 * isn't configured the tracker is unavailable — we never fabricate data.
 *
 * Gated: automatic Gmail tracking is a paid feature (Pro+). Free users get a
 * 402 with the upgrade target so the UI can prompt them.
 */
export async function POST() {
  try {
    const userId = await requireUserId();

    // Feature gate — Gmail application tracking requires a paid plan.
    await assertFeature(userId, "gmail_tracker");

    if (!isGoogleConfigured) {
      return NextResponse.json(
        {
          error: "Gmail isn't connected for this workspace yet.",
          code: "GMAIL_UNAVAILABLE",
        },
        { status: 503 },
      );
    }

    // Signed state binds the callback to this user without exposing a mutable id.
    const state = buildOAuthState(userId);
    const url = buildAuthUrl(state);
    return NextResponse.json({ mode: "oauth", authUrl: url });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof FeatureLockedError) {
      const plan = lowestPlanWith(err.feature);
      return NextResponse.json(
        {
          error: "Automatic application tracking is a paid feature.",
          code: "FEATURE_LOCKED",
          feature: err.feature,
          requiredPlan: plan.id,
        },
        { status: 402 },
      );
    }
    console.error("[api.tracker.connect]", err);
    return NextResponse.json({ error: "Failed to start connection." }, { status: 500 });
  }
}
