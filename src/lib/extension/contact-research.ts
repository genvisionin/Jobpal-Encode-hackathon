import * as cheerio from "cheerio";
import { env, isExaConfigured } from "@/lib/env";
import {
  contactRecommendationsResultSchema,
  type ContactRecommendation,
  type ContactRecommendationRequest,
  type ContactRecommendationsResult,
} from "@/lib/extension/types";

const EXA_SEARCH_URL = "https://api.exa.ai/search";
const EXA_TIMEOUT_MS = 14_000;
const WEB_SEARCH_TIMEOUT_MS = 10_000;
const MAX_QUERY_RESULTS = 7;
const UA = "Mozilla/5.0 (compatible; Jobpal/1.0)";

type ContactType = ContactRecommendation["contactType"];

interface ExaResult {
  title?: string | null;
  url?: string | null;
  highlights?: string[] | null;
  summary?: string | null;
  text?: string | null;
  score?: number | null;
}

interface ExaResponse {
  results?: ExaResult[];
}

interface RoleFamily {
  key: string;
  label: string;
  keywords: string[];
  managerTitles: string[];
}

interface RankedContact extends ContactRecommendation {
  score: number;
}

const ROLE_FAMILIES: RoleFamily[] = [
  {
    key: "engineering",
    label: "engineering",
    keywords: ["software", "backend", "frontend", "fullstack", "engineer", "infrastructure", "platform", "security", "devops", "sre", "ml"],
    managerTitles: ["engineering manager", "head of engineering", "director of engineering", "vp engineering", "engineering lead", "technical lead"],
  },
  {
    key: "product",
    label: "product",
    keywords: ["product manager", "product", "growth", "roadmap", "platform pm"],
    managerTitles: ["product lead", "product manager", "group product manager", "head of product", "director of product", "vp product"],
  },
  {
    key: "design",
    label: "design",
    keywords: ["designer", "product design", "ux", "ui", "researcher", "visual"],
    managerTitles: ["design manager", "product design lead", "head of design", "director of design", "ux lead"],
  },
  {
    key: "data",
    label: "data",
    keywords: ["data", "analytics", "machine learning", "ml", "ai", "scientist", "analyst"],
    managerTitles: ["data science manager", "analytics manager", "ml lead", "head of data", "director of data"],
  },
  {
    key: "sales",
    label: "sales",
    keywords: ["sales", "account executive", "business development", "revenue", "partnerships"],
    managerTitles: ["sales manager", "revenue lead", "head of sales", "director of sales", "vp sales"],
  },
  {
    key: "marketing",
    label: "marketing",
    keywords: ["marketing", "growth", "brand", "content", "demand generation", "performance"],
    managerTitles: ["marketing manager", "growth lead", "head of marketing", "director of marketing", "vp marketing"],
  },
  {
    key: "operations",
    label: "operations",
    keywords: ["operations", "strategy", "program manager", "project manager", "business operations", "chief of staff"],
    managerTitles: ["operations manager", "program lead", "head of operations", "director of operations"],
  },
];

