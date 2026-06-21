import { NextResponse } from "next/server";
import { getStatus, listApplications, computeStats, disconnect } from "@/lib/tracker";
import { requireUserId, UnauthorizedError } from "@/lib/auth";

export const runtime = "nodejs";

/** GET /api/tracker — connection status + applications + derived stats. */
export async function GET() {
  try {
    const userId = await requireUserId();
    const [status, applications] = await Promise.all([
      getStatus(userId),
      listApplications(userId),
    ]);
    return NextResponse.json({ status, applications, stats: computeStats(applications) });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error("[api.tracker.GET]", err);
    return NextResponse.json({ error: "Failed to load tracker." }, { status: 500 });
  }
}

/** DELETE /api/tracker — disconnect Gmail and clear tracked data. */
export async function DELETE() {
  try {
    const userId = await requireUserId();
    await disconnect(userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error("[api.tracker.DELETE]", err);
    return NextResponse.json({ error: "Failed to disconnect." }, { status: 500 });
  }
}
