import { NextResponse } from "next/server";
import { sync, listApplications, computeStats } from "@/lib/tracker";
import { requireUserId, UnauthorizedError } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 120;

/** POST /api/tracker/sync — manual "Sync now": ingest new mail, return fresh data. */
export async function POST() {
  try {
    const userId = await requireUserId();
    const summary = await sync(userId);
    const applications = await listApplications(userId);
    return NextResponse.json({ summary, applications, stats: computeStats(applications) });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error("[api.tracker.sync]", err);
    // Surface the real reason (e.g. Gmail API disabled, token expired) so the
    // UI can tell the user what to do instead of a generic failure.
    const message = err instanceof Error && err.message ? err.message : "Sync failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
