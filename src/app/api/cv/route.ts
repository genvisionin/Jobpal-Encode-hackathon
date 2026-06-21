import { NextResponse } from "next/server";
import { listTailoredCVs } from "@/lib/services/tailor-service";
import { requireUserId, UnauthorizedError } from "@/lib/auth";

export const runtime = "nodejs";

/** GET /api/cv — list all tailored CVs for the signed-in user. */
export async function GET() {
  try {
    const userId = await requireUserId();
    const cvs = await listTailoredCVs(userId);
    return NextResponse.json({ cvs });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error("[api.cv.GET]", err);
    return NextResponse.json({ error: "Failed to load resumes." }, { status: 500 });
  }
}
