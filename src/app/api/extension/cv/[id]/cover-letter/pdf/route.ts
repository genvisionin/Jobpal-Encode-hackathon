import { ExtensionAuthError, requireExtensionUser } from "@/lib/extension/auth";
import { extensionCorsHeaders, extensionOptions } from "@/lib/extension/cors";
import { coverLetterHtml, coverLetterPdfFilename } from "@/lib/pdf/html";
import { renderHtmlToPdf } from "@/lib/pdf/server";
import { getTailoredCV } from "@/lib/services/tailor-service";

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
    if (!cv.coverLetter) {
      return new Response("Cover letter has not been created yet.", { status: 409, headers: extensionCorsHeaders(req) });
    }

    const html = coverLetterHtml(cv.coverLetter, cv.resume.contact);
    const pdf = await renderHtmlToPdf(html, { format: "Letter" });
    const headers = new Headers(extensionCorsHeaders(req));
    headers.set("Content-Type", "application/pdf");
    headers.set("Content-Disposition", `attachment; filename="${coverLetterPdfFilename(cv.resume.contact, cv.coverLetter)}"`);
    headers.set("Cache-Control", "private, no-store");

    return new Response(new Blob([pdf as BlobPart], { type: "application/pdf" }), { headers });
  } catch (err) {
    if (err instanceof ExtensionAuthError) {
      return new Response(err.message, { status: err.status, headers: extensionCorsHeaders(req) });
    }
    console.error("[api.extension.cv.cover-letter.pdf]", err);
    return new Response("Failed to render the cover letter.", { status: 500, headers: extensionCorsHeaders(req) });
  }
}
