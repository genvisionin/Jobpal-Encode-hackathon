import { randomBytes, randomUUID, createHash } from "crypto";
import { LocalStore } from "@/lib/db/local-store";
import { getStore } from "@/lib/db/store";
import { getProfile } from "@/lib/services/profile-service";
import type { ExtensionSession } from "@/lib/db/types";
import type { JobpalStore } from "@/lib/db/store";
import type { ExtensionSessionPayload, ExtensionUserSummary } from "./types";

const ACCESS_TTL_MS = 60 * 60 * 1000;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CODE_TTL_MS = 5 * 60 * 1000;

export class ExtensionAuthError extends Error {
  constructor(message = "Invalid extension session.", readonly status = 401) {
    super(message);
    this.name = "ExtensionAuthError";
  }
}

export function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function randomToken(prefix: string): string {
  return `${prefix}_${randomBytes(32).toString("base64url")}`;
}

async function getExtensionAuthStore(): Promise<JobpalStore> {
  if (process.env.NODE_ENV !== "production") {
    return new LocalStore();
  }
  return getStore();
}

function isValidRedirectUri(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".chromiumapp.org");
  } catch {
    return false;
  }
}

function extensionIdFromRedirectUri(value: string): string {
  try {
    const host = new URL(value).hostname;
    return host.replace(/\.chromiumapp\.org$/, "");
  } catch {
    return "";
  }
}

export async function createExtensionAuthCode(userId: string, redirectUri: string) {
  if (!isValidRedirectUri(redirectUri)) {
    throw new ExtensionAuthError("Invalid extension redirect URI.", 400);
  }
  const code = randomToken("jpc");
  const now = new Date();
  const store = await getExtensionAuthStore();
  await store.saveExtensionAuthCode({
    codeHash: tokenHash(code),
    userId,
    extensionId: extensionIdFromRedirectUri(redirectUri),
    redirectUri,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + CODE_TTL_MS).toISOString(),
  });
  return code;
}

async function userSummary(userId: string): Promise<ExtensionUserSummary> {
  const profile = await getProfile(userId).catch(() => null);
  const contact = profile?.resume.contact;
  return {
    id: userId,
    email: contact?.email ?? "",
    name: contact?.name ?? "",
    title: contact?.title ?? "",
    hasProfile: Boolean(profile),
  };
}

function isActive(session: ExtensionSession, now = Date.now(), useRefresh = false): boolean {
  if (session.revokedAt) return false;
  const expiry = Date.parse(useRefresh ? session.refreshExpiresAt : session.accessExpiresAt);
  return Number.isFinite(expiry) && expiry > now;
}

export async function exchangeExtensionCode(
  code: string,
  extensionId: string,
): Promise<ExtensionSessionPayload> {
  const hash = tokenHash(code);
  const store = await getExtensionAuthStore();
  const authCode = await store.getExtensionAuthCode(hash);
  if (!authCode || authCode.usedAt) throw new ExtensionAuthError("Invalid or used auth code.");
  if (Date.parse(authCode.expiresAt) <= Date.now()) {
    throw new ExtensionAuthError("Auth code expired.");
  }
  if (authCode.extensionId && extensionId && authCode.extensionId !== extensionId) {
    throw new ExtensionAuthError("Extension id mismatch.");
  }

  await store.markExtensionAuthCodeUsed(hash, new Date().toISOString());
  return createExtensionSession(authCode.userId, extensionId || authCode.extensionId);
}

export async function createExtensionSession(
  userId: string,
  extensionId: string,
): Promise<ExtensionSessionPayload> {
  const accessToken = randomToken("jpa");
  const refreshToken = randomToken("jpr");
  const now = new Date();
  const accessExpiresAt = new Date(now.getTime() + ACCESS_TTL_MS).toISOString();
  const session: ExtensionSession = {
    id: randomUUID(),
    userId,
    extensionId,
    accessTokenHash: tokenHash(accessToken),
    refreshTokenHash: tokenHash(refreshToken),
    accessExpiresAt,
    refreshExpiresAt: new Date(now.getTime() + REFRESH_TTL_MS).toISOString(),
    createdAt: now.toISOString(),
    lastUsedAt: now.toISOString(),
  };
  const store = await getExtensionAuthStore();
  await store.saveExtensionSession(session);
  return {
    accessToken,
    refreshToken,
    expiresAt: accessExpiresAt,
    user: await userSummary(userId),
  };
}

export async function refreshExtensionSession(refreshToken: string): Promise<ExtensionSessionPayload> {
  const store = await getExtensionAuthStore();
  const existing = await store.getExtensionSessionByRefreshHash(tokenHash(refreshToken));
  if (!existing || !isActive(existing, Date.now(), true)) {
    throw new ExtensionAuthError("Invalid refresh token.");
  }
  await store.revokeExtensionSession(existing.id, new Date().toISOString());
  return createExtensionSession(existing.userId, existing.extensionId);
}

export async function requireExtensionUser(req: Request): Promise<{
  userId: string;
  session: ExtensionSession;
}> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new ExtensionAuthError();
  const store = await getExtensionAuthStore();
  const session = await store.getExtensionSessionByAccessHash(tokenHash(token));
  if (!session || !isActive(session)) throw new ExtensionAuthError();
  await store.saveExtensionSession({ ...session, lastUsedAt: new Date().toISOString() });
  return { userId: session.userId, session };
}

export async function revokeExtensionRequest(req: Request): Promise<void> {
  const { session } = await requireExtensionUser(req);
  const store = await getExtensionAuthStore();
  await store.revokeExtensionSession(session.id, new Date().toISOString());
}

export { userSummary as getExtensionUserSummary };
