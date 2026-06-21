/**
 * Logo — the Jobpal wordmark with its frosted indigo glyph.
 * `mono` renders the glyph only (used on dark editorial panels).
 */
export function Logo({ size = 22, mono = false }: { size?: number; mono?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div
        style={{
          width: size + 8,
          height: size + 8,
          borderRadius: 9,
          position: "relative",
          background: "linear-gradient(145deg, #7b79f0, var(--accent))",
          boxShadow:
            "0 4px 12px rgba(94,92,230,.45), inset 0 1px 0 rgba(255,255,255,.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: (size + 8) * 0.42,
            height: (size + 8) * 0.42,
            border: "2.5px solid #fff",
            borderRadius: 3,
            opacity: 0.95,
          }}
        />
      </div>
      {!mono && (
        <span
          style={{
            fontFamily: "var(--sans)",
            fontSize: size,
            fontWeight: 700,
            letterSpacing: "-0.025em",
            color: mono ? "#fff" : "var(--ink)",
            lineHeight: 1,
          }}
        >
          Jobpal
        </span>
      )}
    </div>
  );
}
