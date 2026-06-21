import { NextResponse } from "next/server";
import { getProfile, saveProfileResume } from "@/lib/services/profile-service";
import { requireUserId, UnauthorizedError } from "@/lib/auth";
import { resumeSchema } from "@/lib/schema";
import { parseJson, RequestValidationError, validationErrorResponse } from "@/lib/api/validation";
import { z } from "zod";

export const runtime = "nodejs";

const saveProfileSchema = z.object({ resume: resumeSchema }).strict();

/** GET /api/profile — the current user's base profile (or null). */
export async function GET() {
  try {
    const userId = await requireUserId();
    const profile = await getProfile(userId);
    return NextResponse.json({ profile });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error("[api.profile.GET]", err);
    return NextResponse.json({ error: "Failed to load profile." }, { status: 500 });
  }
}

/** PUT /api/profile — save an edited base profile resume. */
export async function PUT(req: Request) {
  try {
    const userId = await requireUserId();
    const { resume } = await parseJson(req, saveProfileSchema);
    const profile = await saveProfileResume(resume, userId);
    return NextResponse.json({ profile });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof RequestValidationError) {
      return validationErrorResponse(err);
    }
    console.error("[api.profile.PUT]", err);
    return NextResponse.json({ error: "Invalid resume data." }, { status: 400 });
  }
}
