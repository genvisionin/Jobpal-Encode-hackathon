import { revokeExtensionRequest, ExtensionAuthError } from "@/lib/extension/auth";
import { extensionOptions, jsonWithCors } from "@/lib/extension/cors";

export const runtime = "nodejs";

export function OPTIONS(req: Request) {
  return extensionOptions(req);
}

export async function POST(req: Request) {
  try {
    await revokeExtensionRequest(req);
    return jsonWithCors(req, { ok: true });
  } catch (err) {
    if (err instanceof ExtensionAuthError) {
      return jsonWithCors(req, { error: err.message }, { status: err.status });
    }
    console.error("[api.extension.auth.revoke]", err);
    return jsonWithCors(req, { error: "Failed to revoke extension session." }, { status: 500 });
  }
}
