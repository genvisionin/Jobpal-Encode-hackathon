import { NextResponse } from "next/server";
import {
  customizeCV,
  EmptyInputError,
  NoProfileError,
} from "@/lib/services/tailor-service";
import { QuotaExceededError } from "@/lib/billing/service";
import { ScrapeError } from "@/lib/parsing/scrape-jd";
import { requireUserId, UnauthorizedError } from "@/lib/auth";
import { parseJson, RequestValidationError, validationErrorResponse } from "@/lib/api/validation";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 120;

const customizeSchema = z
  .object({
    mode: z.enum(["text", "url"]).optional().default("text"),
    value: z.string().max(250_000).optional().default(""),
    templateId: z.string().trim().max(80).optional(),
    createCoverLetter: z.boolean().optional().default(false),
  })
  .strict();

/** POST /api/customize — tailor the base resume to a pasted JD or job link. */
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await parseJson(req, customizeSchema);

    const result = await customizeCV(
      {
        mode: body.mode === "url" ? "url" : "text",
        value: body.value ?? "",
        templateId: body.templateId,
        createCoverLetter: Boolean(body.createCoverLetter),
      },
      userId,
    );

    return NextResponse.json({
      cv: result.cv,
      sources: result.sources,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof RequestValidationError) {
      return validationErrorResponse(err);
    }
    if (err instanceof EmptyInputError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof NoProfileError) {
      return NextResponse.json({ error: err.message, code: "NO_PROFILE" }, { status: 409 });
    }
    if (err instanceof QuotaExceededError) {
      return NextResponse.json(
        {
          error: err.message,
          code: "QUOTA_EXCEEDED",
          quota: err.entitlements.quota,
          used: err.entitlements.used,
          plan: err.entitlements.planId,
        },
        { status: 402 },
      );
    }
    if (err instanceof ScrapeError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    console.error("[api.customize]", err);
    return NextResponse.json({ error: "Failed to tailor the resume." }, { status: 500 });
  }
}
