import { ExtensionAuthError, requireExtensionUser } from "@/lib/extension/auth";
import { recommendContacts } from "@/lib/extension/contact-research";
import { extensionOptions, jsonWithCors } from "@/lib/extension/cors";
import { contactRecommendationRequestSchema } from "@/lib/extension/types";
import { parseJson, RequestValidationError } from "@/lib/api/validation";

export const runtime = "nodejs";
export const maxDuration = 60;

export function OPTIONS(req: Request) {
  return extensionOptions(req);
}

export async function POST(req: Request) {
  try {
    await requireExtensionUser(req);
    const body = await parseJson(req, contactRecommendationRequestSchema);
    const result = await recommendContacts(body);
    return jsonWithCors(req, result);
  } catch (err) {
    if (err instanceof ExtensionAuthError) {
      return jsonWithCors(req, { error: err.message }, { status: err.status });
    }
    if (err instanceof RequestValidationError) {
      return jsonWithCors(req, { error: err.message }, { status: err.status });
    }
    console.error("[api.extension.contact-recommendations]", err);
    return jsonWithCors(req, { error: "Failed to find relevant contacts for this role." }, { status: 500 });
  }
}
