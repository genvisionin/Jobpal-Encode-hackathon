import type { ReactNode } from "react";

/**
 * PageHeader — the consistent title block for sidebar-framed screens:
 * an optional eyebrow chip, a title, a one-line subtitle, and a slot
 * for primary/secondary actions on the right.
 */
export function PageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="page-head">
      <div>
        {eyebrow && <div style={{ marginBottom: 10 }}>{eyebrow}</div>}
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="page-head-actions">{actions}</div>}
    </header>
  );
}
