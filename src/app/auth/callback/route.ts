import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/auth/supabase-server";

export const runtime = "nodejs";

/**
 * GET /auth/callback — exchanges the Supabase auth code (from an email
 * confirmation or magic link) for a session, then redirects into the app.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/customize";

  if (code) {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, url.origin));
    }
  }
  return NextResponse.redirect(new URL("/login", url.origin));
}
