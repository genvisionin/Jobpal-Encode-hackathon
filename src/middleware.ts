/**
 * middleware.ts — keeps the Supabase auth session fresh on every request and
 * guards the authenticated areas of the app.
 *
 * When auth is configured, unauthenticated users hitting an app route are
 * redirected to /login, and signed-in users hitting /login are sent to the
 * dashboard. When auth is NOT configured (local dev), it's a no-op so the app
 * stays runnable without keys.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PUBLIC_PATHS = ["/login", "/auth"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export async function middleware(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Auth not configured → don't gate anything (local dev).
  if (!url || !anon) return NextResponse.next();

  let res = NextResponse.next({ request: req });

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(toSet) {
        toSet.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        toSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = req.nextUrl;

  // Signed-in user on the login page → send to the app.
  if (user && pathname === "/login") {
    return NextResponse.redirect(new URL("/customize", req.url));
  }

  // Unauthenticated user on a protected page → send to login (preserve target).
  if (!user && !isPublic(pathname)) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname + search);
    if (pathname.startsWith("/extension-auth") && req.nextUrl.searchParams.get("mode") === "signup") {
      loginUrl.searchParams.set("mode", "signup");
    }
    return NextResponse.redirect(loginUrl);
  }

  return res;
}

export const config = {
  // Run on app pages, but skip Next internals, static assets, and API routes
  // (routes do their own auth and return JSON 401s rather than redirects).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
