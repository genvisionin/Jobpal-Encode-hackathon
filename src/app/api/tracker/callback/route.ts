import { NextResponse } from "next/server";
import { exchangeCode, verifyOAuthState } from "@/lib/tracker/gmail";
import { connect, sync } from "@/lib/tracker";
import { requireUserId, UnauthorizedError } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * GET /api/tracker/callback — Google OAuth redirect target.
 * Verifies the signed-in user matches the `state`, exchanges the code for
 * tokens, records the connection (day X = now), runs an initial sync, then
 * redirects back to the tracker.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const state = url.searchParams.get("state") ?? "";

  if (error || !code) {
    return NextResponse.redirect(new URL(`/tracker?connect=error`, url.origin));
  }

  try {
    const userId = await requireUserId();
    const verifiedState = verifyOAuthState(state);
    if (!verifiedState || verifiedState.userId !== userId) {
      return NextResponse.redirect(new URL(`/tracker?connect=error`, url.origin));
    }

    const tokens = await exchangeCode(code);
    await connect(
      {
        email: tokens.email,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: tokens.expiresAt,
      },
      userId,
    );
    await sync(userId).catch((e) => console.error("[tracker.callback] initial sync failed:", e));
    return NextResponse.redirect(new URL(`/tracker?connect=success`, url.origin));
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.redirect(new URL(`/login?next=/tracker`, url.origin));
    }
    console.error("[api.tracker.callback]", err);
    return NextResponse.redirect(new URL(`/tracker?connect=error`, url.origin));
  }
}
