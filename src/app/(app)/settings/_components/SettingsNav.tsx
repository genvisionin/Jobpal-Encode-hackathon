"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui";
import type { IconName } from "@/lib/icon-paths";

type Tab = { id: string; icon: IconName; label: string; href: string };

const TABS: Tab[] = [
  { id: "account", icon: "user",  label: "Account",        href: "/settings" },
  { id: "billing", icon: "bolt",  label: "Plan & Billing",  href: "/settings/billing" },
];

/** SettingsNav — page header + horizontal tab bar shared by all settings pages. */
export function SettingsNav() {
  const pathname = usePathname();
  const activeId = pathname.startsWith("/settings/billing") ? "billing" : "account";

  return (
    <div style={{ marginBottom: 32 }}>
      <h1
        style={{
          fontSize: "var(--text-xl)",
          fontWeight: 700,
          letterSpacing: "-0.025em",
          color: "var(--ink)",
        }}
      >
        Settings
      </h1>
      <p style={{ fontSize: "var(--text-base)", color: "var(--ink-3)", marginTop: 4 }}>
        Manage your account and subscription
      </p>

      {/* Tab bar */}
      <div
        style={{
          display: "flex",
          gap: 0,
          borderBottom: "1px solid var(--hairline)",
          marginTop: 22,
        }}
      >
        {TABS.map((t) => {
          const on = t.id === activeId;
          return (
            <Link
              key={t.id}
              href={t.href}
              aria-current={on ? "page" : undefined}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                padding: "9px 18px",
                fontSize: 14,
                fontWeight: on ? 600 : 500,
                color: on ? "var(--accent)" : "var(--ink-3)",
                borderBottom: on ? "2px solid var(--accent)" : "2px solid transparent",
                marginBottom: -1,
                transition: "color 0.15s ease",
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}
            >
              <Icon name={t.icon} size={15} style={{ opacity: on ? 1 : 0.7 }} />
              {t.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
