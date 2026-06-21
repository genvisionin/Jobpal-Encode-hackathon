"use client";

/**
 * supabase-browser.ts — the browser Supabase client (singleton).
 *
 * Used by client components for sign-in/sign-up/sign-out and reading the
 * current session. Auth state is persisted in cookies that the server
 * clients (and middleware) also read.
 */

import { createBrowserClient } from "@supabase/ssr";

let client: ReturnType<typeof createBrowserClient> | null = null;

export function getBrowserSupabase() {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  client = createBrowserClient(url, anon);
  return client;
}
