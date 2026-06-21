"use client";

import { useState } from "react";
import { Icon } from "@/components/ui";
import { downloadCvPdf } from "@/lib/download-pdf";

/**
 * DownloadPdfButton — the single, shared "Download PDF" control.
 *
 * Downloads the tailored CV from the server-side PDF endpoint. Used by the
 * dashboard cards, the resume list, and anywhere a quick download is shown.
 */
export function DownloadPdfButton({
  cvId,
  templateId,
  label,
  className = "btn btn-glass btn-sm",
  style,
}: {
  cvId: string;
  templateId?: string;
  /** Optional text label; icon-only when omitted. */
  label?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [busy, setBusy] = useState(false);

  async function handle() {
    if (busy) return;
    setBusy(true);
    try {
      await downloadCvPdf(cvId, templateId);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handle}
      disabled={busy}
      className={className}
      style={{ padding: label ? undefined : "8px 11px", ...style }}
      aria-label={label ? undefined : "Download PDF"}
      aria-busy={busy}
    >
      <Icon name="download" size={15} />
      {label ? ` ${label}` : ""}
    </button>
  );
}
