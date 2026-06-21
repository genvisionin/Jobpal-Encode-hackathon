/**
 * gmail.ts — Google OAuth + Gmail read-only message fetching.
 *
 * Scope is restricted to `gmail.readonly` — we can never send or delete mail.
 * The flow:
 *   1. buildAuthUrl() → user consents on Google
 *   2. exchangeCode() → access + refresh tokens
 *   3. fetchMessagesSince() → recent messages, parsed to plain text
 *
 * Incremental sync uses a Gmail search query bounded by the connection's
 * `connectedAt` (day X) and the last sync time, so we never read mail from
 * before the user opted in.
 */

import { env } from "@/lib/env";
import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import type { EmailMessage } from "@/lib/schema/tracker";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

/**
 * A Gmail/Google API failure with a user-readable message. Lets the sync layer
 * surface *why* a sync failed (API disabled, token revoked, rate limited)
 * instead of a generic "Sync failed".
 */
export class GmailApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly reason?: string,
  ) {
    super(message);
    this.name = "GmailApiError";
  }
}

/** Turn a non-OK Gmail response into a typed, human-readable error. */
async function gmailError(res: Response, context: string): Promise<GmailApiError> {
  let reason: string | undefined;
  let apiMessage = "";
  try {
    const body = (await res.json()) as {
      error?: { message?: string; errors?: { reason?: string }[]; status?: string };
    };
    apiMessage = body.error?.message ?? "";
    reason = body.error?.errors?.[0]?.reason ?? body.error?.status;
  } catch {
    /* non-JSON body */
  }

  // Map the common, actionable cases to a clear message.
  if (res.status === 403 && /has not been used|is disabled|accessNotConfigured|SERVICE_DISABLED/i.test(apiMessage + reason)) {
    return new GmailApiError(
      "The Gmail API is not enabled for this Google Cloud project. Enable it in the Google Cloud console, wait a minute, then sync again.",
      res.status,
      "gmail_api_disabled",
    );
  }
  if (res.status === 401) {
    return new GmailApiError(
      "Gmail access has expired or was revoked. Disconnect and reconnect your Google account.",
      res.status,
      "token_invalid",
    );
  }
  if (res.status === 429) {
    return new GmailApiError("Gmail rate limit reached. Try syncing again in a moment.", res.status, "rate_limited");
  }
  return new GmailApiError(
    apiMessage ? `${context}: ${apiMessage}` : `${context} (HTTP ${res.status}).`,
    res.status,
    reason,
  );
}

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "openid",
];

/**
 * A Gmail search query that pre-filters obvious application mail before the
 * LLM does the precise classification. Broad on purpose — recall over
 * precision, since the LLM is the real filter.
 */
export const JOB_MAIL_QUERY =
  '(subject:(applied OR application OR interview OR "thank you for applying" OR offer OR "next steps" OR assessment OR candidate OR "your application") ' +
  'OR from:(greenhouse OR lever OR ashby OR workday OR icims OR smartrecruiters OR myworkday OR recruiting OR talent OR careers OR jobs OR "no-reply")) ' +
  "-category:promotions";

function redirectUri(): string {
  return env.google.redirectUri ?? `${env.app.baseUrl}/api/tracker/callback`;
}

function stateSecret(): string {
  return env.supabase.serviceKey || env.app.cronSecret || env.google.clientSecret || "local-dev";
}

function base64url(value: string): string {
  return Buffer.from(value, "utf-8").toString("base64url");
}

function signState(payload: string): string {
  return createHmac("sha256", stateSecret()).update(payload).digest("base64url");
}

export function buildOAuthState(userId: string): string {
  const payload = base64url(
    JSON.stringify({ userId, nonce: randomUUID(), createdAt: Date.now() }),
  );
  return `${payload}.${signState(payload)}`;
}

export function verifyOAuthState(state: string): { userId: string } | null {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) return null;
  const expected = signState(payload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8")) as {
      userId?: string;
      createdAt?: number;
    };
    if (!data.userId || !data.createdAt) return null;
    if (Date.now() - data.createdAt > 15 * 60 * 1000) return null;
    return { userId: data.userId };
  } catch {
    return null;
  }
}

