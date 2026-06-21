import { getProfile } from "@/lib/services/profile-service";
import { requireUserId, UnauthorizedError } from "@/lib/auth";
import { parsePaper } from "@/lib/api/validation";
import { renderResume } from "@/lib/templates";
import { withEmbedScript } from "@/lib/templates/embed";

export const runtime = "nodejs";

/**
 * GET /api/profile/render?template=...&thumb=1
 * Renders the signed-in user's BASE profile in a given template. Used by the
 * template picker so each option previews the real resume content.
 */
export async function GET(req: Request) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch (err) {
    if (err instanceof UnauthorizedError) return new Response("Unauthorized", { status: 401 });
    throw err;
  }

  const profile = await getProfile(userId);
  if (!profile) return new Response("No profile", { status: 404 });

  const url = new URL(req.url);
  const templateId = url.searchParams.get("template") || "modern-serif";
  const paper = parsePaper(url.searchParams.get("paper"), "letter");
  const thumb = url.searchParams.get("thumb") === "1";

  const html = withEmbedScript(renderResume(profile.resume, templateId, { paper }), { thumb });
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
