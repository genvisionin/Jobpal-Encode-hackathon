import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId, UnauthorizedError } from "@/lib/auth";
import { updateAccountContact } from "@/lib/services/profile-service";
import { parseJson, RequestValidationError, validationErrorResponse } from "@/lib/api/validation";

export const runtime = "nodejs";

const patchSchema = z.object({
  name: z.string().trim().max(120).optional(),
  title: z.string().trim().max(160).optional(),
  location: z.string().trim().max(160).optional(),
}).strict();

/** PUT /api/account — patch the user's basic account info (name/title/location). */
export async function PUT(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await parseJson(req, patchSchema);
    const profile = await updateAccountContact(body, userId);
    return NextResponse.json({ profile });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof RequestValidationError) {
      return validationErrorResponse(err);
    }
    console.error("[api.account.PUT]", err);
    return NextResponse.json({ error: "Failed to save account." }, { status: 500 });
  }
}
