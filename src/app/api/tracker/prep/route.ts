import { NextResponse } from "next/server";
import {
  getInterviewPrep,
  getOrCreateInterviewPrep,
  regenerateInterviewPrep,
  NoProfileError,
  ApplicationNotFoundError,
} from "@/lib/services/interview-prep-service";
import { requireUserId, UnauthorizedError } from "@/lib/auth";
import { parseJson, RequestValidationError, validationErrorResponse } from "@/lib/api/validation";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 120;

const prepSchema = z
  .object({
    applicationId: z.string().trim().min(1).max(120),
    regenerate: z.boolean().optional().default(false),
  })
  .strict();

/**
 * GET /api/tracker/prep?applicationId=…
 * Returns the stored prep pack for an application, or `{ prep: null }` if it
 * hasn't been generated yet (the UI shows a "Prepare now" CTA in that case).
 */
export async function GET(req: Request) {
  try {
    const userId = await requireUserId();
    const applicationId = new URL(req.url).searchParams.get("applicationId");
    if (!applicationId) {
      return NextResponse.json({ error: "Missing applicationId." }, { status: 400 });
    }
    const stored = await getInterviewPrep(applicationId, userId);
    return NextResponse.json({ prep: stored ?? null });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error("[api.tracker.prep.GET]", err);
    return NextResponse.json({ error: "Failed to load prep." }, { status: 500 });
  }
}

/**
 * POST /api/tracker/prep  { applicationId, regenerate? }
 * Generates the prep pack (deep-research LLM pass), caching it per application.
 * `regenerate: true` forces a fresh pack.
 */
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await parseJson(req, prepSchema);

    const stored = body.regenerate
      ? await regenerateInterviewPrep(body.applicationId, userId)
      : await getOrCreateInterviewPrep(body.applicationId, userId);

    return NextResponse.json({ prep: stored });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof RequestValidationError) {
      return validationErrorResponse(err);
    }
    if (err instanceof NoProfileError) {
      return NextResponse.json({ error: err.message, code: "NO_PROFILE" }, { status: 400 });
    }
    if (err instanceof ApplicationNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    console.error("[api.tracker.prep.POST]", err);
    const message = err instanceof Error && err.message ? err.message : "Failed to generate prep.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
