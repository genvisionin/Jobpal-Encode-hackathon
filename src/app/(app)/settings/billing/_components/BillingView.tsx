"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon, Spinner, Stagger, StaggerItem } from "@/components/ui";
import { startCheckout, openBillingPortal, ApiError } from "@/lib/api-client";
import {
  PLAN_ORDER,
  PLANS,
  planRank,
  formatPrice,
  type PlanId,
} from "@/lib/billing/plans";
import type { BillingStatus } from "@/lib/api-client";

/** Plan card states relative to the user's current plan. */
type CardState = "current" | "upgrade" | "downgrade";

function PlanCard({
  planId,
  state,
  busy,
  onChoose,
}: {
  planId: PlanId;
  state: CardState;
  busy: boolean;
  onChoose: (plan: PlanId) => void;
}) {
  const plan = PLANS[planId];
  const featured = planId === "pro";
  const isCurrent = state === "current";

  const cta =
    state === "current"
      ? "Current plan"
      : state === "upgrade"
        ? planId === "free"
          ? "Switch to Free"
          : `Upgrade to ${plan.name}`
        : `Switch to ${plan.name}`;

  return (
    <div
      className={featured ? "glass-strong sheen" : "glass"}
      style={{
        borderRadius: "var(--r-lg)",
        padding: "26px 24px",
        width: "100%",
        position: "relative",
        border: isCurrent
          ? "1.5px solid var(--accent)"
          : featured
            ? "1.5px solid var(--accent-line)"
            : "1px solid var(--hairline)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {featured && !isCurrent && (
        <span
          className="badge"
          style={{
            position: "absolute",
            top: -11,
            left: 24,
            background: "var(--accent)",
            color: "#fff",
          }}
        >
          <Icon name="bolt" size={11} /> MOST POPULAR
        </span>
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 17, fontWeight: 600 }}>{plan.name}</span>
        {isCurrent && (
          <span className="chip chip-accent" style={{ fontSize: 11, padding: "3px 9px" }}>
            <Icon name="check" size={11} /> Current
          </span>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 14 }}>
        <span style={{ fontSize: 46, lineHeight: 1, fontWeight: 800, letterSpacing: "-0.04em" }}>
          {formatPrice(plan)}
        </span>
        {plan.priceMonthly > 0 && (
          <span style={{ fontSize: 14, color: "var(--ink-3)" }}>/ mo</span>
        )}
      </div>
      <p style={{ fontSize: 13.5, color: "var(--ink-2)", marginTop: 8, minHeight: 38, lineHeight: 1.45 }}>
        {plan.tagline}
      </p>

      <div style={{ height: 1, background: "var(--hairline-2)", margin: "4px 0 16px" }} />

      <div style={{ display: "flex", flexDirection: "column", gap: 11, flex: 1 }}>
        {plan.highlights.map((f, i) => (
          <div
            key={i}
            style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13.5, color: "var(--ink-2)" }}
          >
            <Icon
              name="check"
              size={15}
              stroke={2.4}
              style={{ color: featured ? "var(--accent)" : "var(--green)", marginTop: 1, flexShrink: 0 }}
            />
            {f}
          </div>
        ))}
      </div>

      <button
        className={"btn " + (featured && !isCurrent ? "btn-primary" : "btn-glass")}
        style={{ width: "100%", justifyContent: "center", marginTop: 20 }}
        disabled={isCurrent || busy || planId === "free"}
        onClick={() => onChoose(planId)}
      >
        {busy && state !== "current" ? (
          <>
            <Spinner size={15} color={featured ? "#fff" : undefined} /> Starting…
          </>
        ) : (
          cta
        )}
      </button>
    </div>
  );
}

/**
 * BillingView — the live plan comparison + current-plan summary, wired to the
 * real checkout (Dodo) and customer portal. Driven entirely by the shared plan
 * model so prices/limits never drift from enforcement.
 */
