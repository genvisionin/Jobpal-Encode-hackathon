import { NextResponse } from "next/server";
import { searchJobs } from "@/lib/jobs";
import { requireUserId, UnauthorizedError } from "@/lib/auth";
import { parseJson, RequestValidationError, validationErrorResponse } from "@/lib/api/validation";
import { jobSearchFilterSchema } from "@/lib/jobs/filters";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST /api/jobs — search aggregated jobs for a set of filters. */
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const filters = await parseJson(req, jobSearchFilterSchema);

    const result = await searchJobs(filters, userId);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof RequestValidationError) {
      return validationErrorResponse(err);
    }
    console.error("[api.jobs]", err);
    return NextResponse.json({ error: "Job search failed." }, { status: 500 });
  }
}
