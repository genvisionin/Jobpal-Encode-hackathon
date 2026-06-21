/**
 * keywords.ts — role/keyword matching + relevance scoring.
 *
 * Used in two places so the hard filter and the ranking agree:
 *   - `matchesQuery()`     — the inclusion gate (drops off-topic roles).
 *   - `keywordRelevance()` — 0..1 strength of the match (feeds Best-match rank).
 *
 * The matcher is TITLE-CENTRIC and PHRASE-AWARE on purpose. ATS descriptions
 * mention dozens of unrelated terms ("collaborate with design, sales,
 * finance…"), so matching on description alone is what produced the "random
 * roles" problem. And generic head-nouns ("manager", "engineer", "analyst")
 * must NOT, on their own, qualify a job for a specific multi-word query —
 * otherwise "product manager" matches "Marketing Manager". So:
 *
 *   - We first try a PHRASE match (the whole query, normalized) in the title.
 *   - Otherwise we require the SPECIFIC (non-generic) query tokens to be present
 *     in the title, and the generic ones to be present somewhere.
 *   - Synonyms (incl. multi-word like "machine learning" ↔ "ml") are expanded
 *     before matching.
 */

/** Words that carry no role meaning — dropped before matching. */
const STOP = new Set([
  "the", "and", "for", "with", "you", "our", "are", "will", "have", "this", "that",
  "a", "an", "to", "of", "in", "on", "at", "is", "as", "or", "we", "your", "role",
  "job", "position", "opportunity", "team", "remote", "hybrid", "onsite",
]);

/** Seniority words — handled by the Experience filter, not the keyword gate. */
const SENIORITY = new Set([
  "senior", "junior", "lead", "staff", "principal", "sr", "jr", "intern", "internship",
  "entry", "mid", "level", "i", "ii", "iii", "iv", "head", "director", "vp", "chief",
]);

/**
 * Generic role head-nouns. These are real role words (so they're NOT stopwords),
 * but on their own they don't make a job topical for a multi-token query — they
 * need a specific qualifier ("product" manager vs "marketing" manager).
 */
const GENERIC = new Set([
  "engineer", "engineering", "developer", "manager", "management", "analyst",
  "specialist", "associate", "consultant", "coordinator", "administrator",
  "designer", "architect", "lead", "officer", "representative", "executive",
  "scientist", "agent", "advisor", "assistant", "operator", "technician",
]);

/**
 * Synonym / abbreviation groups. Matching ANY member satisfies the others.
 * Multi-word members (e.g. "machine learning") are matched as phrases.
 */
const SYNONYM_GROUPS: string[][] = [
  ["ml", "machine learning"],
  ["ai", "artificial intelligence"],
  ["nlp", "natural language processing"],
  ["swe", "software engineer", "software engineering", "software developer"],
  ["sde", "software development engineer"],
  ["frontend", "front end", "front-end"],
  ["backend", "back end", "back-end"],
  ["fullstack", "full stack", "full-stack"],
  ["devops", "dev ops"],
  ["k8s", "kubernetes"],
  ["qa", "quality assurance"],
  ["ux", "user experience"],
  ["ui", "user interface"],
  ["pm", "product manager", "product management"],
  ["sre", "site reliability engineer", "site reliability"],
  ["bi", "business intelligence"],
];

function normalize(text: string): string {
  return ` ${text.toLowerCase().replace(/[^a-z0-9+#.\s/-]/g, " ").replace(/\s+/g, " ")} `;
}

/** All phrase variants of the query via synonym expansion (for phrase matching). */
function queryPhrases(keywords: string): string[] {
  const base = normalize(keywords).trim();
  if (!base) return [];
  const phrases = new Set<string>([base]);
  for (const group of SYNONYM_GROUPS) {
    for (const member of group) {
      if (base === member) group.forEach((alt) => phrases.add(alt));
    }
  }
  return [...phrases];
}

/** Meaningful tokens of the query: drop stopwords + seniority. */
export function coreTokens(keywords: string): string[] {
  return [
    ...new Set(
      normalize(keywords)
        .split(" ")
        .map((w) => w.trim())
        .filter((w) => w.length > 1 && !STOP.has(w) && !SENIORITY.has(w)),
    ),
  ];
}

/** Specific (non-generic) tokens — these must anchor a match in the title. */
function specificTokens(tokens: string[]): string[] {
  return tokens.filter((t) => !GENERIC.has(t));
}

/** Does `haystack` contain `token`, allowing synonym-group members to count? */
function tokenPresent(token: string, haystack: string): boolean {
  if (haystack.includes(token)) return true;
  for (const group of SYNONYM_GROUPS) {
    if (group.includes(token) && group.some((alt) => haystack.includes(alt))) return true;
  }
  return false;
}

interface MatchInput {
  title: string;
  department?: string;
  description?: string;
}

/**
 * Inclusion gate. A job matches when (any of):
 *   1. broad query (no core tokens) → always true; OR
 *   2. a query phrase (or a synonym of it) appears in the title; OR
 *   3. EVERY specific query token is present in the title (synonyms allowed),
 *      AND every generic token appears somewhere (title/dept/description).
 *
 * Rule 3 is what stops "product manager" matching "Marketing Manager":
 * "product" is specific and must be in the title, not just "manager".
 * For a query of only generic tokens (e.g. "engineer"), rule 3 falls back to
 * requiring that generic token in the title.
 */
export function matchesQuery(job: MatchInput, keywords: string): boolean {
  const core = coreTokens(keywords);
  if (core.length === 0) return true;

  const title = normalize(job.title);
  const full = normalize(`${job.title} ${job.department ?? ""} ${job.description ?? ""}`);

  // Rule 2 — phrase match in title.
  for (const phrase of queryPhrases(keywords)) {
    if (phrase && title.includes(phrase)) return true;
  }

  // Rule 3 — token-level.
  const specifics = specificTokens(core);
  const anchors = specifics.length > 0 ? specifics : core; // all-generic query → use generics
  const allAnchorsInTitle = anchors.every((t) => tokenPresent(t, title));
  if (!allAnchorsInTitle) return false;

  const generics = core.filter((t) => GENERIC.has(t));
  const allGenericsSomewhere = generics.every((t) => tokenPresent(t, full));
  return allGenericsSomewhere;
}

/**
 * Relevance strength 0..1 for ranking — phrase-in-title is strongest, then the
 * share of specific tokens in the title, then body hits. Neutral 0.5 when the
 * query has no tokens.
 */
export function keywordRelevance(job: MatchInput, keywords: string): number {
  const core = coreTokens(keywords);
  if (core.length === 0) return 0.5;

  const title = normalize(job.title);
  const body = normalize(`${job.department ?? ""} ${job.description ?? ""}`);

  // Strongest: full phrase in title.
  for (const phrase of queryPhrases(keywords)) {
    if (phrase && title.includes(phrase)) return 1;
  }

  let titleHits = 0;
  let bodyHits = 0;
  for (const t of core) {
    if (tokenPresent(t, title)) titleHits++;
    else if (tokenPresent(t, body)) bodyHits++;
  }
  const titleCoverage = titleHits / core.length;
  const bodyCoverage = bodyHits / core.length;
  return Math.min(1, titleCoverage * 0.8 + bodyCoverage * 0.2);
}
