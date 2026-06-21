import { requireUserId, UnauthorizedError } from "@/lib/auth";
import { parsePaper } from "@/lib/api/validation";
import { renderHtmlToPdf } from "@/lib/pdf/server";
import { resumePdfFilename } from "@/lib/pdf/html";
import { getTailoredCV } from "@/lib/services/tailor-service";
import { renderResume } from "@/lib/templates";
import { withEmbedScript } from "@/lib/templates/embed";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch (err) {
    if (err instanceof UnauthorizedError) return new Response("Unauthorized", { status: 401 });
    throw err;
  }

  const { id } = await params;
  const cv = await getTailoredCV(id, userId);
  if (!cv) return new Response("Not found", { status: 404 });

  const url = new URL(req.url);
  const templateId = url.searchParams.get("template") || cv.templateId;
  const paper = parsePaper(url.searchParams.get("paper"), "a4");
  const documentTitle = resumePdfFilename(cv.resume.contact.name, cv.company).replace(/\.pdf$/i, "");
  const html = withEmbedScript(renderResume(cv.resume, templateId, { paper, documentTitle }), {
    paper,
    embedPrint: true,
  });
  const pdf = await renderHtmlToPdf(html, { format: paper === "letter" ? "Letter" : "A4" });

  return new Response(new Blob([pdf as BlobPart], { type: "application/pdf" }), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${resumePdfFilename(cv.resume.contact.name, cv.company)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
