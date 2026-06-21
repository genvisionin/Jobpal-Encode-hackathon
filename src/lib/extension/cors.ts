import { env } from "@/lib/env";

function allowedOrigin(origin: string | null): string | null {
  if (!origin) return null;
  if (env.app.extensionOrigin && origin === env.app.extensionOrigin) return origin;
  if (!env.app.extensionOrigin && origin.startsWith("chrome-extension://")) return origin;
  return null;
}

export function extensionCorsHeaders(req: Request): HeadersInit {
  const origin = allowedOrigin(req.headers.get("origin"));
  if (!origin) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization,Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function extensionOptions(req: Request): Response {
  return new Response(null, { status: 204, headers: extensionCorsHeaders(req) });
}

export function jsonWithCors(req: Request, body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  for (const [key, value] of Object.entries(extensionCorsHeaders(req))) {
    headers.set(key, value);
  }
  return new Response(JSON.stringify(body), { ...init, headers });
}
