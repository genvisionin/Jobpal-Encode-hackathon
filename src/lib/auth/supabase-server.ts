/**
 * supabase-server.ts — server-side Supabase clients.
 *
 * `createServerSupabase()` is request-scoped and reads/writes the auth cookies
 * so Server Components, Route Handlers, and middleware all share one session.
 *
 * `createAdminSupabase()` uses the service-role key for privileged,
 * server-only data access (bypasses RLS). Never import this in client code.
 */

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/** Request-scoped client bound to the auth cookies. */
export async function createServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(env.supabase.url!, env.supabase.anonKey!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(toSet) {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // setAll throws in pure Server Components (no response to mutate).
          // Middleware refreshes the session, so this is safe to ignore here.
        }
      },
    },
  });
}

/** Service-role client for trusted server-side DB writes (bypasses RLS). */
export function createAdminSupabase() {
  return createClient(env.supabase.url!, env.supabase.serviceKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
