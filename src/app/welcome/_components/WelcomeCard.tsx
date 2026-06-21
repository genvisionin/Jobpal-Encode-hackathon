"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon, Logo } from "@/components/ui";
import { FEATURE_LABELS, type FeatureId, type PlanId } from "@/lib/billing/plans";

/**
 * WelcomeCard — the celebratory upgrade confirmation. Lays out what the new
 * plan unlocks and routes the user straight into the feature that matters
 * most (tailoring). Pure presentation; the plan is resolved server-side.
 */
export function WelcomeCard({
  planName,
  planId,
  quota,
  features,
  firstName,
  isFree,
}: {
  planName: string;
  planId: PlanId;
  quota: number;
  features: FeatureId[];
  firstName: string;
  isFree: boolean;
}) {
  // A small entrance flourish — fade/scale in once mounted.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const unlocked: string[] = [
    `${quota} tailored CVs every month`,
    ...features.map((f) => FEATURE_LABELS[f]),
  ];

  return (
    <div
      className="glass-strong sheen flow-card"
      style={{
        width: 540,
        maxWidth: "100%",
        borderRadius: "var(--r-xl)",
        padding: "44px 44px 36px",
        textAlign: "center",
        opacity: shown ? 1 : 0,
        transform: shown ? "translateY(0) scale(1)" : "translateY(10px) scale(0.98)",
        transition: "opacity .5s ease, transform .5s cubic-bezier(.2,.8,.2,1)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
        <Logo size={22} />
      </div>

      {/* celebratory mark */}
      <div
        style={{
          width: 76,
          height: 76,
          borderRadius: "50%",
          margin: "0 auto 22px",
          background: "var(--accent)",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 12px 36px rgba(94,92,230,.4)",
        }}
      >
        <Icon name={isFree ? "check" : "bolt"} size={36} stroke={2.2} />
      </div>

      <span className="chip chip-accent" style={{ marginBottom: 14 }}>
        <Icon name="sparkle" size={13} /> {planName} plan active
      </span>

      <h1 className="serif flow-title" style={{ fontSize: 38, lineHeight: 1.08 }}>
        {isFree
          ? "You're all set"
          : firstName
            ? `You're on ${planName}, ${firstName}`
            : `Welcome to ${planName}`}
      </h1>
      <p style={{ fontSize: 16, color: "var(--ink-2)", marginTop: 12, lineHeight: 1.5 }}>
        {isFree
          ? "Your plan is active. Here's what you can do right now."
          : "Your upgrade is live. Here's everything that just unlocked."}
      </p>

      {/* unlocked list */}
      <div
        className="glass"
        style={{
          borderRadius: "var(--r-md)",
          padding: "18px 20px",
          margin: "26px 0 28px",
          textAlign: "left",
          display: "flex",
          flexDirection: "column",
          gap: 13,
        }}
      >
        {unlocked.map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: 8,
                background: "var(--accent-soft)",
                color: "var(--accent-ink)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Icon name="check" size={15} stroke={2.4} />
            </div>
            <span style={{ fontSize: 14.5, color: "var(--ink-1)" }}>{item}</span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
        <Link href="/customize" className="btn btn-primary btn-lg">
          <Icon name="sparkle" size={18} /> Start tailoring
        </Link>
        {features.includes("gmail_tracker") && (
          <Link href="/tracker" className="btn btn-glass btn-lg">
            <Icon name="mail" size={17} /> Connect Gmail
          </Link>
        )}
      </div>

      <Link
        href="/settings/billing"
        style={{
          display: "inline-block",
          marginTop: 20,
          fontSize: 13,
          color: "var(--ink-3)",
        }}
      >
        Manage your plan
      </Link>
    </div>
  );
}
