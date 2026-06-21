"use client";

/**
 * Toggle — a controlled glass switch. Renders as a read-only display when no
 * onChange is provided.
 */
export function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange?: (next: boolean) => void;
  label?: string;
}) {
  const interactive = typeof onChange === "function";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={interactive ? () => onChange!(!on) : undefined}
      style={{
        width: 46,
        height: 27,
        borderRadius: 99,
        flexShrink: 0,
        position: "relative",
        transition: "0.2s",
        border: "none",
        padding: 0,
        cursor: interactive ? "pointer" : "default",
        background: on ? "var(--accent)" : "rgba(26,26,42,.18)",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: on ? 22 : 3,
          width: 21,
          height: 21,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "var(--shadow-sm)",
          transition: "0.2s",
        }}
      />
    </button>
  );
}
