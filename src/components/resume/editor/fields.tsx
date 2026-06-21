"use client";

import type { CSSProperties, ReactNode } from "react";

/** Labeled — a uppercase field label above its control. */
export function Labeled({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label style={{ display: "block" }}>
      <span className="label" style={{ display: "block", marginBottom: 6 }}>
        {label}
      </span>
      {children}
      {hint && (
        <span style={{ display: "block", fontSize: 12, color: "var(--ink-4)", marginTop: 5 }}>
          {hint}
        </span>
      )}
    </label>
  );
}

/** Field — a controlled single-line text input bound to the .field class. */
export function Field({
  value,
  onChange,
  onEnter,
  placeholder,
  type = "text",
  style,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  onEnter?: () => void;
  placeholder?: string;
  type?: string;
  style?: CSSProperties;
  ariaLabel?: string;
}) {
  return (
    <input
      className="field"
      type={type}
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={
        onEnter
          ? (e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onEnter();
              }
            }
          : undefined
      }
      style={style}
    />
  );
}

/** TextArea — a controlled multi-line input bound to the .field class. */
export function TextArea({
  value,
  onChange,
  placeholder,
  rows = 3,
  style,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  style?: CSSProperties;
  ariaLabel?: string;
}) {
  return (
    <textarea
      className="field"
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      rows={rows}
      onChange={(e) => onChange(e.target.value)}
      style={{ lineHeight: 1.5, ...style }}
    />
  );
}

/** TagEditor — chips with inline add/remove, used for skills & tech tags. */
export function TagEditor({
  tags,
  onChange,
  placeholder = "Type and press Enter",
}: {
  tags: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  return <TagEditorInner tags={tags} onChange={onChange} placeholder={placeholder} />;
}

function TagEditorInner({
  tags,
  onChange,
  placeholder,
}: {
  tags: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  return (
    <div>
      {tags.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          {tags.map((t, i) => (
            <span key={i} className="chip" style={{ fontSize: 13, paddingRight: 6 }}>
              {t}
              <button
                onClick={() => onChange(tags.filter((_, idx) => idx !== i))}
                aria-label={`Remove ${t}`}
                style={{
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  color: "var(--ink-3)",
                  display: "inline-flex",
                  padding: 0,
                  marginLeft: 2,
                }}
              >
                <CloseGlyph />
              </button>
            </span>
          ))}
        </div>
      )}
      <TagInput onAdd={(v) => onChange([...tags, v])} placeholder={placeholder} />
    </div>
  );
}

function TagInput({ onAdd, placeholder }: { onAdd: (v: string) => void; placeholder: string }) {
  return (
    <input
      className="field"
      placeholder={placeholder}
      aria-label="Add a tag"
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === ",") {
          e.preventDefault();
          const v = e.currentTarget.value.trim().replace(/,$/, "");
          if (v) {
            onAdd(v);
            e.currentTarget.value = "";
          }
        }
      }}
    />
  );
}

function CloseGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
