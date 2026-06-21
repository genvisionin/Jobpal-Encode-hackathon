import { z } from "zod";
import { exchangeExtensionCode, ExtensionAuthError } from "@/lib/extension/auth";
import { extensionOptions, jsonWithCors } from "@/lib/extension/cors";
import { parseJson, RequestValidationError } from "@/lib/api/validation";

export const runtime = "nodejs";

const bodySchema = z.object({
  code: z.string().min(1),
  extensionId: z.string().min(1).optional().default(""),
});

export function OPTIONS(req: Request) {
  return extensionOptions(req);
}

export async function POST(req: Request) {
  try {
    const body = await parseJson(req, bodySchema);
    const session = await exchangeExtensionCode(body.code, body.extensionId);
    return jsonWithCors(req, session);
  } catch (err) {
    if (err instanceof ExtensionAuthError) {
      return jsonWithCors(req, { error: err.message }, { status: err.status });
    }
    if (err instanceof RequestValidationError) {
      return jsonWithCors(req, { error: err.message }, { status: err.status });
    }
    console.error("[api.extension.auth.exchange]", err);
    return jsonWithCors(req, { error: "Failed to exchange extension auth code." }, { status: 500 });
  }
}
