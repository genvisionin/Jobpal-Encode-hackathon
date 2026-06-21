import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId, UnauthorizedError } from "@/lib/auth";
import {
  editableProfileEnrichmentSchema,
  getProfileEnrichment,
  refreshProfileEnrichment,
  saveEditableProfileEnrichment,
} from "@/lib/extension/profile-enrichment";
import { listFieldMemories } from "@/lib/extension/field-memory";
import { parseJson, RequestValidationError, validationErrorResponse } from "@/lib/api/validation";

export const runtime = "nodejs";

async function memoryCount(userId: string): Promise<number> {
  return listFieldMemories(userId)
    .then((memories) => memories.length)
    .catch(() => 0);
}

export async function GET() {
  try {
    const userId = await requireUserId();
    const [enrichment, capturedCount] = await Promise.all([
      getProfileEnrichment(userId),
      memoryCount(userId),
    ]);
    return NextResponse.json({ enrichment, capturedCount });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error("[api.profile.enrichment.GET]", err);
    return NextResponse.json({ error: "Failed to load application memory." }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const userId = await requireUserId();
    const input = await parseJson(req, editableProfileEnrichmentSchema);
    const enrichment = await saveEditableProfileEnrichment(userId, input);
    const capturedCount = await memoryCount(userId);
    return NextResponse.json({ enrichment, capturedCount });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof RequestValidationError) {
      return validationErrorResponse(err);
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid application memory data." }, { status: 400 });
    }
    console.error("[api.profile.enrichment.PUT]", err);
    return NextResponse.json({ error: "Failed to save application memory." }, { status: 500 });
  }
}

export async function POST() {
  try {
    const userId = await requireUserId();
    const result = await refreshProfileEnrichment(userId);
    const capturedCount = await memoryCount(userId);
    return NextResponse.json({ ...result, capturedCount });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error("[api.profile.enrichment.POST]", err);
    return NextResponse.json({ error: "Failed to rebuild application memory." }, { status: 500 });
  }
}
