"use client";

/**
 * motion.tsx — the shared animation layer for Jobpal.
 *
 * A small, opinionated set of framer-motion wrappers so every screen animates
 * with the same timing curve and feel. Reach for these instead of hand-rolling
 * transitions, the same way we reach for the glass classes for surfaces.
 *
 * All easings come from one place (`EASE`) so motion stays consistent, and
 * everything honors `prefers-reduced-motion` automatically (framer-motion's
 * MotionConfig handles the reduced-motion contract for us).
 */

import {
  motion,
  AnimatePresence,
  MotionConfig,
  useMotionValue,
  useTransform,
  useMotionValueEvent,
  animate,
  type Variants,
  type HTMLMotionProps,
} from "framer-motion";
import type { ReactNode } from "react";

/** The house easing — a soft, confident ease-out used everywhere. */
export const EASE = [0.22, 0.61, 0.36, 1] as const;
/** A hard ease-out — fast off the line, decelerating into place. */
export const EASE_OUT = [0.16, 1, 0.3, 1] as const;
export const EASE_SPRING = { type: "spring", stiffness: 420, damping: 34, mass: 0.9 } as const;

export { motion, AnimatePresence, MotionConfig, useMotionValue, useTransform, useMotionValueEvent, animate };
export type { Variants, HTMLMotionProps };

/* ------------------------------------------------------------------ */
/* Entrance primitives                                                 */
/* ------------------------------------------------------------------ */

/**
 * FadeIn — a single element that fades + lifts into place on mount.
 * `delay` lets callers cascade a few of these manually.
 */
export function FadeIn({
  children,
  delay = 0,
  y = 12,
  duration = 0.5,
  className,
  style,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  duration?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <motion.div
      className={className}
      style={style}
      initial={{ opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Stagger — a container whose direct <StaggerItem> children animate in one
 * after another. Use for lists, grids, and stacked cards.
 */
export function Stagger({
  children,
  className,
  style,
  gap = 0.06,
  delay = 0.04,
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /** Seconds between each child. */
  gap?: number;
  /** Initial delay before the first child. */
  delay?: number;
  as?: "div" | "ul" | "section";
}) {
  const variants: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: gap, delayChildren: delay } },
  };
  const MotionTag = motion[as] as typeof motion.div;
  return (
    <MotionTag className={className} style={style} variants={variants} initial="hidden" animate="show">
      {children}
    </MotionTag>
  );
}

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

/** StaggerItem — a child of <Stagger>. */
export function StaggerItem({
  children,
  className,
  style,
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  as?: "div" | "li";
}) {
  const MotionTag = motion[as] as typeof motion.div;
  return (
    <MotionTag className={className} style={style} variants={itemVariants}>
      {children}
    </MotionTag>
  );
}

/**
 * Reveal — fades content in when it scrolls into view. For long pages where a
 * mount-time stagger would fire off-screen.
 */
export function Reveal({
  children,
  className,
  style,
  y = 18,
  once = true,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  y?: number;
  once?: boolean;
}) {
  return (
    <motion.div
      className={className}
      style={style}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, margin: "-60px" }}
      transition={{ duration: 0.55, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Interaction primitives                                              */
/* ------------------------------------------------------------------ */

/**
 * Tap — wraps any element with a subtle press/hover spring. Good for cards and
 * tiles that aren't already using the `.btn` press treatment.
 */
export function Tap({
  children,
  className,
  style,
  lift = true,
  ...rest
}: {
  children: ReactNode;
  lift?: boolean;
} & HTMLMotionProps<"div">) {
  return (
    <motion.div
      className={className}
      style={style}
      whileHover={lift ? { y: -3 } : { scale: 1.01 }}
      whileTap={{ scale: 0.985 }}
      transition={EASE_SPRING}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
