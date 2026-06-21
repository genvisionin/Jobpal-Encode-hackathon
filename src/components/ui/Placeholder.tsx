import type { CSSProperties } from "react";

/**
 * Placeholder — striped slot with a mono caption, for image/logo drops.
 */
export function Placeholder({
  label,
  style,
  round = false,
}: {
  label: string;
  style?: CSSProperties;
  round?: boolean;
}) {
  return (
    <div className="ph" style={{ borderRadius: round ? "50%" : undefined, ...style }}>
      <span>{label}</span>
    </div>
  );
}
