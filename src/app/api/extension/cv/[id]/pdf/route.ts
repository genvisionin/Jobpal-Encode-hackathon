import { parsePaper } from "@/lib/api/validation";
import { ExtensionAuthError, requireExtensionUser } from "@/lib/extension/auth";
import { extensionCorsHeaders, extensionOptions } from "@/lib/extension/cors";
import { resumePdfFilename } from "@/lib/pdf/html";
import { renderHtmlToPdf } from "@/lib/pdf/server";
import { getTailoredCV } from "@/lib/services/tailor-service";
import { renderResume } from "@/lib/templates";
import { withEmbedScript } from "@/lib/templates/embed";

export const runtime = "nodejs";
export const maxDuration = 60;

export function OPTIONS(req: Request) {
  return extensionOptions(req);
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await requireExtensionUser(req);
    const { id } = await params;
    const cv = await getTailoredCV(id, userId);
    if (!cv) return new Response("Not found", { status: 404, headers: extensionCorsHeaders(req) });

    const url = new URL(req.url);
    const templateId = url.searchParams.get("template") || cv.templateId;
    const paper = parsePaper(url.searchParams.get("paper"), "a4");
    const documentTitle = resumePdfFilename(cv.resume.contact.name, cv.company).replace(/\.pdf$/i, "");
    const html = withEmbedScript(renderResume(cv.resume, templateId, { paper, documentTitle }), {
      paper,
      embedPrint: true,
    });
    const pdf = await renderHtmlToPdf(html, { format: paper === "letter" ? "Letter" : "A4" });
    const headers = new Headers(extensionCorsHeaders(req));
    headers.set("Content-Type", "application/pdf");
    headers.set("Content-Disposition", `attachment; filename="${resumePdfFilename(cv.resume.contact.name, cv.company)}"`);
    headers.set("Cache-Control", "private, no-store");

    return new Response(new Blob([pdf as BlobPart], { type: "application/pdf" }), { headers });
  } catch (err) {
    if (err instanceof ExtensionAuthError) {
      return new Response(err.message, { status: err.status, headers: extensionCorsHeaders(req) });
    }
    console.error("[api.extension.cv.pdf]", err);
    return new Response("Failed to render the custom CV.", { status: 500, headers: extensionCorsHeaders(req) });
  }
}
