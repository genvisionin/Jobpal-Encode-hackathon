/**
 * session.ts — server-side auth resolution.
 *
 * `getCurrentUser()` returns the authenticated Supabase user (or null).
 * `requireUserId()` returns the user id, throwing `UnauthorizedError` when
 * there's no session — API routes catch this and return 401.
 *
 * When auth is NOT configured (no anon key, local dev only), these fall back
 * to a fixed dev user so the app remains runnable. With auth configured, the
 * fallback is never used.
 */

import { isAuthConfigured, DEMO_USER_ID } from "@/lib/env";
import { createServerSupabase } from "./supabase-server";

export class UnauthorizedError extends Error {
  constructor(message = "You need to be signed in.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

/** The current authenticated user, or null. Null-safe in local dev. */
export async function getCurrentUser(): Promise<AuthUser | null> {
  if (!isAuthConfigured) {
    return { id: DEMO_USER_ID, email: "you@example.com", name: "" };
  }
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const u = data.user;
  const meta = (u.user_metadata ?? {}) as { full_name?: string; name?: string };
  return {
    id: u.id,
    email: u.email ?? "",
    name: meta.full_name || meta.name || "",
  };
}

/** The current user id, throwing if unauthenticated (with auth on). */
export async function requireUserId(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user.id;
}

/** True when a real auth session exists (or auth is off in local dev). */
export async function isSignedIn(): Promise<boolean> {
  if (!isAuthConfigured) return true;
  const user = await getCurrentUser();
  return Boolean(user);
}
