import { Icon, GoogleMark } from "@/components/ui";
import { Screen, PageHeader } from "@/components/layout";
import Link from "next/link";

const PROMISES: [Parameters<typeof Icon>[0]["name"], string, string][] = [
  ["shield", "Read-only access", "We can only read email — never send, edit, or delete."],
  ["mail", "Only application emails", "We look for job confirmations and replies, and ignore the rest."],
  ["xcircle", "Disconnect anytime", "Revoke access in one tap from the tracker or your Google account."],
];

/** TrackerConnect — the Gmail authorisation screen with privacy promises. */
export function TrackerConnect({
  onConnect,
  connecting = false,
  gmailConfigured = false,
  error = null,
  locked = false,
  requiredPlanName = "Pro",
}: {
  onConnect: () => void;
  connecting?: boolean;
  gmailConfigured?: boolean;
  error?: string | null;
  locked?: boolean;
  requiredPlanName?: string;
}) {
  return (
    <Screen max={960}>
      <PageHeader
        title="Application tracker"
        subtitle="Connect your inbox and Jobpal keeps every application up to date — automatically."
      />

      <div className="tracker-connect-grid" style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20, alignItems: "start" }}>

        {/* Left column — main action card */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {locked && (
            <div
              className="glass"
              style={{
                borderRadius: "var(--r-lg)",
                padding: "18px 22px",
                display: "flex",
                alignItems: "center",
                gap: 14,
                flexWrap: "wrap",
                border: "1px solid var(--accent-line)",
                background: "var(--accent-soft)",
              }}
            >
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 11,
                  background: "var(--accent)",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Icon name="bolt" size={18} />
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontSize: 14.5, fontWeight: 600 }}>
                  Automatic tracking is a {requiredPlanName} feature
                </div>
                <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 2 }}>
                  Upgrade to link your inbox and let Jobpal keep every application up to date for you.
                </div>
              </div>
              <Link href="/settings/billing" className="btn btn-primary btn-sm">
                <Icon name="arrowUp" size={14} /> Upgrade
              </Link>
            </div>
          )}

          {/* Connect card */}
          <div
            className="glass-strong sheen"
            style={{ borderRadius: "var(--r-lg)", padding: "32px 36px", textAlign: "center" }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                margin: "0 auto 20px",
                color: "#fff",
                background: "linear-gradient(145deg,#7b79f0,var(--accent))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 8px 20px rgba(94,92,230,.36), inset 0 1px 0 rgba(255,255,255,.4)",
              }}
            >
              <Icon name="mail" size={26} />
            </div>

            <h2 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em" }}>
              Connect Gmail to get started
            </h2>
            <p style={{ fontSize: 14, color: "var(--ink-2)", marginTop: 8, maxWidth: 360, marginInline: "auto" }}>
              We scan for application confirmations, interview invites, and decisions — and keep
              your tracker up to date in real time.
            </p>

            {gmailConfigured ? (
              <>
                <button
                  className="btn btn-lg"
                  onClick={onConnect}
                  disabled={connecting || locked}
                  style={{
                    marginTop: 24,
                    background: "#fff",
                    color: "var(--ink)",
                    border: "1px solid var(--hairline)",
                    boxShadow: "var(--shadow-md)",
                    opacity: locked ? 0.5 : 1,
                  }}
                >
                  <GoogleMark size={18} />{connecting ? "Connecting…" : "Continue with Google"}
                </button>
                {error && (
                  <p role="alert" style={{ fontSize: 13, color: "#d6447a", marginTop: 12 }}>
                    {error}
                  </p>
                )}
              </>
            ) : (
              <div
                className="glass"
                style={{
                  borderRadius: "var(--r-md)",
                  padding: "14px 18px",
                  marginTop: 24,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  textAlign: "left",
                }}
              >
                <Icon name="clock" size={18} style={{ color: "var(--accent-ink)", flexShrink: 0 }} />
                <div style={{ fontSize: 13.5, color: "var(--ink-2)" }}>
                  Gmail tracking is coming soon — we&apos;re finishing Google&apos;s security review
                  before turning it on for everyone.
                </div>
              </div>
            )}

            <p style={{ fontSize: 12, color: "var(--ink-4)", marginTop: 16 }}>
              We use Google&apos;s read-only Gmail scope and store only what&apos;s needed to track
              your applications. Disconnect anytime.
            </p>
          </div>
        </div>

        {/* Right column — privacy promises */}
        <div className="glass" style={{ borderRadius: "var(--r-lg)", padding: "8px 20px" }}>
          <div style={{ padding: "14px 0 10px", fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--ink-3)" }}>
            Privacy & security
          </div>
          {PROMISES.map(([icon, title, sub], i) => (
            <div
              key={title}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                padding: "14px 0",
                borderTop: i > 0 ? "1px solid var(--hairline-2)" : "1px solid var(--hairline-2)",
              }}
            >
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
                  marginTop: 1,
                }}
              >
                <Icon name={icon} size={17} />
              </div>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{title}</div>
                <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 2, lineHeight: 1.45 }}>{sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

    </Screen>
  );
}
