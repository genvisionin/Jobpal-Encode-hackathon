import type { ReactNode } from "react";
import { Icon } from "@/components/ui";
import type { IconName } from "@/lib/icon-paths";

/** ProfileSection — a glass card wrapping one editable profile section. */
export function ProfileSection({
  icon,
  title,
  count,
  onEdit,
  children,
}: {
  icon: IconName;
  title: string;
  count?: string;
  onEdit?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="glass sheen" style={{ borderRadius: "var(--r-lg)", padding: "20px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 14 }}>
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 9,
            background: "var(--accent-soft)",
            color: "var(--accent-ink)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon name={icon} size={18} />
        </div>
        <span style={{ fontSize: 16.5, fontWeight: 600 }}>{title}</span>
        {count && (
          <span className="chip" style={{ fontSize: 11.5, padding: "3px 9px" }}>
            {count}
          </span>
        )}
        {onEdit && (
          <button
            className="btn btn-ghost btn-sm"
            style={{ marginLeft: "auto", color: "var(--accent-ink)" }}
            onClick={onEdit}
          >
            <Icon name="edit" size={14} /> Edit
          </button>
        )}
      </div>
      {children}
    </div>
  );
}
