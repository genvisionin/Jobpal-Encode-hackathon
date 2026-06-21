import { getProfile } from "@/lib/services/profile-service";
import {
  requireExtensionUser,
  getExtensionUserSummary,
  ExtensionAuthError,
} from "@/lib/extension/auth";
import { extensionOptions, jsonWithCors } from "@/lib/extension/cors";

export const runtime = "nodejs";

export function OPTIONS(req: Request) {
  return extensionOptions(req);
}

export async function GET(req: Request) {
  try {
    const { userId } = await requireExtensionUser(req);
    const [user, profile] = await Promise.all([
      getExtensionUserSummary(userId),
      getProfile(userId).catch(() => null),
    ]);
    return jsonWithCors(req, {
      user,
      profile: profile
        ? {
            updatedAt: profile.updatedAt,
            contact: profile.resume.contact,
            insights: profile.insights
              ? {
                  headline: profile.insights.headline,
                  archetypes: profile.insights.archetypes.map((a) => a.name),
                  keySkills: profile.insights.keySkills.slice(0, 10),
                }
              : null,
          }
        : null,
    });
  } catch (err) {
    if (err instanceof ExtensionAuthError) {
      return jsonWithCors(req, { error: err.message }, { status: err.status });
    }
    console.error("[api.extension.me]", err);
    return jsonWithCors(req, { error: "Failed to load extension profile." }, { status: 500 });
  }
}
