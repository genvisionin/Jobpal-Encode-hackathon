import { z } from "zod";
import { parseJson, RequestValidationError } from "@/lib/api/validation";
import { QuotaExceededError } from "@/lib/billing/service";
import { ExtensionAuthError, requireExtensionUser } from "@/lib/extension/auth";
import { extensionOptions, jsonWithCors } from "@/lib/extension/cors";
import { ScrapeError } from "@/lib/parsing/scrape-jd";
import { customizeCV, EmptyInputError, NoProfileError } from "@/lib/services/tailor-service";

export const runtime = "nodejs";
export const maxDuration = 120;

const extensionCustomizeSchema = z
  .object({
    jobDescription: z.string().trim().min(300).max(250_000),
    sourceUrl: z.string().url().max(4000).optional(),
    templateId: z.string().trim().max(80).optional(),
    createCoverLetter: z.boolean().optional().default(false),
  })
  .strict();

export function OPTIONS(req: Request) {
  return extensionOptions(req);
}

export async function POST(req: Request) {
  try {
    const { userId } = await requireExtensionUser(req);
    const body = await parseJson(req, extensionCustomizeSchema);
    const result = await customizeCV(
      {
        mode: "text",
        value: body.sourceUrl ? `${body.jobDescription}\n\nOriginal job URL: ${body.sourceUrl}` : body.jobDescription,
        templateId: body.templateId,
        createCoverLetter: body.createCoverLetter,
      },
      userId,
    );

    return jsonWithCors(req, {
      cvId: result.cv.id,
      role: result.cv.role,
      company: result.cv.company,
      createdAt: result.cv.createdAt,
      cvDownloadPath: `/api/extension/cv/${result.cv.id}/pdf`,
      coverLetterDownloadPath: result.cv.coverLetter
        ? `/api/extension/cv/${result.cv.id}/cover-letter/pdf`
        : undefined,
    });
  } catch (err) {
    if (err instanceof ExtensionAuthError) {
      return jsonWithCors(req, { error: err.message }, { status: err.status });
    }
    if (err instanceof RequestValidationError) {
      return jsonWithCors(req, { error: err.message }, { status: err.status });
    }
    if (err instanceof EmptyInputError) {
      return jsonWithCors(req, { error: err.message }, { status: 400 });
    }
    if (err instanceof NoProfileError) {
      return jsonWithCors(req, { error: err.message, code: "NO_PROFILE" }, { status: 409 });
    }
    if (err instanceof QuotaExceededError) {
      return jsonWithCors(
        req,
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
      return jsonWithCors(req, { error: err.message }, { status: 422 });
    }
    console.error("[api.extension.customize]", err);
    return jsonWithCors(req, { error: "Failed to generate from the captured job description." }, { status: 500 });
  }
}
