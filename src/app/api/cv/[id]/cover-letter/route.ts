import { NextResponse } from "next/server";
import { createCoverLetterForCV, NoProfileError } from "@/lib/services/tailor-service";
import { requireUserId, UnauthorizedError } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 120;

/** POST /api/cv/[id]/cover-letter — generate or regenerate the cover letter for a tailored CV. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const result = await createCoverLetterForCV(id, userId);
    return NextResponse.json({ cv: result.cv, source: result.source });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof NoProfileError) {
      return NextResponse.json({ error: err.message, code: "NO_PROFILE" }, { status: 409 });
    }
    if (err instanceof Error && err.message === "CV not found.") {
      return NextResponse.json({ error: "CV not found." }, { status: 404 });
    }
    console.error("[api.cv.cover-letter]", err);
    return NextResponse.json({ error: "Failed to create the cover letter." }, { status: 500 });
  }
}
