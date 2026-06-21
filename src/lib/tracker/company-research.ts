/**
 * company-research.ts — real web grounding for the interview prep pack.
 *
 * SERVER-ONLY (network + HTML scraping). Inspired by the career-ops
 * `interview-prep` mode's research step: instead of asking the model to recall
 * a company from memory (which fails for small/new companies), we run targeted
 * public web searches across the places candidates actually talk — Glassdoor,
 * Blind (teamblind), Reddit, Levels.fyi, LeetCode discuss — plus the company's
 * own site/news, harvest the result snippets + source links, and hand those raw
 * findings to the model as grounding.
 *
 * We ALSO discover the REAL job posting (`discoverJobPosting`): we search ATS
 * boards + the company's careers pages for the exact role and scrape its full
 * JD text, so the prep is grounded in the actual job description rather than a
 * generic read of the title.
 *
 * We use DuckDuckGo's HTML endpoint (no API key), the same approach as the job
 * discovery module. It's best-effort and failure-isolated: any query that
 * errors or rate-limits is skipped, never sinking the whole prep. The model is
 * still the synthesizer — this just gives it real, current material to work
 * from and cite, rather than inventing.
 */

import * as cheerio from "cheerio";
import { scrapeJobDescription } from "@/lib/parsing/scrape-jd";

const UA = "Mozilla/5.0 (compatible; Jobpal/1.0)";
const PER_QUERY_TIMEOUT_MS = 9000;
const MAX_RESULTS_PER_QUERY = 5;

/** One harvested search result. */
export interface ResearchSnippet {
  title: string;
  url: string;
  snippet: string;
  /** Which surface it came from (glassdoor/reddit/blind/levels/leetcode/web). */
  source: string;
}

/** Findings grouped by what they inform, plus a flat source list for the UI. */
export interface ResearchFindings {
  company: string;
  role: string;
  /** Candidate experience reviews (Glassdoor/Blind/Reddit). */
  experiences: ResearchSnippet[];
  /** Reported interview questions / process detail. */
  questions: ResearchSnippet[];
  /** Compensation signals (Levels.fyi/Glassdoor salary). */
  compensation: ResearchSnippet[];
  /** Company background / news / what they do. */
  about: ResearchSnippet[];
  /** Every unique source link harvested, for display + attribution. */
  sources: { title: string; url: string; source: string }[];
  /** True when we got essentially nothing back (offline / blocked / obscure co). */
  sparse: boolean;
}

