"use client";

import { useEffect, useRef, useState } from "react";

/**
 * ResumeFrame — an iframe hosting the paginated resume (real A4 sheets).
 *
 * The rendered document paginates itself into sheets and posts its total
 * stacked height (see lib/templates/embed.ts); we size the iframe to that so
 * the whole document is visible and the surrounding column scrolls naturally.
 * The sheets carry their own white background + shadow on a grey backdrop, so
 * the frame itself is chrome-less — it reads like a PDF viewer.
 */
export function ResumeFrame({
  src,
  /** A4 sheet (794px) + the paginator's 22px side padding ×2. */
  width = 794 + 44,
}: {
  src: string;
  width?: number;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(1123 + 44);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const data = e.data;
      if (data && data.type === "jobpal:resize" && typeof data.height === "number") {
        setHeight(Math.max(400, Math.ceil(data.height) + 2));
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const measure = () => {
      const hostWidth = host.getBoundingClientRect().width;
      const parentWidth = host.parentElement?.getBoundingClientRect().width ?? 0;
      const viewportWidth = typeof window === "undefined" ? 0 : window.innerWidth - 24;
      const available = Math.max(hostWidth, parentWidth, Math.min(width, viewportWidth));
      const next = Math.min(1, available / width);
      setScale(Number.isFinite(next) && next > 0 ? next : 1);
    };

    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }

    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, [width]);

  return (
    <div ref={hostRef} className="resume-frame-host">
      <div
        className="document-frame-viewport"
        style={{ height: Math.max(420, Math.ceil(height * scale)) }}
      >
        <div
          className="document-frame-content"
          style={{
            width,
            height,
            transform: `scale(${scale})`,
          }}
        >
          <iframe
            ref={ref}
            title="Resume preview"
            src={src}
            className="resume-frame"
          />
        </div>
      </div>
    </div>
  );
}
