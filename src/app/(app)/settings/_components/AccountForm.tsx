"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon, Avatar, Spinner, AnimatePresence, motion } from "@/components/ui";
import { saveAccount, ApiError } from "@/lib/api-client";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { PLANS, type PlanId } from "@/lib/billing/plans";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface AccountInit {
  name: string;
  title: string;
  location: string;
  email: string;
}

interface PlanSummary {
  planId: PlanId;
  used: number;
  quota: number;
}

function Field({
  label,
  value,
  placeholder,
  type = "text",
  readOnly,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  type?: string;
  readOnly?: boolean;
  onChange?: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label
        style={{
          fontSize: "var(--text-sm)",
          fontWeight: 600,
          color: "var(--ink-3)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          fontFamily: "var(--mono)",
        }}
      >
        {label}
      </label>
      <input
        className="field"
        type={type}
        value={value}
        placeholder={placeholder}
        readOnly={readOnly}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        style={{
          fontSize: 15,
          padding: "11px 14px",
          background: readOnly ? "var(--canvas-bg)" : "#fff",
          color: readOnly ? "var(--ink-3)" : "var(--ink)",
          cursor: readOnly ? "default" : "text",
        }}
        aria-label={label}
      />
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: "var(--text-sm)",
        fontWeight: 700,
        color: "var(--ink-4)",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        fontFamily: "var(--mono)",
        marginBottom: 14,
        marginTop: 4,
      }}
    >
      {children}
    </div>
  );
}

export function AccountForm({ init, plan }: { init: AccountInit; plan: PlanSummary }) {
  const [name, setName] = useState(init.name);
  const [title, setTitle] = useState(init.title);
  const [location, setLocation] = useState(init.location);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = name !== init.name || title !== init.title || location !== init.location;
  const planMeta = PLANS[plan.planId];
  const pct = plan.quota > 0 ? Math.min(100, Math.round((plan.used / plan.quota) * 100)) : 0;

  async function save() {
    setError(null);
    setSaving(true);
    setSaved(false);
    try {
      await saveAccount({ name, title, location });
      setSaved(true);
      init.name = name;
      init.title = title;
      init.location = location;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save changes.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Identity card */}
      <div
        className="glass"
        style={{ borderRadius: "var(--r-lg)", padding: "24px 28px", display: "flex", alignItems: "center", gap: 20 }}
      >
        <Avatar name={initials(name || init.email)} size={60} accent />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "var(--text-lg)", fontWeight: 700, letterSpacing: "-0.01em", color: "var(--ink)" }}>
            {name || "Your name"}
          </div>
          <div style={{ fontSize: 13.5, color: "var(--ink-3)", marginTop: 3 }}>
            {init.email}
          </div>
        </div>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 12px",
            borderRadius: "var(--pill)",
            background: "var(--accent-soft)",
            border: "1px solid var(--accent-line)",
            color: "var(--accent-ink)",
            fontSize: "var(--text-sm)",
            fontWeight: 600,
            fontFamily: "var(--mono)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            flexShrink: 0,
          }}
        >
          <Icon name="bolt" size={11} />
          {planMeta.name}
        </span>
      </div>

      {/* Profile fields */}
      <div className="glass" style={{ borderRadius: "var(--r-lg)", padding: "24px 28px" }}>
        <SectionLabel>Profile</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Full name" value={name} placeholder="Your full name" onChange={setName} />
          <Field label="Default job title" value={title} placeholder="e.g. Product Designer" onChange={setTitle} />
          <Field label="Location" value={location} placeholder="City, Country" onChange={setLocation} />
          <Field label="Email" value={init.email} readOnly />
        </div>
      </div>

      {/* Plan summary */}
      <div className="glass" style={{ borderRadius: "var(--r-lg)", padding: "20px 28px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div>
            <SectionLabel>Plan</SectionLabel>
            <div style={{ fontSize: "var(--text-lg)", fontWeight: 700, letterSpacing: "-0.01em", marginTop: -8 }}>
              {planMeta.name}
            </div>
            <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 3 }}>
              {plan.used} of {plan.quota} tailored CVs used this month
            </div>
          </div>
          <Link href="/settings/billing" className="btn btn-glass btn-sm" style={{ flexShrink: 0 }}>
            {plan.planId === "free" ? "Upgrade" : "Manage"} <Icon name="arrow" size={14} />
          </Link>
        </div>

        {/* Usage bar */}
        <div style={{ marginTop: 14 }}>
          <div style={{ height: 6, borderRadius: 99, background: "var(--canvas-bg)", overflow: "hidden" }}>
            <div
              style={{
                width: `${pct}%`,
                height: "100%",
                borderRadius: 99,
                background: pct >= 100 ? "var(--amber)" : "var(--accent)",
                transition: "width 0.3s ease",
              }}
            />
          </div>
        </div>
      </div>

      {/* Footer actions */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingTop: 4,
        }}
      >
        <SignOutButton />

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {error && (
            <span
              role="alert"
              style={{ fontSize: 13, color: "#d6447a", display: "flex", alignItems: "center", gap: 6 }}
            >
              <Icon name="xcircle" size={14} /> {error}
            </span>
          )}
          <AnimatePresence>
            {saved && !dirty && (
              <motion.span
                initial={{ opacity: 0, x: 6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                style={{ fontSize: 13, color: "var(--green)", display: "flex", alignItems: "center", gap: 5 }}
              >
                <Icon name="check" size={14} /> Saved
              </motion.span>
            )}
          </AnimatePresence>
          <button
            className="btn btn-primary"
            onClick={save}
            disabled={!dirty || saving}
          >
            {saving ? <Spinner size={15} color="#fff" /> : <Icon name="check" size={15} />}
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
