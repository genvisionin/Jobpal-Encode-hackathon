import { NextResponse } from "next/server";
import { authorizeCronRequest } from "@/lib/cron-auth";
import { syncAllUsers } from "@/lib/tracker";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET /api/cron/sync-trackers — the daily 6am job (see vercel.json).
 *
 * Guarded by CRON_SECRET (Vercel cron sends it as a Bearer token). Iterates
 * every connected user and ingests their new mail. This is a machine call
 * (no user session), so it uses the store directly.
 */
export async function GET(req: Request) {
  const unauthorized = authorizeCronRequest(req);
  if (unauthorized) return unauthorized;

  try {
    const result = await syncAllUsers();
    return NextResponse.json({ ok: true, ...result, ranAt: new Date().toISOString() });
  } catch (err) {
    console.error("[cron.sync-trackers]", err);
    return NextResponse.json({ error: "Cron sync failed." }, { status: 500 });
  }
}
