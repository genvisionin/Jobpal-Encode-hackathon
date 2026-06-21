"use client";

import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

/**
 * MotionProvider — wraps the app so framer-motion honors the user's
 * `prefers-reduced-motion` setting (transforms/opacity loops are reduced to
 * instant). Pairs with the CSS reduced-motion guard in globals.css.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
