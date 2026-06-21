import { z } from "zod";
import { refreshExtensionSession, ExtensionAuthError } from "@/lib/extension/auth";
import { extensionOptions, jsonWithCors } from "@/lib/extension/cors";
import { parseJson, RequestValidationError } from "@/lib/api/validation";

export const runtime = "nodejs";

const bodySchema = z.object({ refreshToken: z.string().min(1) });

export function OPTIONS(req: Request) {
  return extensionOptions(req);
}

export async function POST(req: Request) {
  try {
    const body = await parseJson(req, bodySchema);
    return jsonWithCors(req, await refreshExtensionSession(body.refreshToken));
  } catch (err) {
    if (err instanceof ExtensionAuthError) {
      return jsonWithCors(req, { error: err.message }, { status: err.status });
    }
    if (err instanceof RequestValidationError) {
      return jsonWithCors(req, { error: err.message }, { status: err.status });
    }
    console.error("[api.extension.auth.refresh]", err);
    return jsonWithCors(req, { error: "Failed to refresh extension session." }, { status: 500 });
  }
}
