import { z } from "zod";
import { requireExtensionUser, ExtensionAuthError } from "@/lib/extension/auth";
import { extensionOptions, jsonWithCors } from "@/lib/extension/cors";
import { captureFieldMemories } from "@/lib/extension/field-memory";
import { refreshProfileEnrichment } from "@/lib/extension/profile-enrichment";
import { captureAnswersRequestSchema } from "@/lib/extension/types";

export const runtime = "nodejs";

export function OPTIONS(req: Request) {
  return extensionOptions(req);
}

export async function POST(req: Request) {
  try {
    const { userId } = await requireExtensionUser(req);
    const body = captureAnswersRequestSchema.parse(await req.json());
    const result = await captureFieldMemories(userId, body);
    if (result.captured > 0) {
      try {
        const enrichment = await refreshProfileEnrichment(userId);
        result.warnings.push(...enrichment.warnings);
      } catch (err) {
        console.error("[api.extension.field-memory.enrichment]", err);
        result.warnings.push("Captured answers were saved, but profile enrichment could not be refreshed.");
      }
    }
    return jsonWithCors(req, result);
  } catch (err) {
    if (err instanceof ExtensionAuthError) {
      return jsonWithCors(req, { error: err.message }, { status: err.status });
    }
    if (err instanceof z.ZodError) {
      return jsonWithCors(req, { error: "Invalid field-memory capture request." }, { status: 400 });
    }
    console.error("[api.extension.field-memory.capture]", err);
    return jsonWithCors(req, { error: "Failed to capture field answers." }, { status: 500 });
  }
}
