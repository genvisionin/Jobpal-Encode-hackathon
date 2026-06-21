"use client";

import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { Aurora } from "./Aurora";
import { Portal } from "./Portal";
import type { IconName } from "@/lib/icon-paths";
import {
  motion,
  AnimatePresence,
  EASE,
  EASE_OUT,
  useMotionValue,
  useTransform,
  useMotionValueEvent,
  animate,
} from "./motion";

export interface ProcessingStep {
  icon: IconName;
  label: string;
}

const RING = 38; // ring radius
const CIRC = 2 * Math.PI * RING;
/** Progress never quite reaches 100% on its own — it eases toward this and the
 *  overlay unmounts when the real response lands. */
const CEILING = 0.92;

/**
 * ProcessingOverlay — a full-screen, animated "we're working" experience for
 * long-running model calls (tailoring a CV, building a prep pack).
 *
 * A single `progress` motion value (0 → ~92%) drives everything: it eases
 * forward, decelerating as it approaches the ceiling, and NEVER reverses. The
 * ring around the mark fills from that one value and the step checklist lights
 * up from the same value, so the whole panel reads as one coherent forward
 * motion instead of competing loaders. The mark itself only breathes softly —
 * ambient life, not a second progress signal.
 *
 * It does NOT report real backend progress (the API is a single call), but the
 * pacing is tuned to a typical run so it reads as honest narration.
 */
export function ProcessingOverlay({
  open,
  title,
  subtitle,
  steps,
  /** Average ms the real operation takes — paces the fill + checklist. */
  estimateMs = 22000,
  accentIcon = "sparkle",
}: {
  open: boolean;
  title: string;
  subtitle: string;
  steps: ProcessingStep[];
  estimateMs?: number;
  accentIcon?: IconName;
}) {
  const progress = useMotionValue(0);
  const dashoffset = useTransform(progress, (p) => CIRC * (1 - p));
  const [active, setActive] = useState(0);

  // Drive the single progress value forward over the estimate. Ease-out so it
  // moves confidently off the line and gently decelerates toward the ceiling —
  // reads like real work that slows as it wraps up.
  useEffect(() => {
    if (!open) {
      progress.set(0);
      setActive(0);
      return;
    }
    const controls = animate(progress, CEILING, {
      duration: estimateMs / 1000,
      ease: EASE_OUT,
    });
    return () => controls.stop();
  }, [open, estimateMs, progress]);

  // Light up the checklist from the SAME value, so steps and ring stay in sync.
  useMotionValueEvent(progress, "change", (p) => {
    const n = steps.length;
    const idx = Math.min(n - 1, Math.floor((p / CEILING) * n));
    setActive((prev) => (idx > prev ? idx : prev)); // monotonic — never steps back
  });

  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            style={{ position: "fixed", inset: 0, zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
          >
            <Aurora />
            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ duration: 0.45, ease: EASE }}
              className="glass-strong sheen"
              style={{
                position: "relative",
                zIndex: 1,
                width: 460,
                maxWidth: "100%",
                borderRadius: "var(--r-xl)",
                padding: "40px 38px 34px",
                textAlign: "center",
              }}
            >
              {/* animated mark — the ring is the single progress indicator */}
              <div style={{ position: "relative", width: 88, height: 88, margin: "0 auto 22px" }}>
                <motion.span
                  aria-hidden
                  style={{
                    position: "absolute",
                    inset: -6,
                    borderRadius: "50%",
                    background: "radial-gradient(circle, var(--accent-soft), transparent 70%)",
                  }}
                  animate={{ scale: [1, 1.16, 1], opacity: [0.65, 0.4, 0.65] }}
                  transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
                />
                <svg width={88} height={88} viewBox="0 0 88 88" style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)" }}>
                  <circle cx={44} cy={44} r={RING} fill="none" stroke="var(--accent-soft)" strokeWidth={4} />
                  <motion.circle
                    cx={44}
                    cy={44}
                    r={RING}
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth={4}
                    strokeLinecap="round"
                    strokeDasharray={CIRC}
                    style={{ strokeDashoffset: dashoffset }}
                  />
                </svg>
                <motion.div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--accent-ink)",
                  }}
                  animate={{ scale: [1, 1.08, 1] }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Icon name={accentIcon} size={32} />
                </motion.div>
              </div>

              <h2 style={{ fontSize: 28, lineHeight: 1.1, fontWeight: 700, letterSpacing: "-0.025em" }}>
                {title}
              </h2>
              <p style={{ fontSize: 14.5, color: "var(--ink-2)", marginTop: 8, lineHeight: 1.5 }}>{subtitle}</p>

              {/* step checklist — lit from the same progress value */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 24, textAlign: "left" }}>
                {steps.map((step, i) => {
                  const done = i < active;
                  const current = i === active;
                  return (
                    <motion.div
                      key={step.label}
                      animate={{ opacity: done || current ? 1 : 0.55 }}
                      transition={{ duration: 0.35, ease: EASE }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "9px 12px",
                        borderRadius: "var(--r-sm)",
                        background: current ? "var(--accent-soft)" : "transparent",
                        transition: "background .4s ease",
                      }}
                    >
                      <span
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: "50%",
                          flexShrink: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: done
                            ? "var(--accent)"
                            : current
                              ? "transparent"
                              : "rgba(26,26,42,.06)",
                          border: current ? "2px solid var(--accent)" : "none",
                          color: done ? "#fff" : "var(--accent-ink)",
                          transition: "background .4s ease, border-color .4s ease",
                        }}
                      >
                        {done ? (
                          <motion.span
                            initial={{ scale: 0.4, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ duration: 0.3, ease: EASE_OUT }}
                            style={{ display: "flex" }}
                          >
                            <Icon name="check" size={13} stroke={2.6} />
                          </motion.span>
                        ) : current ? (
                          <motion.span
                            style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)" }}
                            animate={{ scale: [1, 0.55, 1], opacity: [1, 0.45, 1] }}
                            transition={{ duration: 1.3, repeat: Infinity, ease: "easeInOut" }}
                          />
                        ) : (
                          <Icon name={step.icon} size={13} style={{ opacity: 0.5 }} />
                        )}
                      </span>
                      <span
                        style={{
                          fontSize: 13.5,
                          fontWeight: current ? 600 : 500,
                          color: done ? "var(--ink-3)" : current ? "var(--ink)" : "var(--ink-4)",
                          transition: "color .4s ease",
                        }}
                      >
                        {step.label}
                      </span>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Portal>
  );
}
