import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { createExtensionAuthCode, ExtensionAuthError } from "@/lib/extension/auth";

export const runtime = "nodejs";

/** GET /extension-auth/start?redirect_uri=... — web-to-extension auth bridge. */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const redirectUri = url.searchParams.get("redirect_uri") ?? "";
    const userId = await requireUserId();
    const code = await createExtensionAuthCode(userId, redirectUri);
    const target = new URL(redirectUri);
    target.searchParams.set("code", code);
    return NextResponse.redirect(target);
  } catch (err) {
    if (err instanceof ExtensionAuthError) {
      return new NextResponse(err.message, { status: err.status });
    }
    throw err;
  }
}
