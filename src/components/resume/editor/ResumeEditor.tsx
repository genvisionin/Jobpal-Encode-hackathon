"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui";
import { saveProfile, ApiError } from "@/lib/api-client";
import type { ResumeData } from "@/lib/schema";
import { useResumeEditor } from "./useResumeEditor";
import { EditorRail } from "./EditorRail";
import { EditorSections } from "./EditorSections";

type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * ResumeEditor — the shared, in-place resume editing surface. A section
 * navigator on the left and the controlled form filling the rest of the
 * width. The form is FULLY DYNAMIC: it renders contact, summary, and whatever
 * sections the resume actually has, with add/remove/reorder for sections,
 * entries, bullets and tags. Used both embedded in the profile screen and on
 * the standalone builder route, so the experience is identical.
 */
export function ResumeEditor({
  initial,
  initialSection,
  onSaved,
  onClose,
  closeLabel = "Done",
}: {
  initial: ResumeData;
  /** Optionally scroll to an anchor on mount (deep-link from the view). */
  initialSection?: string;
  onSaved?: (resume: ResumeData) => void;
  /** Optional close/exit affordance shown in the footer. */
  onClose?: () => void;
  closeLabel?: string;
}) {
  const editor = useResumeEditor(initial);
  const [save, setSave] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<string>("contact");

  // Anchor → DOM node registry (dynamic, since sections can be added/removed).
  const nodes = useRef<Map<string, HTMLDivElement>>(new Map());
  const registerRef = useCallback(
    (anchor: string) => (el: HTMLDivElement | null) => {
      if (el) nodes.current.set(anchor, el);
      else nodes.current.delete(anchor);
    },
    [],
  );
  const scrollHost = useRef<HTMLDivElement>(null);

  const jump = useCallback((anchor: string) => {
    nodes.current.get(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // Scroll-spy: highlight the section nearest the top of the scroll host.
  useEffect(() => {
    const host = scrollHost.current;
    if (!host) return;
    const onScroll = () => {
      const top = host.getBoundingClientRect().top;
      let current = "contact";
      // Iterate in DOM order via the registry insertion isn't guaranteed,
      // so sort by on-screen position.
      const ordered = [...nodes.current.entries()].sort(
        (a, b) => a[1].getBoundingClientRect().top - b[1].getBoundingClientRect().top,
      );
      for (const [anchor, el] of ordered) {
        if (el.getBoundingClientRect().top - top <= 80) current = anchor;
      }
      setActive(current);
    };
    host.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => host.removeEventListener("scroll", onScroll);
  }, [editor.draft.sections.length]);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!editor.dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [editor.dirty]);

  // Deep-link: scroll to a requested anchor once on mount.
  const didJump = useRef(false);
  useEffect(() => {
    if (didJump.current || !initialSection) return;
    didJump.current = true;
    requestAnimationFrame(() => jump(initialSection));
  }, [initialSection, jump]);

  async function handleSave() {
    setSave("saving");
    setError(null);
    try {
      const { profile } = await saveProfile(editor.draft);
      editor.commit(profile.resume);
      onSaved?.(profile.resume);
      setSave("saved");
      setTimeout(() => setSave("idle"), 2200);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save. Try again.");
      setSave("error");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div className="editor-shell" style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
        <EditorRail resume={editor.draft} active={active} onJump={jump} />

        {/* form column — fills the remaining width for large, easy-to-edit cards */}
        <div ref={scrollHost} className="editor-form">
          <EditorSections editor={editor} registerRef={registerRef} />
        </div>
      </div>

      {/* sticky action bar */}
      <div
        className="glass"
        style={{
          position: "sticky",
          bottom: 0,
          marginTop: 18,
          borderRadius: "var(--r-md)",
          padding: "12px 18px",
          display: "flex",
          alignItems: "center",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: 13.5, color: "var(--ink-3)", display: "flex", alignItems: "center", gap: 7 }}>
          {save === "saving" ? (
            <>
              <Icon name="sync" size={14} /> Saving…
            </>
          ) : save === "saved" ? (
            <span style={{ color: "var(--green)", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Icon name="check" size={14} /> Saved
            </span>
          ) : editor.dirty ? (
            <>
              <span className="dot" style={{ background: "var(--amber)" }} /> Unsaved changes
            </>
          ) : (
            <>
              <Icon name="check" size={14} style={{ color: "var(--green)" }} /> All changes saved
            </>
          )}
          {error && <span style={{ color: "#d6447a" }}>· {error}</span>}
        </span>
        <div style={{ flex: 1 }} />
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 12.5,
            color: "var(--ink-3)",
          }}
        >
          <span className="label" style={{ fontSize: 11 }}>
            Strength
          </span>
          <span
            style={{
              width: 90,
              height: 6,
              borderRadius: 99,
              background: "rgba(26,26,42,.1)",
              overflow: "hidden",
            }}
          >
            <span
              style={{
                display: "block",
                width: `${editor.strength}%`,
                height: "100%",
                background: "linear-gradient(90deg,#7b79f0,var(--accent))",
                borderRadius: 99,
              }}
            />
          </span>
          <span style={{ fontWeight: 700, color: "var(--accent-ink)" }}>{editor.strength}%</span>
        </span>
        {onClose && (
          <button className="btn btn-glass" onClick={onClose}>
            {closeLabel}
          </button>
        )}
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={save === "saving" || !editor.dirty}
        >
          <Icon name="check" size={16} /> Save changes
        </button>
      </div>
    </div>
  );
}
