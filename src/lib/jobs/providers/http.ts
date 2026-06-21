/**
 * http.ts — shared HTTP helpers for ATS providers (server-only).
 *
 * Every provider call is bounded by an AbortController timeout, sends a polite
 * UA, and surfaces a trimmed error on non-2xx. `redirect: "error"` is the
 * default so a board's
 * server-side redirect can't be used to pivot a fetch to an internal host
 * (SSRF defense-in-depth — hosts are also allowlisted per provider).
 */

const DEFAULT_TIMEOUT_MS = 10_000;
const USER_AGENT = "Mozilla/5.0 (compatible; Jobpal-JobAlerts/1.0)";

export interface FetchOpts {
  timeoutMs?: number;
  headers?: Record<string, string>;
  method?: "GET" | "POST";
  body?: string | null;
  /** Default "error" — block redirects (SSRF guard). Use "follow" only for known-safe URL resolution. */
  redirect?: RequestRedirect;
}

export class ProviderHttpError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "ProviderHttpError";
  }
}

async function fetchWithTimeout(url: string, opts: FetchOpts = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: opts.method ?? "GET",
      headers: { "user-agent": USER_AGENT, ...opts.headers },
      body: opts.body ?? undefined,
      redirect: opts.redirect ?? "error",
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const snippet = text.replace(/\s+/g, " ").trim().slice(0, 200);
      throw new ProviderHttpError(snippet ? `HTTP ${res.status}: ${snippet}` : `HTTP ${res.status}`, res.status);
    }
    return res;
  } catch (err) {
    if (controller.signal.aborted) throw new ProviderHttpError(`Request timed out after ${opts.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson<T = unknown>(url: string, opts: FetchOpts = {}): Promise<T> {
  const res = await fetchWithTimeout(url, {
    ...opts,
    headers: { accept: "application/json", ...opts.headers },
  });
  return (await res.json()) as T;
}

export async function fetchText(url: string, opts: FetchOpts = {}): Promise<string> {
  const res = await fetchWithTimeout(url, opts);
  return await res.text();
}
