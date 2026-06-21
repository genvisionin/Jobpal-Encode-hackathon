import type { CSSProperties } from "react";
import { ICON_PATHS, type IconName } from "@/lib/icon-paths";

export interface IconProps {
  name: IconName;
  size?: number;
  stroke?: number;
  style?: CSSProperties;
  className?: string;
}

/**
 * Icon — a 24x24 line icon drawn with the current text color.
 * Mirrors the design-system <Icon /> used across every screen.
 */
export function Icon({ name, size = 20, stroke = 2, style, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: ICON_PATHS[name] }}
    />
  );
}
