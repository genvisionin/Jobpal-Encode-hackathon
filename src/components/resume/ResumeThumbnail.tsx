"use client";

import { useEffect, useRef, useState } from "react";

/**
 * ResumeThumbnail — a live, scaled-down preview of the ACTUAL generated
 * resume (not an abstract placeholder). It loads the real template render in
 * `thumb` mode and scales the full-width page down to fit its container,
 * showing the top of the resume the way it will actually print.
 */
const BASE_WIDTH = 816; // letter width @ ~96dpi (8.5in)

export function ResumeThumbnail({
  cvId,
  templateId,
  src: srcOverride,
  ratio = 1.32,
  rounded = true,
}: {
  cvId?: string;
  templateId?: string;
  /** Explicit render URL (overrides cvId). */
  src?: string;
  /** height / width of the card. */
  ratio?: number;
  rounded?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setScale(el.clientWidth / BASE_WIDTH);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const src =
    srcOverride ??
    `/api/cv/${cvId}/render?thumb=1` + (templateId ? `&template=${templateId}` : "");
  // The iframe renders at full page width; the visible card is width*ratio.
  // Height in iframe (pre-scale) space = visibleHeight / scale = BASE_WIDTH * ratio.
  const frameHeight = Math.ceil(BASE_WIDTH * ratio);

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: `1 / ${ratio}`,
        overflow: "hidden",
        background: "#fff",
        borderRadius: rounded ? "var(--r-md)" : 0,
      }}
    >
      {!loaded && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(110deg, #f4f4f8 30%, #fafafe 50%, #f4f4f8 70%)",
            backgroundSize: "200% 100%",
            animation: "jobpal-shimmer 1.3s linear infinite",
          }}
        />
      )}
      <iframe
        title="Resume thumbnail"
        src={src}
        scrolling="no"
        loading="lazy"
        onLoad={() => setLoaded(true)}
        tabIndex={-1}
        aria-hidden="true"
        style={{
          width: BASE_WIDTH,
          height: frameHeight,
          border: "none",
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          pointerEvents: "none",
          opacity: loaded ? 1 : 0,
          transition: "opacity 0.25s ease",
        }}
      />
    </div>
  );
}
