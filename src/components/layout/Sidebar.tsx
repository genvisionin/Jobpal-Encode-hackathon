"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, Logo, Avatar } from "@/components/ui";
import { navItems } from "@/data";
import { PLANS, isPaidPlan, type PlanId } from "@/lib/billing/plans";

export interface SidebarUsage {
  planId: PlanId;
  used: number;
  quota: number;
}

/** Initials from a display name, e.g. "Aanya Mehta" → "AM". */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Sidebar — the glass navigation rail shared across the authenticated app.
 * It's pinned by <AppShell>, so it never scrolls away. Internally it's a
 * three-part column: a fixed logo header, a scrollable nav list (so long
 * menus never overflow the viewport), and a pinned footer with the usage card
 * and account shortcut. On mobile, <AppShell> replaces this with native-style
 * top and bottom navigation.
 */
export function Sidebar({
  userName,
  userEmail,
  usage,
}: {
  userName: string;
  userEmail: string;
  usage: SidebarUsage;
}) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");
  const settingsActive = isActive("/settings");

  const plan = PLANS[usage.planId];
  const paid = isPaidPlan(usage.planId);
  const pct = usage.quota > 0 ? Math.min(100, Math.round((usage.used / usage.quota) * 100)) : 0;
  const atLimit = usage.used >= usage.quota;

  return (
    <aside
      className="glass sheen app-sidebar"
      style={{
        width: 248,
        flexShrink: 0,
        margin: 14,
        marginRight: 0,
        borderRadius: "var(--r-lg)",
        display: "flex",
        flexDirection: "column",
        padding: "22px 16px",
        minHeight: 0,
      }}
    >
      <div style={{ padding: "4px 8px 22px", flexShrink: 0 }}>
        <Link href="/customize" aria-label="Jobpal home">
          <Logo size={21} />
        </Link>
      </div>

      <nav
        aria-label="Primary"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          overflowY: "auto",
          minHeight: 0,
        }}
      >
        {navItems.map((it) => {
          const on = isActive(it.href);
          return (
            <Link
              key={it.id}
              href={it.href}
              aria-current={on ? "page" : undefined}
              className={"nav-item" + (on ? " on" : "")}
            >
              <Icon name={it.icon} size={19} stroke={on ? 2.2 : 2} />
              <span style={{ flex: 1 }}>{it.label}</span>
              {it.badge && <span className="nav-badge">{it.badge}</span>}
            </Link>
          );
        })}
      </nav>

      <div
        style={{
          marginTop: "auto",
          paddingTop: 14,
          display: "flex",
          flexDirection: "column",
          gap: 14,
          flexShrink: 0,
        }}
      >
        {/* usage / upgrade card */}
        <div
          style={{
            padding: 14,
            borderRadius: "var(--r-md)",
            background: "var(--accent-soft)",
            border: "1px solid var(--accent-line)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 9,
            }}
          >
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--accent-ink)" }}>
              {plan.name} plan
            </span>
            <span
              style={{
                fontSize: 11.5,
                color: atLimit ? "var(--amber)" : "var(--accent-ink)",
                opacity: atLimit ? 1 : 0.8,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {usage.used} / {usage.quota} CVs
            </span>
          </div>
          <div
            style={{
              height: 6,
              borderRadius: 99,
              background: "rgba(94,92,230,.18)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${pct}%`,
                height: "100%",
                background: atLimit ? "var(--amber)" : "var(--accent)",
                borderRadius: 99,
                transition: "width .3s",
              }}
            />
          </div>
          {paid ? (
            atLimit ? (
              <Link
                href="/settings/billing"
                className="btn btn-primary btn-sm"
                style={{ width: "100%", justifyContent: "center", marginTop: 11 }}
              >
                <Icon name="bolt" size={14} /> Get more
              </Link>
            ) : (
              <div style={{ fontSize: 11.5, color: "var(--accent-ink)", opacity: 0.8, marginTop: 9 }}>
                Resets at the start of next month
              </div>
            )
          ) : (
            <Link
              href="/settings/billing"
              className="btn btn-primary btn-sm"
              style={{ width: "100%", justifyContent: "center", marginTop: 11 }}
            >
              <Icon name="bolt" size={14} /> Upgrade to Pro
            </Link>
          )}
        </div>

        <div style={{ height: 1, background: "var(--hairline)" }} />
        <Link
          href="/settings"
          aria-current={settingsActive ? "page" : undefined}
          className={"nav-account" + (settingsActive ? " on" : "")}
        >
          <Avatar name={initials(userName)} size={36} accent />
          <div style={{ textAlign: "left", flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>
              {userName}
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--ink-3)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {userEmail}
            </div>
          </div>
          <Icon name="gear" size={17} style={{ color: "var(--ink-3)" }} />
        </Link>
      </div>
    </aside>
  );
}