/* ---------- low-level search ---------- */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Run one DuckDuckGo HTML query → harvested results. */
async function ddg(query: string, source: string): Promise<ResearchSnippet[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PER_QUERY_TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=us-en`,
      {
        headers: { "user-agent": UA, accept: "text/html" },
        redirect: "follow",
        signal: controller.signal,
      },
    );
    if (!res.ok) return [];
    const html = await res.text();
    return parseDdg(html, source).slice(0, MAX_RESULTS_PER_QUERY);
  } catch {
    return []; // failure isolation — a dead/blocked query never sinks the prep
  } finally {
    clearTimeout(timer);
  }
}

/** Decode a DuckDuckGo redirect wrapper (`/l/?uddg=<encoded>`) to the real URL. */
function decodeDdgUrl(href: string): string {
  const m = href.match(/uddg=([^&]+)/);
  if (m) {
    try {
      return decodeURIComponent(m[1]);
    } catch {
      /* ignore */
    }
  }
  return href.startsWith("//") ? `https:${href}` : href;
}

/** Parse DuckDuckGo HTML results into snippets. */
function parseDdg(html: string, source: string): ResearchSnippet[] {
  const $ = cheerio.load(html);
  const out: ResearchSnippet[] = [];
  $(".result").each((_, el) => {
    const a = $(el).find("a.result__a").first();
    const title = a.text().replace(/\s+/g, " ").trim();
    const rawHref = a.attr("href") ?? "";
    const url = decodeDdgUrl(rawHref);
    const snippet = $(el).find(".result__snippet").text().replace(/\s+/g, " ").trim();
    if (title && url && /^https?:\/\//.test(url)) {
      out.push({ title, url, snippet, source });
    }
  });
  return out;
}

/* ---------- query plan ---------- */

interface QuerySpec {
  q: string;
  source: string;
  bucket: "experiences" | "questions" | "compensation" | "about";
}

function buildQueries(company: string, role: string): QuerySpec[] {
  const c = company.trim();
  const r = role.trim();
  return [
    // Reported interview questions + process (the highest-value intel).
    { q: `${c} ${r} interview questions site:glassdoor.com`, source: "glassdoor", bucket: "questions" },
    { q: `${c} ${r} interview experience site:reddit.com`, source: "reddit", bucket: "questions" },
    { q: `${c} ${r} interview site:leetcode.com/discuss`, source: "leetcode", bucket: "questions" },
    { q: `${c} interview process site:teamblind.com`, source: "blind", bucket: "questions" },
    // Candidate experience / culture reviews.
    { q: `${c} interview experience review site:glassdoor.com`, source: "glassdoor", bucket: "experiences" },
    { q: `${c} working at OR review site:reddit.com`, source: "reddit", bucket: "experiences" },
    // Compensation signals.
    { q: `${c} ${r} salary site:levels.fyi`, source: "levels.fyi", bucket: "compensation" },
    // Company background (esp. for small/new companies with little model knowledge).
    { q: `${c} company what they do funding OR product`, source: "web", bucket: "about" },
    { q: `${c} ${r} news OR launch OR raised`, source: "web", bucket: "about" },
  ];
}

/* ---------- public API ---------- */

/**
 * Gather real web research for a company + role. Runs the query plan with a
 * small concurrency cap, dedupes sources, and buckets the snippets. Always
 * resolves (never throws) — returns `sparse: true` when nothing came back.
 */
export async function researchCompany(company: string, role: string): Promise<ResearchFindings> {
  const findings: ResearchFindings = {
    company,
    role,
    experiences: [],
    questions: [],
    compensation: [],
    about: [],
    sources: [],
    sparse: true,
  };
  if (!company.trim()) return findings;

  const specs = buildQueries(company, role);

  // Run in small batches to stay polite with the HTML endpoint (it rate-limits
  // hard on rapid bursts), but fast enough to stay within the route budget.
  const BATCH = 3;
  const results: { spec: QuerySpec; snippets: ResearchSnippet[] }[] = [];
  for (let i = 0; i < specs.length; i += BATCH) {
    const batch = specs.slice(i, i + BATCH);
    const settled = await Promise.all(
      batch.map(async (spec) => ({ spec, snippets: await ddg(spec.q, spec.source) })),
    );
    results.push(...settled);
    if (i + BATCH < specs.length) await sleep(350);
  }

  const seenUrl = new Set<string>();
  for (const { spec, snippets } of results) {
    for (const s of snippets) {
      findings[spec.bucket].push(s);
      if (!seenUrl.has(s.url)) {
        seenUrl.add(s.url);
        findings.sources.push({ title: s.title, url: s.url, source: s.source });
      }
    }
  }

  findings.sparse =
    findings.experiences.length + findings.questions.length + findings.about.length + findings.compensation.length ===
    0;

  return findings;
}

/* ---------- discover the REAL job posting (broad reverse search) ---------- */

/** A job posting we found + scraped on the live web for this company + role. */
export interface DiscoveredPosting {
  /** The cleaned, full job-description text (the authoritative role source). */
  text: string;
  /** Where we found it. */
  url: string;
  /** Which surface (greenhouse/lever/ashby/linkedin/indeed/web…). */
  source: string;
  /** Role title as stated on the posting, if the host gave us one. */
  role?: string;
  location?: string;
}

/**
 * Hosts that are job postings / boards worth scraping. We keep this broad on
 * purpose: tracked applications come from the user's INBOX, so the candidate
 * applied wherever — a company careers page, LinkedIn, Indeed, Wellfound, or
 * any ATS. We don't assume one portal.
 */
const POSTING_HOST_RE =
  /(greenhouse\.io|lever\.co|ashbyhq\.com|smartrecruiters\.com|myworkdayjobs\.com|workday|icims\.com|jobvite\.com|workable\.com|bamboohr\.com|breezy\.hr|recruitee\.com|teamtailor\.com|linkedin\.com\/jobs|indeed\.com|wellfound\.com|angel\.co|builtin\.com|glassdoor\.com\/job|ziprecruiter\.com|simplyhired\.com|linkedin\.com\/jobs\/view)/i;

/** ATS hosts whose JSON we scrape cleanly — slightly preferred when ranking. */
const ATS_HOST_RE = /(greenhouse\.io|lever\.co|ashbyhq\.com|smartrecruiters\.com|myworkdayjobs\.com)/i;

/** Pages that are clearly NOT a single posting (search/aggregator/listing). */
const NON_POSTING_RE =
  /(\/search|\/jobs\?|\/browse|wikipedia\.org|youtube\.com|facebook\.com|twitter\.com|x\.com|reddit\.com|teamblind\.com)/i;

/**
 * Find the actual job posting for this company + role by REVERSE-SEARCHING the
 * open web, then scrape its full text. This is what makes the prep
 * ROLE-SPECIFIC rather than a generic read of the title.
 *
 * The seed is the exact role + company we already pulled from the candidate's
 * email (the tracker sets `app.role`/`app.company` from the invite). We run a
 * BROAD search across the whole web — not scoped to any one job portal —
 * because an inbox-tracked job could have been applied to anywhere. We then
 * pick the result that best matches the exact role at that exact company and
 * scrape the real JD. Best-effort — returns null if nothing usable is found.
 *
 * @param company  employer name (from the email)
 * @param role     exact role title (from the email)
 * @param hint     optional extra signal from the email (job code / req id / id
 *                 in the subject) to disambiguate the exact posting
 */
export async function discoverJobPosting(
  company: string,
  role: string,
  hint?: string,
): Promise<DiscoveredPosting | null> {
  const c = company.trim();
  const r = role.trim();
  if (!c || !r) return null;
  const code = (hint ?? "").trim();

  // BROAD reverse search first — the exact role at the exact company, wherever
  // it's posted. Quote the title for precision; fold in a job code if the email
  // gave us one. Only after the open-web queries do we add a couple of ATS
  // hints as a backstop (they scrape cleanly when present).
  const queries = [
    code ? `${c} "${r}" ${code} job description` : `${c} "${r}" job description`,
    `${c} "${r}" careers apply`,
    `"${r}" ${c} job posting`,
    `${c} ${r} site:linkedin.com/jobs`,
    `${c} ${r} (greenhouse OR lever OR ashby OR workday)`,
  ];

  // Harvest candidate result links across the queries.
  const candidates: ResearchSnippet[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < queries.length; i += 3) {
    const batch = queries.slice(i, i + 3);
    const settled = await Promise.all(batch.map((q) => ddg(q, "web")));
    for (const list of settled) {
      for (const s of list) {
        if (!seen.has(s.url)) {
          seen.add(s.url);
          candidates.push(s);
        }
      }
    }
    if (i + 3 < queries.length) await sleep(350);
    // Stop early once we have a healthy pool with at least one posting host.
    if (candidates.length >= 8 && candidates.some((s) => POSTING_HOST_RE.test(s.url))) break;
  }
  if (candidates.length === 0) return null;

  // Rank by how well each result matches THIS exact role at THIS company.
  const roleTokens = r.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  const companyTokens = c.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  const score = (s: ResearchSnippet): number => {
    if (NON_POSTING_RE.test(s.url)) return -5;
    let n = 0;
    if (ATS_HOST_RE.test(s.url)) n += 4;
    else if (POSTING_HOST_RE.test(s.url)) n += 3;
    const hay = `${s.title} ${s.snippet} ${s.url}`.toLowerCase();
    for (const t of roleTokens) if (hay.includes(t)) n += 1;
    for (const t of companyTokens) if (hay.includes(t)) n += 1;
    if (code && hay.includes(code.toLowerCase())) n += 3;
    if (/\b(job|career|position|opening|apply|role|hiring)\b/.test(hay)) n += 1;
    return n;
  };
  const ranked = [...candidates].sort((a, b) => score(b) - score(a));

  // Try to scrape the top few until one yields real JD text. `scrapeJobDescription`
  // handles ATS JSON APIs and falls back to generic HTML extraction for any page.
  for (const cand of ranked.slice(0, 5)) {
    if (score(cand) <= 0) continue;
    try {
      const scraped = await scrapeJobDescription(cand.url);
      if (scraped.text && scraped.text.length > 200) {
        return {
          text: scraped.text.slice(0, 6000),
          url: cand.url,
          source: hostLabel(cand.url),
          role: scraped.role,
          location: scraped.location,
        };
      }
    } catch {
      // try the next candidate
    }
  }
  return null;
}

/** Short label for a posting host (greenhouse/lever/ashby/linkedin/web…). */
function hostLabel(url: string): string {
  const u = url.toLowerCase();
  if (u.includes("greenhouse")) return "greenhouse";
  if (u.includes("lever")) return "lever";
  if (u.includes("ashby")) return "ashby";
  if (u.includes("smartrecruiters")) return "smartrecruiters";
  if (u.includes("workday")) return "workday";
  if (u.includes("linkedin")) return "linkedin";
  if (u.includes("indeed")) return "indeed";
  if (u.includes("wellfound") || u.includes("angel.co")) return "wellfound";
  if (u.includes("builtin")) return "builtin";
  if (u.includes("glassdoor")) return "glassdoor";
  return "web";
}

/** Compact the findings into a text block for the LLM prompt (token-bounded). */
export function findingsToPromptBlock(f: ResearchFindings): string {
  if (f.sparse) {
    return "WEB RESEARCH: no usable public results were found (the company may be very small/new, or the network is unavailable). Be honest about this in the brief — do NOT invent specifics; lean on the role/domain and the candidate's resume instead.";
  }
  const fmt = (label: string, items: ResearchSnippet[], cap: number) =>
    items.length
      ? `${label}:\n` +
        items
          .slice(0, cap)
          .map((s) => `- [${s.source}] ${s.title}: ${s.snippet} (${s.url})`)
          .join("\n")
      : "";

  return [
    "WEB RESEARCH (real public results — use as grounding; cite the source surface; never fabricate beyond these):",
    fmt("Reported interview questions / process", f.questions, 10),
    fmt("Candidate experiences / reviews", f.experiences, 8),
    fmt("Compensation signals", f.compensation, 4),
    fmt("Company background / news", f.about, 6),
  ]
    .filter(Boolean)
    .join("\n\n");
}
