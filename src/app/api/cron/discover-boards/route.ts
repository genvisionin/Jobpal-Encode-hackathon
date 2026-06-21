import { NextResponse } from "next/server";
import { authorizeCronRequest } from "@/lib/cron-auth";
import { runDiscoverySweep } from "@/lib/jobs/discover-service";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET /api/cron/discover-boards — background company-board discovery.
 *
 * Reverse-searches each per-company ATS platform (Greenhouse/Lever/Ashby/
 * SmartRecruiters), validates the slugs against each platform's API, and
 * persists the live boards so future searches reach more companies. Throttled
 * and bounded — meant for a daily cron, never the request path.
 *
 * Guarded by CRON_SECRET (sent as a Bearer token), same as the tracker cron.
 */
export async function GET(req: Request) {
  const unauthorized = authorizeCronRequest(req);
  if (unauthorized) return unauthorized;

  try {
    const summary = await runDiscoverySweep();
    return NextResponse.json({ ok: true, ...summary, ranAt: new Date().toISOString() });
  } catch (err) {
    console.error("[cron.discover-boards]", err);
    return NextResponse.json({ error: "Board discovery failed." }, { status: 500 });
  }
}
