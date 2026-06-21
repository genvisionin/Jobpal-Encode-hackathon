import { requireUserId, UnauthorizedError } from "@/lib/auth";
import { coverLetterHtml, coverLetterPdfFilename } from "@/lib/pdf/html";
import { renderHtmlToPdf } from "@/lib/pdf/server";
import { getTailoredCV } from "@/lib/services/tailor-service";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
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
  if (!cv.coverLetter) return new Response("Cover letter has not been created yet.", { status: 409 });

  const html = coverLetterHtml(cv.coverLetter, cv.resume.contact);
  const pdf = await renderHtmlToPdf(html, { format: "Letter" });

  return new Response(new Blob([pdf as BlobPart], { type: "application/pdf" }), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${coverLetterPdfFilename(cv.resume.contact, cv.coverLetter)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
