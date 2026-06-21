import Link from "next/link";
import { Aurora, Logo, Icon } from "@/components/ui";

export const metadata = { title: "Not found · Jobpal" };

/** 404 — a calm glass card with a route home. */
export default function NotFound() {
  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <Aurora />
      <div
        className="flow-screen"
        style={{
          position: "relative",
          zIndex: 2,
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 40,
        }}
      >
        <div
          className="glass-strong sheen flow-card"
          style={{ width: 520, maxWidth: "100%", borderRadius: "var(--r-xl)", padding: "48px 52px", textAlign: "center" }}
        >
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
            <Logo size={22} />
          </div>
          <div className="mono" style={{ fontSize: 12, color: "var(--accent-ink)", marginBottom: 12 }}>
            ERROR 404
          </div>
          <h1 className="serif flow-title" style={{ fontSize: 40, lineHeight: 1.05 }}>
            We couldn&apos;t find that page
          </h1>
          <p style={{ fontSize: 16, color: "var(--ink-2)", marginTop: 12 }}>
            The link may be broken, or the page may have moved.
          </p>
          <Link href="/customize" className="btn btn-primary btn-lg" style={{ marginTop: 28 }}>
            <Icon name="arrow" size={17} /> Back to your dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
