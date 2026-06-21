import { Suspense } from "react";
import { Aurora } from "@/components/ui";
import { isAuthConfigured } from "@/lib/env";
import { LoginForm } from "./_components/LoginForm";

export const metadata = { title: "Sign in · Jobpal" };
export const dynamic = "force-dynamic";

/** The sign-in / sign-up screen. */
export default function LoginPage() {
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
          overflowY: "auto",
        }}
      >
        {isAuthConfigured ? (
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        ) : (
          <div className="glass-strong sheen flow-card" style={{ width: 460, maxWidth: "100%", borderRadius: "var(--r-xl)", padding: 44, textAlign: "center" }}>
            <h1 className="serif flow-title" style={{ fontSize: 30 }}>Auth not configured</h1>
            <p style={{ fontSize: 15, color: "var(--ink-2)", marginTop: 10 }}>
              Add your Supabase keys to <code>.env.local</code> to enable sign-in. Until then the app
              runs in local dev mode.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
