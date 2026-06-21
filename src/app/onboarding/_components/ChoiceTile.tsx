import { Icon } from "@/components/ui";
import type { IconName } from "@/lib/icon-paths";

/** ChoiceTile — one of the two onboarding paths (upload vs. build). */
export function ChoiceTile({
  icon,
  title,
  body,
  accent = false,
}: {
  icon: IconName;
  title: string;
  body: string;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        textAlign: "left",
        border: "1px solid " + (accent ? "var(--accent-line)" : "var(--hairline)"),
        background: accent ? "var(--accent-soft)" : "rgba(255,255,255,.55)",
        borderRadius: "var(--r-lg)",
        padding: "22px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        flex: 1,
        transition: "0.18s",
        boxShadow: "var(--shadow-sm)",
        width: "100%",
        cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div
          style={{
            width: 46,
            height: 46,
            borderRadius: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            background: accent
              ? "linear-gradient(145deg,#7b79f0,var(--accent))"
              : "linear-gradient(145deg,#33333d,#1a1a22)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,.4), 0 6px 16px rgba(40,40,80,.22)",
          }}
        >
          <Icon name={icon} size={22} />
        </div>
      </div>
      <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.02em" }}>{title}</div>
      <div style={{ fontSize: 14, color: "var(--ink-2)", lineHeight: 1.5 }}>{body}</div>
    </div>
  );
}
