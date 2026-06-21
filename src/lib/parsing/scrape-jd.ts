/**
 * scrape-jd.ts — extract job-description text from a URL.
 *
 * Strategy (ported from the career-ops reference's provider approach):
 *   1. ATS JSON APIs first — Greenhouse, Lever, Ashby expose clean JSON for
 *      a posting, which is far more reliable than scraping rendered HTML.
 *   2. Generic fetch + cheerio fallback — strip nav/script/style and pull
 *      the main content text for any other career page.
 *
 * The returned text is then handed to the LLM JD parser. SSRF guards keep
 * fetches to https and block obvious internal hosts.
 */

import * as cheerio from "cheerio";
import { fetchPublicUrl, assertPublicHttpUrl, UnsafeUrlError } from "@/lib/security/safe-fetch";

const USER_AGENT = "Mozilla/5.0 (compatible; Jobpal/1.0)";
const TIMEOUT_MS = 12_000;

export interface ScrapedJD {
  text: string;
  /** Best-effort hints the LLM parser can use/override. */
  company?: string;
  role?: string;
  location?: string;
}

export class ScrapeError extends Error {}

async function fetchWithTimeout(url: string, headers: Record<string, string> = {}): Promise<Response> {
  try {
    return await fetchPublicUrl(url, {
      headers: { "user-agent": USER_AGENT, ...headers },
      timeoutMs: TIMEOUT_MS,
    });
  } catch (err) {
    if (err instanceof UnsafeUrlError) throw new ScrapeError(err.message);
    throw err;
  }
}

function htmlToText(html: string): string {
  return cheerio
    .load(html)("body")
    .text()
    .replace(/\s+/g, " ")
    .trim();
}

/* ---------- ATS providers ---------- */

/** Greenhouse: job-boards.greenhouse.io/{board}/jobs/{id} → boards-api JSON. */
async function tryGreenhouse(url: URL): Promise<ScrapedJD | null> {
  const m = url.href.match(/greenhouse\.io\/(?:embed\/job_app\?for=)?([^/?#]+).*?(?:jobs?\/|gh_jid=)(\d+)/);
  if (!m) return null;
  const [, board, id] = m;
  const api = `https://boards-api.greenhouse.io/v1/boards/${board}/jobs/${id}`;
  const res = await fetchWithTimeout(api, { accept: "application/json" });
  if (!res.ok) return null;
  const job = (await res.json()) as { title?: string; content?: string; location?: { name?: string } };
  return {
    text: htmlToText(job.content ?? ""),
    role: job.title,
    location: job.location?.name,
    company: board,
  };
}

/** Lever: jobs.lever.co/{company}/{id} → ?mode=json. */
async function tryLever(url: URL): Promise<ScrapedJD | null> {
  const m = url.href.match(/lever\.co\/([^/?#]+)\/([0-9a-f-]+)/i);
  if (!m) return null;
  const [, company, id] = m;
  const api = `https://api.lever.co/v0/postings/${company}/${id}?mode=json`;
  const res = await fetchWithTimeout(api, { accept: "application/json" });
  if (!res.ok) return null;
  const job = (await res.json()) as {
    text?: string;
    descriptionPlain?: string;
    categories?: { location?: string };
  };
  return {
    text: (job.descriptionPlain || job.text || "").trim(),
    role: job.text,
    location: job.categories?.location,
    company,
  };
}

/** Ashby: jobs.ashbyhq.com/{org}/{id} → posting API. */
async function tryAshby(url: URL): Promise<ScrapedJD | null> {
  const m = url.href.match(/ashbyhq\.com\/([^/?#]+)\/([0-9a-f-]+)/i);
  if (!m) return null;
  const [, org, id] = m;
  const api = `https://api.ashbyhq.com/posting-api/job-board/${org}?includeCompensation=true`;
  const res = await fetchWithTimeout(api, { accept: "application/json" });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    jobs?: { id?: string; title?: string; descriptionPlain?: string; location?: string }[];
  };
  const job = data.jobs?.find((j) => j.id === id) ?? data.jobs?.[0];
  if (!job) return null;
  return { text: (job.descriptionPlain ?? "").trim(), role: job.title, location: job.location, company: org };
}

/* ---------- main entry ---------- */

export async function scrapeJobDescription(rawUrl: string): Promise<ScrapedJD> {
  let url: URL;
  try {
    url = await assertPublicHttpUrl(rawUrl);
  } catch (err) {
    if (err instanceof UnsafeUrlError) throw new ScrapeError(err.message);
    throw err;
  }

  // Try ATS providers first.
  for (const provider of [tryGreenhouse, tryLever, tryAshby]) {
    try {
      const result = await provider(url);
      if (result && result.text.length > 80) return result;
    } catch {
      // fall through to generic
    }
  }

  // Generic HTML fallback.
  const res = await fetchWithTimeout(url.href, { accept: "text/html" });
  if (!res.ok) {
    throw new ScrapeError(`Couldn't fetch that page (HTTP ${res.status}). Try pasting the description instead.`);
  }
  const html = await res.text();
  const text = htmlToText(html);
  if (text.length < 80) {
    throw new ScrapeError(
      "That page didn't return readable text (it may need JavaScript). Try pasting the description instead.",
    );
  }
  return { text };
}
