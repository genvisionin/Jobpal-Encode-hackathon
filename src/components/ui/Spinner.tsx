"use client";

/**
 * Spinner — a small, calm progress indicator drawn in the accent color.
 * Inline-sized; pass `size` to fit it to a button or a hero.
 */
export function Spinner({
  size = 18,
  stroke = 2.4,
  color = "currentColor",
  style,
}: {
  size?: number;
  stroke?: number;
  color?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      role="status"
      aria-label="Loading"
      style={{ display: "inline-flex", width: size, height: size, ...style }}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" style={{ animation: "jobpal-spin .8s linear infinite" }}>
        <circle cx="12" cy="12" r="9" fill="none" stroke={color} strokeOpacity={0.18} strokeWidth={stroke} />
        <path
          d="M21 12a9 9 0 0 0-9-9"
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}
