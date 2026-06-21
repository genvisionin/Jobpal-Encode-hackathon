/**
 * Avatar — initials inside a soft gradient ring.
 * `accent` swaps the warm pink ring for the indigo brand ring.
 */
export function Avatar({
  name = "AM",
  size = 38,
  accent = false,
}: {
  name?: string;
  size?: number;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        flexShrink: 0,
        background: accent
          ? "linear-gradient(145deg,#7b79f0,var(--accent))"
          : "linear-gradient(145deg,#f0a8c0,#b07ce0)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontWeight: 700,
        fontSize: size * 0.36,
        letterSpacing: "0.01em",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,.5), 0 2px 8px rgba(40,40,80,.18)",
      }}
    >
      {name}
    </div>
  );
}
