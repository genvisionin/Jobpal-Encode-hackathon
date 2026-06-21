import { requireExtensionUser, ExtensionAuthError } from "@/lib/extension/auth";
import { extensionOptions, jsonWithCors } from "@/lib/extension/cors";
import { buildMagicFillPlan } from "@/lib/extension/magic-fill";
import { pageFillRequestSchema } from "@/lib/extension/types";
import { getProfile } from "@/lib/services/profile-service";
import { parseJson, RequestValidationError } from "@/lib/api/validation";

export const runtime = "nodejs";
export const maxDuration = 120;

export function OPTIONS(req: Request) {
  return extensionOptions(req);
}

export async function POST(req: Request) {
  try {
    const { userId } = await requireExtensionUser(req);
    const profile = await getProfile(userId);
    if (!profile) {
      return jsonWithCors(req, { error: "Add your resume profile before using Magic Fill.", code: "NO_PROFILE" }, { status: 409 });
    }
    const body = await parseJson(req, pageFillRequestSchema);
    const plan = await buildMagicFillPlan(body, profile, userId);
    return jsonWithCors(req, plan);
  } catch (err) {
    if (err instanceof ExtensionAuthError) {
      return jsonWithCors(req, { error: err.message }, { status: err.status });
    }
    if (err instanceof RequestValidationError) {
      return jsonWithCors(req, { error: err.message }, { status: err.status });
    }
    console.error("[api.extension.magic-fill]", err);
    return jsonWithCors(req, { error: "Magic Fill failed." }, { status: 500 });
  }
}
