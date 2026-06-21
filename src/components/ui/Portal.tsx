"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";

/**
 * Portal — renders children into <body>, escaping any ancestor that has a
 * transform/filter/contain (which would otherwise become the containing block
 * for `position: fixed` and break full-screen overlays). Use for modals,
 * sheets, and processing overlays so they always anchor to the viewport.
 *
 * SSR-safe: renders nothing until mounted on the client.
 */
export function Portal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);
  if (!mounted || typeof document === "undefined") return null;
  return createPortal(children, document.body);
}
