/** Direct PDF downloads for CVs and cover letters. */

/** Build the print render URL for a tailored CV. */
export function cvPrintSrc(cvId: string, templateId?: string): string {
  const tpl = templateId ? `&template=${encodeURIComponent(templateId)}` : "";
  // `embed=1` tells the render route this is an in-page iframe print: it lays
  // out the print styles but does NOT self-fire print or self-close (the parent
  // drives the dialog).
  return `/api/cv/${cvId}/render?print=1&embed=1${tpl}`;
}

export function cvPdfSrc(cvId: string, templateId?: string): string {
  const tpl = templateId ? `?template=${encodeURIComponent(templateId)}` : "";
  return `/api/cv/${cvId}/pdf${tpl}`;
}

export function coverLetterPdfSrc(cvId: string): string {
  return `/api/cv/${cvId}/cover-letter/pdf`;
}

/**
 * Trigger the browser's print/Save-as-PDF dialog for a URL via a hidden iframe
 * on the current page. Resolves once the dialog has been requested.
 */
export function printViaHiddenFrame(src: string): Promise<void> {
  return new Promise((resolve) => {
    // Reuse a single hidden frame so repeated clicks don't stack up.
    const existing = document.getElementById("jobpal-print-frame");
    if (existing) existing.remove();

    const frame = document.createElement("iframe");
    frame.id = "jobpal-print-frame";
    frame.setAttribute("aria-hidden", "true");
    Object.assign(frame.style, {
      position: "fixed",
      right: "0",
      bottom: "0",
      width: "0",
      height: "0",
      border: "0",
      visibility: "hidden",
    });

    let printed = false;
    const fire = () => {
      if (printed) return;
      printed = true;
      const win = frame.contentWindow;
      if (!win) {
        resolve();
        return;
      }
      // Clean up after the dialog closes (afterprint), with a fallback timer.
      const cleanup = () => {
        setTimeout(() => frame.remove(), 500);
        resolve();
      };
      try {
        win.addEventListener("afterprint", cleanup, { once: true });
      } catch {
        // cross-frame listener can throw in rare cases; rely on the timer
      }
      try {
        win.focus();
        win.print();
      } catch {
        cleanup();
        return;
      }
      // Safety net in case afterprint never fires (some browsers).
      setTimeout(cleanup, 60_000);
    };

    // The render's own script may auto-fire print; if it doesn't (embed mode),
    // we fire once the frame and its fonts are ready.
    frame.onload = () => {
      const win = frame.contentWindow;
      const ready = () => setTimeout(fire, 300);
      try {
        const doc = win?.document as Document | undefined;
        if (doc?.fonts) {
          doc.fonts.ready.then(ready);
        } else {
          ready();
        }
      } catch {
        ready();
      }
    };

    frame.src = src;
    document.body.appendChild(frame);
  });
}

function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const encoded = header.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) return decodeURIComponent(encoded.replace(/"/g, ""));
  const quoted = header.match(/filename="([^"]+)"/i)?.[1];
  if (quoted) return quoted;
  const plain = header.match(/filename=([^;]+)/i)?.[1]?.trim();
  return plain || fallback;
}

async function downloadFromUrl(src: string, fallbackFilename: string): Promise<void> {
  const res = await fetch(src, { credentials: "include" });
  if (!res.ok) {
    const message = await res.text().catch(() => "");
    throw new Error(message || `Download failed with status ${res.status}.`);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filenameFromDisposition(res.headers.get("content-disposition"), fallbackFilename);
  link.rel = "noopener";
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }
}

/** Download a tailored CV as a real PDF file without opening the print dialog. */
export function downloadCvPdf(cvId: string, templateId?: string): Promise<void> {
  return downloadFromUrl(cvPdfSrc(cvId, templateId), "resume.pdf");
}

/** Download an already-generated cover letter as a real PDF file. */
export function downloadCoverLetterPdf(cvId: string): Promise<void> {
  return downloadFromUrl(coverLetterPdfSrc(cvId), "cover-letter.pdf");
}
