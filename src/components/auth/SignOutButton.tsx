"use client";

import { Icon } from "@/components/ui";
import { getBrowserSupabase } from "@/lib/auth/supabase-browser";

/** SignOutButton — signs out via Supabase and returns to the login screen. */
export function SignOutButton({ className = "btn btn-ghost", style }: { className?: string; style?: React.CSSProperties }) {
  async function signOut() {
    try {
      await getBrowserSupabase().auth.signOut();
    } catch {
      // ignore — fall through to redirect
    }
    window.location.assign("/login");
  }

  return (
    <button className={className} style={{ color: "#d6447a", ...style }} onClick={signOut}>
      <Icon name="logout" size={16} /> Sign out
    </button>
  );
}
