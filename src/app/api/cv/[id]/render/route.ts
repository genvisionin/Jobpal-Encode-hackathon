import { getTailoredCV } from "@/lib/services/tailor-service";
import { requireUserId, UnauthorizedError } from "@/lib/auth";
import { parsePaper } from "@/lib/api/validation";
import { renderResume } from "@/lib/templates";
import { withEmbedScript } from "@/lib/templates/embed";

export const runtime = "nodejs";

/**
 * GET /api/cv/[id]/render?template=...&paper=letter|a4&thumb=1
 * Returns the fully-populated resume as a standalone HTML document, scoped to
 * the signed-in user. Used for the on-paper preview (iframe) + print/PDF.
 */
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
  const thumb = url.searchParams.get("thumb") === "1";
  const print = url.searchParams.get("print") === "1";
  // `embed=1` + `print=1` → rendered in a hidden in-page iframe; use the print
  // layout but let the parent page drive the dialog (no self-print/close).
  const embedPrint = print && url.searchParams.get("embed") === "1";
  // Paginate into real sheets for the on-screen preview and for print/PDF.
  const paged = !thumb && url.searchParams.get("paged") !== "0";

  // Browsers default the "Save as PDF" filename to the document <title>, so
  // make it "<Name> - <Company>" (e.g. "Avery Chen - Acme"). Falls back to the
  // candidate name, then the company/role.
  const documentTitle = buildResumeTitle(cv.resume.contact.name, cv.company);

  const html = withEmbedScript(renderResume(cv.resume, templateId, { paper, documentTitle }), {
    thumb,
    paged: paged && !embedPrint,
    paper,
    autoPrint: print && !embedPrint,
    embedPrint,
  });
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

/** Build a clean, filename-safe document title from name + company. */
function buildResumeTitle(name: string, company: string): string {
  const clean = (s: string) =>
    (s || "")
      .replace(/[\\/:*?"<>|]/g, " ") // strip filesystem-unsafe chars
      .replace(/\s+/g, " ")
      .trim();
  const n = clean(name);
  const co = clean(company);
  if (n && co) return `${n} - ${co}`;
  return n || co || "Resume";
}
