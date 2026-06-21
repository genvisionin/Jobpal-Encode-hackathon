"use client";

import { usePathname } from "next/navigation";
import { motion, EASE } from "@/components/ui";
import type { ReactNode } from "react";

/**
 * PageTransition — a gentle cross-fade on every route change, keyed on the
 * pathname so navigating between tabs replays the entrance.
 *
 * IMPORTANT: this animates OPACITY ONLY — deliberately no transform. A lingering
 * `transform` (which framer-motion keeps after a translate animation) turns this
 * wrapper into the containing block for any `position: fixed` descendant, which
 * breaks full-screen overlays/modals (they'd size to this box instead of the
 * viewport). Opacity has no such side effect, so modals stay anchored to the
 * viewport.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15, ease: EASE }}
      style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}
    >
      {children}
    </motion.div>
  );
}