export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.google.clientId!,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: GMAIL_SCOPES.join(" "),
    access_type: "offline", // get a refresh token
    prompt: "consent",
    state,
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresAt: string;
  email: string;
}

export async function exchangeCode(code: string): Promise<TokenResponse> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.google.clientId!,
      client_secret: env.google.clientSecret!,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    id_token?: string;
  };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    email: decodeEmailFromIdToken(data.id_token),
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: env.google.clientId!,
      client_secret: env.google.clientSecret!,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    email: "",
  };
}

function decodeEmailFromIdToken(idToken?: string): string {
  if (!idToken) return "";
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64").toString("utf-8"));
    return payload.email ?? "";
  } catch {
    return "";
  }
}

/** Fetch + parse messages received since `sinceIso` (capped at `max`). */
export async function fetchMessagesSince(
  accessToken: string,
  sinceIso: string,
  max = 40,
): Promise<EmailMessage[]> {
  const afterEpoch = Math.floor(new Date(sinceIso).getTime() / 1000);
  const q = `${JOB_MAIL_QUERY} after:${afterEpoch}`;

  // Page through the message-list endpoint (100/page) until we hit `max`.
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q,
      maxResults: String(Math.min(100, max - ids.length)),
    });
    if (pageToken) params.set("pageToken", pageToken);
    const listUrl = `${GMAIL_API}/messages?${params.toString()}`;
    const listRes = await fetch(listUrl, { headers: authHeader(accessToken) });
    if (!listRes.ok) throw await gmailError(listRes, "Gmail message list failed");
    const list = (await listRes.json()) as { messages?: { id: string }[]; nextPageToken?: string };
    for (const m of list.messages ?? []) ids.push(m.id);
    pageToken = list.nextPageToken;
  } while (pageToken && ids.length < max);

  // Fetch full messages with a small concurrency cap (kind to rate limits,
  // far faster than fully sequential for a backfill of ~100 messages).
  const messages: EmailMessage[] = [];
  const CONCURRENCY = 6;
  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const batch = ids.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map((id) => fetchMessage(accessToken, id)),
    );
    for (const r of settled) {
      if (r.status === "fulfilled" && r.value) messages.push(r.value);
    }
  }
  return messages;
}

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

interface GmailPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
}

async function fetchMessage(accessToken: string, id: string): Promise<EmailMessage | null> {
  const url = `${GMAIL_API}/messages/${id}?format=full`;
  const res = await fetch(url, { headers: authHeader(accessToken) });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    id: string;
    threadId: string;
    snippet: string;
    internalDate: string;
    payload?: { headers?: { name: string; value: string }[]; parts?: GmailPart[]; body?: { data?: string }; mimeType?: string };
  };

  const headers = data.payload?.headers ?? [];
  const header = (name: string) =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";

  const body = extractPlainText(data.payload).slice(0, 4000);

  return {
    id: data.id,
    threadId: data.threadId,
    from: header("From"),
    subject: header("Subject"),
    snippet: data.snippet ?? "",
    body,
    receivedAt: new Date(Number(data.internalDate)).toISOString(),
  };
}

/** Walk the MIME tree and pull the best plain-text representation. */
function extractPlainText(payload?: GmailPart): string {
  if (!payload) return "";
  const decode = (d?: string) =>
    d ? Buffer.from(d.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8") : "";

  if (payload.mimeType === "text/plain" && payload.body?.data) return decode(payload.body.data);

  if (payload.parts) {
    // Prefer text/plain; fall back to stripped HTML.
    const plain = payload.parts.find((p) => p.mimeType === "text/plain");
    if (plain?.body?.data) return decode(plain.body.data);
    const html = payload.parts.find((p) => p.mimeType === "text/html");
    if (html?.body?.data) return stripHtml(decode(html.body.data));
    // Recurse into nested multiparts.
    for (const part of payload.parts) {
      const nested = extractPlainText(part);
      if (nested) return nested;
    }
  }
  if (payload.mimeType === "text/html" && payload.body?.data) return stripHtml(decode(payload.body.data));
  return "";
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
