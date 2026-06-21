/**
 * GoogleMark — a simplified multi-colour "G" disc used on the
 * "Continue with Google" affordance (not the official brand logo).
 */
export function GoogleMark({ size = 18 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        display: "inline-flex",
        flexShrink: 0,
        background:
          "conic-gradient(#ea4335 0 25%, #fbbc05 0 50%, #34a853 0 75%, #4285f4 0 100%)",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <span
        style={{
          width: size * 0.42,
          height: size * 0.42,
          borderRadius: "50%",
          background: "#fff",
        }}
      />
    </span>
  );
}
