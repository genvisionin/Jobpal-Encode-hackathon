"use client";

import { Icon, motion, AnimatePresence, EASE, Portal } from "@/components/ui";
import { ResumeThumbnail } from "@/components/resume";
import { TEMPLATE_REGISTRY } from "@/lib/templates";

/** Persisted across the picker and the Customize console. */
export const TEMPLATE_STORAGE_KEY = "jobpal.templateId";
export const LEGACY_TEMPLATE_STORAGE_KEYS = ["reframe.templateId"] as const;

/**
 * TemplatePickerModal — an in-page, controlled template chooser. It overlays
 * the Customize console WITHOUT navigating, so whatever the user has pasted
 * stays intact. Each tile previews the user's real base profile in that
 * template. Fully responsive: a 3-up grid on desktop, single column on phones.
 */
export function TemplatePickerModal({
  open,
  selected,
  onSelect,
  onClose,
}: {
  open: boolean;
  selected: string;
  /** Commit a choice (caller persists + closes). */
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            style={{ position: "fixed", inset: 0, zIndex: 70 }}
            role="dialog"
            aria-modal="true"
            aria-label="Choose a template"
          >
          <div
            onClick={onClose}
            style={{ position: "absolute", inset: 0, background: "rgba(26,26,42,.28)", backdropFilter: "blur(3px)" }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 20,
              pointerEvents: "none",
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.99 }}
              transition={{ duration: 0.32, ease: EASE }}
              className="glass-strong sheen"
              style={{
                position: "relative",
                pointerEvents: "auto",
                width: 760,
                maxWidth: "100%",
                maxHeight: "90vh",
                overflowY: "auto",
                borderRadius: "var(--r-xl)",
                padding: "24px 26px",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 2 }}>
                <div>
                  <h2 style={{ fontSize: 25, lineHeight: 1.05, fontWeight: 700, letterSpacing: "-0.025em" }}>
                    Choose a template
                  </h2>
                  <p style={{ fontSize: 13.5, color: "var(--ink-2)", marginTop: 4 }}>
                    All single-column & ATS-friendly. Tap one to use it — previews show your real profile.
                  </p>
                </div>
                <button
                  className="btn btn-ghost"
                  style={{ padding: 9, borderRadius: "50%", flexShrink: 0 }}
                  onClick={onClose}
                  aria-label="Close"
                >
                  <Icon name="close" size={20} />
                </button>
              </div>

              <div className="tpl-grid">
                {TEMPLATE_REGISTRY.map((t) => {
                  const sel = t.id === selected;
                  return (
                    <button
                      key={t.id}
                      onClick={() => onSelect(t.id)}
                      className="tpl-tile"
                      style={{
                        border: "2px solid " + (sel ? "var(--accent)" : "transparent"),
                        background: sel ? "var(--accent-soft)" : "rgba(255,255,255,.45)",
                      }}
                      aria-pressed={sel}
                    >
                      {sel && (
                        <div
                          style={{
                            position: "absolute",
                            top: 11,
                            right: 11,
                            zIndex: 2,
                            width: 22,
                            height: 22,
                            borderRadius: "50%",
                            background: "var(--accent)",
                            color: "#fff",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            boxShadow: "var(--shadow-md)",
                          }}
                        >
                          <Icon name="check" size={13} stroke={3} />
                        </div>
                      )}
                      <div style={{ borderRadius: 8, overflow: "hidden", boxShadow: "var(--shadow-sm)" }}>
                        <ResumeThumbnail src={`/api/profile/render?thumb=1&template=${t.id}`} ratio={1.25} rounded={false} />
                      </div>
                      <div style={{ padding: "8px 4px 2px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</span>
                          <span className="chip" style={{ fontSize: 10, padding: "2px 7px", flexShrink: 0 }}>
                            {t.tag}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 18, gap: 12, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
                  <Icon name="check" size={13} style={{ verticalAlign: "-2px" }} /> 6 single-column, ATS-friendly designs
                </span>
                <button className="btn btn-glass btn-sm" onClick={onClose}>
                  Done
                </button>
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
      </AnimatePresence>
    </Portal>
  );
}
