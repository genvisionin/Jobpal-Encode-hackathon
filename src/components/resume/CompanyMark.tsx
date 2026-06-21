/**
 * CompanyMark — a coloured tile standing in for a company logo.
 */
export function CompanyMark({ color, size = 46 }: { color: string; size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 12,
        background: color,
        flexShrink: 0,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,.3), var(--shadow-sm)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: size * 0.39,
          height: size * 0.39,
          borderRadius: 5,
          border: "2.5px solid rgba(255,255,255,.9)",
        }}
      />
    </div>
  );
}