function clean(value: string | null | undefined, max = 500): string {
  return (value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalize(value: string): string {
  return clean(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stableId(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `contact-${(hash >>> 0).toString(36)}`;
}

function linkedinProfileUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (!host.endsWith("linkedin.com")) return null;
    if (!/^\/in\/[^/?#]+\/?$/i.test(url.pathname)) return null;
    url.search = "";
    url.hash = "";
    url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return null;
  }
}

function inferRoleFamily(role: string, description: string): RoleFamily {
  const hay = normalize(`${role} ${description.slice(0, 2500)}`);
  let best = ROLE_FAMILIES[0];
  let bestScore = -1;
  for (const family of ROLE_FAMILIES) {
    const score = family.keywords.reduce((sum, keyword) => sum + (hay.includes(normalize(keyword)) ? 1 : 0), 0);
    if (score > bestScore) {
      best = family;
      bestScore = score;
    }
  }
  if (bestScore <= 0) {
    const tokens = normalize(role)
      .split(" ")
      .filter((token) => token.length >= 4 && !["senior", "staff", "lead", "principal", "manager", "associate", "junior", "remote"].includes(token));
    const label = tokens.slice(0, 2).join(" ") || "role";
    return {
      key: "custom",
      label,
      keywords: tokens.length ? tokens : [role],
      managerTitles: [
        `${label} manager`,
        `${label} lead`,
        `head of ${label}`,
        `director of ${label}`,
        "hiring manager",
        "team lead",
      ],
    };
  }
  return best;
}

function topDomainKeywords(role: string, description: string, family: RoleFamily): string[] {
  const hay = normalize(`${role} ${description}`);
  const roleTokens = normalize(role)
    .split(" ")
    .filter((token) => token.length >= 4 && !["senior", "staff", "lead", "principal", "manager", "associate", "junior", "remote"].includes(token));
  const candidates = [
    ...roleTokens,
    ...family.keywords,
    "payments",
    "billing",
    "infrastructure",
    "platform",
    "security",
    "ai",
    "machine learning",
    "data",
    "growth",
    "mobile",
    "enterprise",
    "frontend",
    "backend",
    "api",
    "customer",
  ];
  const seen = new Set<string>();
  return candidates
    .filter((keyword) => {
      const key = normalize(keyword);
      if (seen.has(key) || !hay.includes(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 4);
}

function titlePhraseCandidates(role: string, family: RoleFamily): string[] {
  const roleTokens = normalize(role)
    .split(" ")
    .filter((token) => token.length >= 4 && !["senior", "staff", "lead", "principal", "manager", "associate", "junior", "remote"].includes(token));
  const primaryRole = roleTokens.slice(0, 3).join(" ");
  return [
    ...family.managerTitles,
    primaryRole ? `${primaryRole} lead` : `${family.label} lead`,
    primaryRole ? `${primaryRole} manager` : `${family.label} manager`,
    `head of ${primaryRole || family.label}`,
    `director of ${primaryRole || family.label}`,
  ]
    .map((value) => clean(value, 80))
    .filter(Boolean)
    .filter((value, index, list) => list.findIndex((item) => normalize(item) === normalize(value)) === index)
    .slice(0, 8);
}

function buildQueries(input: ContactRecommendationRequest): string[] {
  const family = inferRoleFamily(input.role, input.description);
  const domain = topDomainKeywords(input.role, input.description, family).join(" ");
  const company = input.company.trim();
  const role = input.role.trim();
  const managerTitles = titlePhraseCandidates(role, family)
    .slice(0, 5)
    .map((title) => `"${title}"`)
    .join(" OR ");

  return [
    `site:linkedin.com/in ${company} recruiter OR "talent acquisition" "${role}"`,
    `site:linkedin.com/in ${company} recruiter OR sourcer OR "talent partner" ${domain || role}`,
    `site:linkedin.com/in ${company} (${managerTitles}) ${domain}`,
    `site:linkedin.com/in ${company} "${role}" hiring manager`,
    `site:linkedin.com/in ${company} ${domain || role} lead OR manager hiring`,
  ];
}

async function exaSearch(query: string, usePeopleCategory = true): Promise<ExaResult[]> {
  if (!isExaConfigured) return [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EXA_TIMEOUT_MS);
  try {
    const body: Record<string, unknown> = {
      query,
      type: "auto",
      numResults: MAX_QUERY_RESULTS,
      contents: {
        highlights: {
          query,
          numSentences: 2,
          highlightsPerUrl: 2,
        },
      },
    };
    if (usePeopleCategory) body.category = "people";

    const res = await fetch(EXA_SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.exa.apiKey!,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      if (usePeopleCategory && res.status >= 400 && res.status < 500) return exaSearch(query, false);
      return [];
    }

    const data = (await res.json()) as ExaResponse;
    return Array.isArray(data.results) ? data.results : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function decodeDdgUrl(href: string): string {
  const match = href.match(/uddg=([^&]+)/);
  if (match) {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return href;
    }
  }
  return href.startsWith("//") ? `https:${href}` : href;
}

function parseDdgResults(html: string): ExaResult[] {
  const $ = cheerio.load(html);
  const results: ExaResult[] = [];
  $(".result").each((_, element) => {
    const anchor = $(element).find("a.result__a").first();
    const title = clean(anchor.text(), 180);
    const url = decodeDdgUrl(anchor.attr("href") ?? "");
    const snippet = clean($(element).find(".result__snippet").text(), 900);
    if (title && linkedinProfileUrl(url)) {
      results.push({
        title,
        url,
        highlights: snippet ? [snippet] : [],
        summary: snippet,
      });
    }
  });
  return results.slice(0, MAX_QUERY_RESULTS);
}

async function fallbackWebSearch(query: string): Promise<ExaResult[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEB_SEARCH_TIMEOUT_MS);
  try {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=us-en`, {
      headers: { "user-agent": UA, accept: "text/html" },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!res.ok) return [];
    return parseDdgResults(await res.text());
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function searchContacts(query: string): Promise<ExaResult[]> {
  return isExaConfigured ? exaSearch(query) : fallbackWebSearch(query);
}

function resultText(result: ExaResult): string {
  return clean(
    [
      result.title,
      result.summary,
      ...(Array.isArray(result.highlights) ? result.highlights : []),
      result.text,
    ]
      .filter(Boolean)
      .join(" "),
    5000,
  );
}

function companyMatches(text: string, company: string): boolean {
  const hay = normalize(text);
  const exact = normalize(company);
  if (exact && hay.includes(exact)) return true;
  const tokens = exact.split(" ").filter((token) => token.length > 2 && !["inc", "ltd", "llc", "limited", "group"].includes(token));
  return tokens.length > 0 && tokens.every((token) => hay.includes(token));
}

function isProbablyFormer(text: string, company: string): boolean {
  const hay = normalize(text);
  const companyName = normalize(company);
  if (!companyName || !hay.includes(companyName)) return false;
  return new RegExp(`\\b(ex|former|previously|past)\\b.{0,30}${companyName}`).test(hay) || new RegExp(`${companyName}.{0,30}\\b(alumni|former)\\b`).test(hay);
}

function hasCurrentSignal(text: string, company: string): boolean {
  const hay = normalize(text);
  const companyName = normalize(company);
  if (!companyName) return false;
  return (
    new RegExp(`\\bat\\s+${companyName}\\b`).test(hay) ||
    new RegExp(`${companyName}.{0,70}\\b(current|present)\\b`).test(hay) ||
    new RegExp(`\\b(current|present).{0,70}${companyName}\\b`).test(hay)
  );
}

function parseName(title: string, url: string): string {
  const fromTitle = clean(title)
    .replace(/\s+\|\s+LinkedIn.*$/i, "")
    .split(/\s[-|]\s/)
    .map((part) => clean(part))
    .filter(Boolean)[0];
  if (fromTitle && !/linkedin|profile|people/i.test(fromTitle)) return fromTitle.slice(0, 80);
  try {
    const slug = new URL(url).pathname.split("/").filter(Boolean)[1] ?? "";
    return slug
      .split(/[-_]+/)
      .filter(Boolean)
      .slice(0, 3)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  } catch {
    return "LinkedIn profile";
  }
}

function parseTitle(result: ExaResult, company: string): string {
  const title = clean(result.title);
  const text = resultText(result);
  const companyName = company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`(?:###\\s*)?([^.!?\\n]{4,90}?)\\s+at\\s+\\[?${companyName}\\]?`, "i"),
    new RegExp(`([^.!?\\n]{4,90}?)\\s+@\\s+${companyName}`, "i"),
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const value = clean(match[1].replace(/^current\s+/i, ""), 90);
      if (value && !value.toLowerCase().includes("linkedin")) return value;
    }
  }

  const titleParts = title.split(/\s[-|]\s/).map((part) => clean(part)).filter(Boolean);
  const likely = titleParts.find((part) => /recruit|talent|manager|lead|head|director|engineer|designer|product|founder|chief|vp/i.test(part));
  return likely || `Contact at ${company}`;
}

function classifyContact(text: string): ContactType {
  const hay = normalize(text);
  if (/\b(recruiter|recruiting|talent acquisition|talent partner|sourcer|people partner|staffing)\b/.test(hay)) return "recruiter";
  if (/\b(co founder|founder|ceo|cto|chief technology|chief product|chief people|chief talent)\b/.test(hay)) return "exec";
  if (/\b(manager|head|director|vp|vice president|hiring manager|engineering lead|product lead|design lead|data lead)\b/.test(hay)) {
    return "hiring_manager";
  }
  if (/\b(staff|principal|lead|senior)\b.{0,40}\b(engineer|designer|product manager|scientist|analyst)\b/.test(hay)) return "team_lead";
  return "peer";
}

function roleFamilyMatches(text: string, family: RoleFamily): boolean {
  const hay = normalize(text);
  return family.keywords.some((keyword) => hay.includes(normalize(keyword))) || family.managerTitles.some((title) => hay.includes(normalize(title)));
}

function hasHiringSignal(text: string): boolean {
  return /\b(hiring|open role|open roles|join my team|join us|we are looking|reach out|dm me|apply|careers|recruiting)\b/i.test(text);
}

function reasonFor(contactType: ContactType, family: RoleFamily, input: ContactRecommendationRequest, hiringSignal: boolean): string {
  if (contactType === "recruiter") {
    return hiringSignal
      ? `Recruiting signal for ${family.label} roles at ${input.company}.`
      : `Talent contact connected to ${family.label} hiring at ${input.company}.`;
  }
  if (contactType === "hiring_manager") return `Likely ${family.label} leader for this role area at ${input.company}.`;
  if (contactType === "team_lead") return `Senior ${family.label} contact close to the role's work.`;
  if (contactType === "exec") return `Executive contact at ${input.company}; useful when no closer hiring contact is available.`;
  return `Relevant ${family.label} contact at ${input.company}.`;
}

function scoreContact(result: ExaResult, input: ContactRecommendationRequest): RankedContact | null {
  const url = result.url ? linkedinProfileUrl(result.url) : null;
  if (!url) return null;

  const family = inferRoleFamily(input.role, input.description);
  const text = resultText(result);
  const title = parseTitle(result, input.company);
  const combined = `${result.title ?? ""} ${title} ${text}`;
  const contactType = classifyContact(combined);
  const matchedCompany = companyMatches(combined, input.company);
  const currentCompany = hasCurrentSignal(combined, input.company);
  const former = isProbablyFormer(combined, input.company);
  const roleMatch = roleFamilyMatches(combined, family);
  const hiringSignal = hasHiringSignal(combined);

  let score = 8;
  if (matchedCompany) score += 24;
  if (currentCompany) score += 16;
  if (former) score -= 32;
  if (contactType === "recruiter") score += 30;
  if (contactType === "hiring_manager") score += 24;
  if (contactType === "team_lead") score += 15;
  if (contactType === "exec") score += 8;
  if (roleMatch) score += 16;
  if (hiringSignal) score += 12;
  if (input.location && normalize(combined).includes(normalize(input.location))) score += 5;
  if (Array.isArray(result.highlights) && result.highlights.length > 0) score += 5;
  if (typeof result.score === "number") score += Math.min(8, Math.max(0, result.score * 4));

  if (!matchedCompany && !currentCompany) score -= 22;
  if (score < 42) return null;

  const confidence = Math.round(Math.max(0.35, Math.min(0.98, score / 100)) * 100) / 100;
  const evidenceText = clean((Array.isArray(result.highlights) ? result.highlights : []).join(" "), 700);
  return {
    id: stableId(url),
    name: parseName(result.title ?? "", url),
    title,
    company: input.company,
    linkedinUrl: url,
    contactType,
    confidence,
    reason: reasonFor(contactType, family, input, hiringSignal),
    evidence: [
      {
        title: clean(result.title || "LinkedIn profile", 160),
        url,
        snippet: evidenceText || clean(result.summary || text, 700),
      },
    ],
    score,
  };
}

function selectDiverse(contacts: RankedContact[]): ContactRecommendation[] {
  const typeCaps: Record<ContactType, number> = {
    recruiter: 2,
    hiring_manager: 2,
    team_lead: 1,
    exec: 1,
    peer: 1,
  };
  const selected: RankedContact[] = [];
  const counts: Record<ContactType, number> = {
    recruiter: 0,
    hiring_manager: 0,
    team_lead: 0,
    exec: 0,
    peer: 0,
  };

  for (const contact of contacts) {
    if (selected.some((item) => item.linkedinUrl === contact.linkedinUrl)) continue;
    if (counts[contact.contactType] >= typeCaps[contact.contactType]) continue;
    selected.push(contact);
    counts[contact.contactType] += 1;
    if (selected.length === 4) break;
  }

  if (selected.length < 4) {
    for (const contact of contacts) {
      if (selected.some((item) => item.linkedinUrl === contact.linkedinUrl)) continue;
      selected.push(contact);
      if (selected.length === 4) break;
    }
  }

  return selected.map(({ score: _score, ...contact }) => contact);
}

export async function recommendContacts(input: ContactRecommendationRequest): Promise<ContactRecommendationsResult> {
  const base: ContactRecommendationsResult = {
    company: input.company,
    role: input.role,
    generatedAt: new Date().toISOString(),
    contacts: [],
    warnings: [],
  };

  const queries = buildQueries(input);
  const settled = await Promise.all(queries.map((query) => searchContacts(query)));
  const ranked = new Map<string, RankedContact>();

  for (const result of settled.flat()) {
    const contact = scoreContact(result, input);
    if (!contact) continue;
    const existing = ranked.get(contact.linkedinUrl);
    if (!existing || contact.score > existing.score) ranked.set(contact.linkedinUrl, contact);
  }

  const contacts = selectDiverse([...ranked.values()].sort((a, b) => b.score - a.score || b.confidence - a.confidence));
  const warnings = contacts.length
    ? []
    : ["No confident LinkedIn contacts were found for this role yet."];

  return contactRecommendationsResultSchema.parse({
    ...base,
    contacts,
    warnings,
  });
}
