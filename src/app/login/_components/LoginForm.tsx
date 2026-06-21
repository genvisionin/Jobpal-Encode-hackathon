"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon, Logo, Spinner, FadeIn } from "@/components/ui";
import { getBrowserSupabase } from "@/lib/auth/supabase-browser";

type Mode = "signin" | "signup";

/**
 * LoginForm — email/password sign-in and sign-up against Supabase Auth.
 * On success it routes to `next` (or the dashboard). Sign-up may require
 * email confirmation depending on the project's auth settings.
 */
export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/customize";
  const initialMode: Mode = params.get("mode") === "signup" ? "signup" : "signin";

  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const supabase = getBrowserSupabase();

    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: name },
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
          },
        });
        if (error) throw error;
        // If email confirmation is required, there's no active session yet.
        if (!data.session) {
          setNotice("Check your inbox to confirm your email, then sign in.");
          setMode("signin");
          setBusy(false);
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      // Full navigation so the server picks up the new auth cookies.
      window.location.assign(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <FadeIn
      className="glass-strong sheen flow-card"
      style={{ width: 440, maxWidth: "100%", borderRadius: "var(--r-xl)", padding: "44px 44px" }}
    >
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
        <Logo size={24} />
      </div>

      <h1 className="serif flow-title" style={{ fontSize: 34, lineHeight: 1.05, textAlign: "center" }}>
        {mode === "signin" ? "Welcome back" : "Create your account"}
      </h1>
      <p style={{ fontSize: 15, color: "var(--ink-2)", marginTop: 8, textAlign: "center" }}>
        {mode === "signin"
          ? "Sign in to tailor resumes, find jobs, and track applications."
          : "One profile, infinite tailored resumes. Free to start."}
      </p>

      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 28 }}>
        {mode === "signup" && (
          <div>
            <div className="label" style={{ marginBottom: 6 }}>Full name</div>
            <input
              className="field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Aanya Mehta"
              autoComplete="name"
            />
          </div>
        )}
        <div>
          <div className="label" style={{ marginBottom: 6 }}>Email</div>
          <input
            className="field"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
          />
        </div>
        <div>
          <div className="label" style={{ marginBottom: 6 }}>Password</div>
          <input
            className="field"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
          />
        </div>

        {error && (
          <div role="alert" style={{ fontSize: 13.5, color: "#d6447a", display: "flex", alignItems: "center", gap: 7 }}>
            <Icon name="xcircle" size={15} /> {error}
          </div>
        )}
        {notice && (
          <div style={{ fontSize: 13.5, color: "var(--green)", display: "flex", alignItems: "center", gap: 7 }}>
            <Icon name="check" size={15} /> {notice}
          </div>
        )}

        <button className="btn btn-primary btn-lg" type="submit" disabled={busy} style={{ justifyContent: "center", marginTop: 6 }}>
          {busy ? <Spinner size={17} color="#fff" /> : null} {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>

      <div style={{ textAlign: "center", marginTop: 20, fontSize: 14, color: "var(--ink-2)" }}>
        {mode === "signin" ? (
          <>
            New here?{" "}
            <button onClick={() => { setMode("signup"); setError(null); }} style={linkBtn}>
              Create an account
            </button>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <button onClick={() => { setMode("signin"); setError(null); }} style={linkBtn}>
              Sign in
            </button>
          </>
        )}
      </div>
    </FadeIn>
  );
}

const linkBtn: React.CSSProperties = {
  border: "none",
  background: "none",
  color: "var(--accent-ink)",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: 14,
  fontFamily: "var(--sans)",
};
