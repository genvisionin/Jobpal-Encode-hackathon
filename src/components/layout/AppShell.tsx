"use client";

import type { ReactNode } from "react";
import { useRef, useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Icon, Logo, Avatar, motion, AnimatePresence } from "@/components/ui";
import { navItems } from "@/data";
import type { SidebarUsage } from "./Sidebar";
import { PageTransition } from "./PageTransition";
import { getBrowserSupabase } from "@/lib/auth/supabase-browser";

export type { SidebarUsage };

const tabLabels: Record<string, string> = {
  customize: "CV",
  alerts: "Alerts",
  tracker: "Tracker",
  resumes: "Resumes",
  profile: "Profile",
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

async function signOut() {
  try {
    await getBrowserSupabase().auth.signOut();
  } catch {
    // ignore
  }
  window.location.assign("/login");
}

function AccountDropdown({
  userName,
  userEmail,
}: {
  userName: string;
  userEmail: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Close on route change
  useEffect(() => { setOpen(false); }, [pathname]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const firstName = userName.split(" ")[0] || "Account";

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* Pill trigger */}
      <button
        className={"app-topbar-account" + (open ? " on" : "")}
        aria-label="Account menu"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
      >
        <Avatar name={initials(userName)} size={30} accent />
        <span className="app-topbar-account-label">{firstName}</span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.18, ease: "easeInOut" }}
          style={{ display: "inline-flex", opacity: 0.5 }}
        >
          <Icon name="chevronD" size={13} />
        </motion.span>
      </button>

      {/* Dropdown panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              right: 0,
              minWidth: 220,
              background: "#ffffff",
              border: "1px solid var(--hairline)",
              borderRadius: "var(--r-lg)",
              boxShadow: "var(--shadow-lg)",
              overflow: "hidden",
              zIndex: 100,
            }}
          >
            {/* Identity header */}
            <div
              style={{
                padding: "14px 16px",
                borderBottom: "1px solid var(--hairline)",
                background: "var(--canvas-bg)",
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", lineHeight: 1.3 }}>
                {userName || "Account"}
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
                {userEmail}
              </div>
            </div>

            {/* Menu items */}
            <div style={{ padding: "6px" }}>
              <Link
                href="/settings"
                onClick={() => setOpen(false)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  borderRadius: "var(--r-sm)",
                  fontSize: 14,
                  fontWeight: 500,
                  color: "var(--ink)",
                  transition: "background 0.12s ease",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--canvas-bg)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <Icon name="gear" size={16} style={{ color: "var(--ink-3)" }} />
                Settings
              </Link>

              <button
                onClick={signOut}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "var(--r-sm)",
                  fontSize: 14,
                  fontWeight: 500,
                  color: "#d6447a",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background 0.12s ease",
                  fontFamily: "var(--sans)",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(214,68,122,0.06)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <Icon name="logout" size={16} />
                Sign out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * AppShell — the frame for every authenticated screen.
 */
export function AppShell({
  children,
  userName,
  userEmail,
  usage,
}: {
  children: ReactNode;
  userName: string;
  userEmail: string;
  usage: SidebarUsage;
}) {
  const pathname = usePathname();

  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", background: "var(--canvas-bg)" }}>
      <main className="app-main">
        {/* Top bar — outside the scroll area so it never moves */}
        <div className="app-topbar">
          <Link href="/customize" aria-label="Jobpal home" style={{ display: "inline-flex" }}>
            <Logo size={19} />
          </Link>

          <AccountDropdown userName={userName} userEmail={userEmail} />
        </div>

        {/* Scroll area below the topbar */}
        <div className="app-scroll">
          <PageTransition>{children}</PageTransition>
        </div>
      </main>

      <FloatingTabBar pathname={pathname} />
    </div>
  );
}

function FloatingTabBar({ pathname }: { pathname: string }) {
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <nav className="floating-tabbar" aria-label="Primary">
      {navItems.map((item) => {
        const on = isActive(item.href);
        return (
          <Link
            key={item.id}
            href={item.href}
            className={"floating-tab" + (on ? " on" : "")}
            aria-label={item.label}
            aria-current={on ? "page" : undefined}
          >
            {on && (
              <motion.div
                className="floating-tab-bg"
                layoutId="tab-indicator"
                transition={{ type: "spring", stiffness: 360, damping: 28, mass: 0.85 }}
              />
            )}
            <motion.span
              className="floating-tab-icon"
              animate={{ scale: on ? 1.1 : 1, y: on ? -1 : 0 }}
              transition={{ type: "spring", stiffness: 420, damping: 30 }}
            >
              <Icon name={item.icon} size={20} stroke={on ? 2.35 : 2} />
            </motion.span>
            <motion.span
              className="floating-tab-label"
              animate={{ opacity: on ? 1 : 0.55 }}
              transition={{ duration: 0.18 }}
            >
              {tabLabels[item.id] ?? item.label}
            </motion.span>
          </Link>
        );
      })}
    </nav>
  );
}
