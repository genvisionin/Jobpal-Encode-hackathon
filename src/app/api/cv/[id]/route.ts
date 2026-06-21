import { NextResponse } from "next/server";
import { getTailoredCV, setTemplate } from "@/lib/services/tailor-service";
import { requireUserId, UnauthorizedError } from "@/lib/auth";
import { parseJson, RequestValidationError, validationErrorResponse } from "@/lib/api/validation";
import { TEMPLATE_REGISTRY } from "@/lib/templates";
import { z } from "zod";

export const runtime = "nodejs";

const templateIds = new Set(TEMPLATE_REGISTRY.map((t) => t.id));
const patchSchema = z
  .object({
    templateId: z.string().refine((id) => templateIds.has(id), "Unknown template."),
  })
  .strict();

/** GET /api/cv/[id] — a single tailored CV owned by the signed-in user. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const cv = await getTailoredCV(id, userId);
    if (!cv) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json({ cv });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error("[api.cv.id.GET]", err);
    return NextResponse.json({ error: "Failed to load resume." }, { status: 500 });
  }
}

/** PATCH /api/cv/[id] — change the chosen template. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const body = await parseJson(req, patchSchema);
    const cv = await setTemplate(id, body.templateId, userId);
    if (!cv) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json({ cv });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof RequestValidationError) {
      return validationErrorResponse(err);
    }
    console.error("[api.cv.id.PATCH]", err);
    return NextResponse.json({ error: "Failed to update resume." }, { status: 500 });
  }
}
