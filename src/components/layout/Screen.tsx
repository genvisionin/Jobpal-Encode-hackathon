import type { CSSProperties, ReactNode } from "react";

/**
 * Screen — the standard padded container every sidebar-framed page
 * routes through, so vertical rhythm and side gutters stay identical
 * across the app. `max` caps and centers the content column on wide
 * displays (defaults to a comfortable reading width).
 */
export function Screen({
  children,
  max = 1080,
  style,
}: {
  children: ReactNode;
  /** Max content width in px, or `false` to fill the region. */
  max?: number | false;
  style?: CSSProperties;
}) {
  return (
    <div className="screen" style={style}>
      <div
        className="screen-inner"
        style={max === false ? undefined : { maxWidth: max }}
      >
        {children}
      </div>
    </div>
  );
}
