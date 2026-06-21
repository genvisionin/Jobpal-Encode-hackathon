import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_REDIRECTS = 4;

export class UnsafeUrlError extends Error {
  constructor(message = "That URL is not allowed.") {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

function isPrivateIPv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

function isPrivateIPv6(address: string): boolean {
  const value = address.toLowerCase();
  if (value === "::1" || value === "::") return true;
  if (value.startsWith("fe80:") || value.startsWith("fc") || value.startsWith("fd")) return true;
  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? isPrivateIPv4(mapped[1]) : false;
}

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return (
    host === "localhost" ||
    host === "metadata.google.internal" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  );
}

function assertAllowedAddress(address: string): void {
  const family = isIP(address);
  if (family === 4 && isPrivateIPv4(address)) {
    throw new UnsafeUrlError("That host isn't allowed.");
  }
  if (family === 6 && isPrivateIPv6(address)) {
    throw new UnsafeUrlError("That host isn't allowed.");
  }
  if (family === 0) {
    throw new UnsafeUrlError("That host isn't allowed.");
  }
}

export async function assertPublicHttpUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError("That doesn't look like a valid URL.");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new UnsafeUrlError("Only http(s) URLs are supported.");
  }
  if (!url.hostname || isBlockedHostname(url.hostname)) {
    throw new UnsafeUrlError("That host isn't allowed.");
  }

  if (isIP(url.hostname)) {
    assertAllowedAddress(url.hostname);
    return url;
  }

  let records: { address: string }[];
  try {
    records = await lookup(url.hostname, { all: true, verbatim: false });
  } catch {
    throw new UnsafeUrlError("That host could not be resolved.");
  }
  if (records.length === 0) throw new UnsafeUrlError("That host could not be resolved.");
  for (const record of records) assertAllowedAddress(record.address);
  return url;
}

export async function fetchPublicUrl(
  raw: string | URL,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  let url = await assertPublicHttpUrl(String(raw));

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 10_000);
    try {
      const res = await fetch(url.href, {
        ...init,
        redirect: "manual",
        signal: controller.signal,
      });
      if (![301, 302, 303, 307, 308].includes(res.status)) return res;

      const location = res.headers.get("location");
      if (!location) return res;
      url = await assertPublicHttpUrl(new URL(location, url).href);
      if (redirects === MAX_REDIRECTS) {
        throw new UnsafeUrlError("That URL redirects too many times.");
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw new UnsafeUrlError("That URL redirects too many times.");
}