export function BillingView({ billing }: { billing: BillingStatus }) {
  const router = useRouter();
  const [busyPlan, setBusyPlan] = useState<PlanId | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentPlan = PLANS[billing.planId];
  const currentRank = planRank(billing.planId);
  const pct = billing.quota > 0 ? Math.min(100, Math.round((billing.used / billing.quota) * 100)) : 0;

  const renewLabel = billing.currentPeriodEnd
    ? new Date(billing.currentPeriodEnd).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  async function choose(plan: PlanId) {
    setError(null);
    setBusyPlan(plan);
    try {
      const { checkoutUrl } = await startCheckout(plan);
      // Both the hosted Dodo URL and the local simulate URL are navigated to.
      window.location.href = checkoutUrl;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't start checkout.");
      setBusyPlan(null);
    }
  }

  async function manage() {
    setError(null);
    setPortalBusy(true);
    try {
      const { portalUrl } = await openBillingPortal();
      window.location.href = portalUrl;
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Billing portal isn't available right now.",
      );
      setPortalBusy(false);
    }
  }

  return (
    <div>
      {/* current plan + usage summary */}
      <div
        className="glass"
        style={{ borderRadius: "var(--r-lg)", padding: "20px 28px", marginBottom: 16 }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div className="label" style={{ marginBottom: 6 }}>
              Current plan
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.025em" }}>
                {currentPlan.name}
              </span>
              {billing.planId !== "free" && (
                <span style={{ fontSize: 14, color: "var(--ink-3)" }}>
                  {formatPrice(currentPlan)} / mo
                </span>
              )}
              {billing.status === "on_hold" && (
                <span className="chip" style={{ color: "var(--amber)", fontSize: 11.5 }}>
                  Payment on hold
                </span>
              )}
              {billing.cancelAtPeriodEnd && (
                <span className="chip" style={{ color: "var(--amber)", fontSize: 11.5 }}>
                  Cancels {renewLabel}
                </span>
              )}
            </div>
            {renewLabel && !billing.cancelAtPeriodEnd && billing.planId !== "free" && (
              <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 4 }}>
                Renews {renewLabel}
              </div>
            )}
          </div>

          {billing.hasBillingAccount && (
            <button className="btn btn-glass btn-sm" onClick={manage} disabled={portalBusy}>
              {portalBusy ? <Spinner size={15} /> : <Icon name="card" size={15} />} {portalBusy ? "Opening…" : "Manage billing"}
            </button>
          )}
        </div>

        {/* usage meter */}
        <div style={{ marginTop: 18 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 13,
              color: "var(--ink-2)",
              marginBottom: 7,
            }}
          >
            <span>Tailored CVs this month</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              {billing.used} / {billing.quota}
            </span>
          </div>
          <div
            style={{
              height: 8,
              borderRadius: 99,
              background: "rgba(26,26,42,.08)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${pct}%`,
                height: "100%",
                borderRadius: 99,
                background: pct >= 100 ? "var(--amber)" : "var(--accent)",
                transition: "width .3s",
              }}
            />
          </div>
          {billing.remaining === 0 ? (
            <div style={{ fontSize: 12.5, color: "var(--amber)", marginTop: 8 }}>
              You&apos;ve used your full allowance. Upgrade for more, or it resets next month.
            </div>
          ) : (
            <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 8 }}>
              {billing.remaining} left this month
            </div>
          )}
        </div>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            marginBottom: 16,
            fontSize: 13.5,
            color: "#d6447a",
            display: "flex",
            alignItems: "center",
            gap: 7,
          }}
        >
          <Icon name="xcircle" size={15} /> {error}
        </div>
      )}

      {/* plan cards */}
      <Stagger style={{ display: "flex", gap: 14, alignItems: "stretch", flexWrap: "wrap" }} gap={0.08}>
        {PLAN_ORDER.map((planId) => {
          const rank = planRank(planId);
          const state: CardState =
            planId === billing.planId ? "current" : rank > currentRank ? "upgrade" : "downgrade";
          return (
            <StaggerItem key={planId} style={{ flex: 1, minWidth: 240, display: "flex" }}>
              <PlanCard
                planId={planId}
                state={state}
                busy={busyPlan === planId}
                onChoose={choose}
              />
            </StaggerItem>
          );
        })}
      </Stagger>

      <p style={{ fontSize: 12, color: "var(--ink-4)", marginTop: 18, lineHeight: 1.5 }}>
        Plans renew monthly and can be cancelled anytime from Manage billing. Your tailoring
        allowance resets at the start of each calendar month. Payments are processed securely by
        Dodo Payments.
      </p>
    </div>
  );
}
