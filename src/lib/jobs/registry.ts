/**
 * registry.ts — the tracked-company board registry (server-only).
 *
 * Equivalent of career-ops `portals.yml` → `tracked_companies`, but every entry
 * here was verified to return live postings from its ATS public API. Each board
 * is one company on one platform; the aggregator fans out across the relevant
 * subset per search and normalizes results into the feed.
 *
 * Region/industry tags let the aggregator bias board selection toward the user's
 * country and keywords so we don't hammer all ~120 boards on every query.
 *
 * To add coverage: confirm the slug returns jobs from its platform API, then add
 * a row. Slugs are case-sensitive on some platforms (Ashby, SmartRecruiters).
 */

export type Region = "us" | "uk" | "eu" | "ca" | "global";

export type Industry =
  | "ai"
  | "fintech"
  | "devtools"
  | "saas"
  | "data"
  | "healthtech"
  | "ecommerce"
  | "consumer"
  | "gaming"
  | "media"
  | "security"
  | "hardware"
  | "enterprise"
  | "logistics"
  | "edtech";

export interface CompanyBoard {
  company: string;
  platform: "greenhouse" | "lever" | "ashby" | "workable" | "smartrecruiters";
  slug: string;
  regions: Region[];
  industries: Industry[];
}

export const COMPANY_BOARDS: CompanyBoard[] = [
  // ── AI labs & frontier models ─────────────────────────────────────────
  { company: "Anthropic", platform: "greenhouse", slug: "anthropic", regions: ["us", "uk"], industries: ["ai"] },
  { company: "Cohere", platform: "ashby", slug: "cohere", regions: ["us", "ca", "uk"], industries: ["ai"] },
  { company: "Perplexity", platform: "ashby", slug: "perplexity", regions: ["us"], industries: ["ai"] },
  { company: "Mistral AI", platform: "lever", slug: "mistral", regions: ["eu", "us", "uk"], industries: ["ai"] },
  { company: "Aleph Alpha", platform: "ashby", slug: "AlephAlpha", regions: ["eu"], industries: ["ai"] },
  { company: "DeepL", platform: "ashby", slug: "DeepL", regions: ["eu"], industries: ["ai", "saas"] },
  { company: "Black Forest Labs", platform: "greenhouse", slug: "blackforestlabs", regions: ["eu", "us"], industries: ["ai"] },
  { company: "Stability AI", platform: "greenhouse", slug: "stabilityai", regions: ["uk", "us"], industries: ["ai"] },
  { company: "Runway", platform: "ashby", slug: "runwayml", regions: ["us"], industries: ["ai", "media"] },
  { company: "Hume AI", platform: "greenhouse", slug: "humeai", regions: ["us"], industries: ["ai"] },

  // ── Voice / conversational AI ─────────────────────────────────────────
  { company: "ElevenLabs", platform: "ashby", slug: "elevenlabs", regions: ["us", "uk"], industries: ["ai"] },
  { company: "Deepgram", platform: "ashby", slug: "deepgram", regions: ["us"], industries: ["ai"] },
  { company: "Vapi", platform: "ashby", slug: "vapi", regions: ["us"], industries: ["ai", "devtools"] },
  { company: "Bland AI", platform: "ashby", slug: "bland", regions: ["us"], industries: ["ai"] },
  { company: "PolyAI", platform: "greenhouse", slug: "polyai", regions: ["uk", "us"], industries: ["ai"] },
  { company: "Parloa", platform: "greenhouse", slug: "parloa", regions: ["eu", "us"], industries: ["ai"] },
  { company: "Sierra", platform: "ashby", slug: "sierra", regions: ["us"], industries: ["ai"] },
  { company: "Decagon", platform: "ashby", slug: "decagon", regions: ["us"], industries: ["ai"] },
  { company: "Speechmatics", platform: "greenhouse", slug: "speechmatics", regions: ["uk"], industries: ["ai"] },

  // ── AI infra / LLMOps / dev tools ─────────────────────────────────────
  { company: "LangChain", platform: "ashby", slug: "langchain", regions: ["us"], industries: ["ai", "devtools"] },
  { company: "Pinecone", platform: "ashby", slug: "pinecone", regions: ["us"], industries: ["ai", "data"] },
  { company: "Baseten", platform: "ashby", slug: "baseten", regions: ["us"], industries: ["ai", "devtools"] },
  { company: "Replit", platform: "ashby", slug: "replit", regions: ["us"], industries: ["devtools", "ai"] },
  { company: "PostHog", platform: "ashby", slug: "posthog", regions: ["us", "uk"], industries: ["devtools", "data"] },
  { company: "Supabase", platform: "ashby", slug: "supabase", regions: ["global"], industries: ["devtools"] },
  { company: "Resend", platform: "ashby", slug: "resend", regions: ["global"], industries: ["devtools"] },
  { company: "Inngest", platform: "ashby", slug: "inngest", regions: ["us"], industries: ["devtools"] },
  { company: "WorkOS", platform: "ashby", slug: "workos", regions: ["us"], industries: ["devtools", "security"] },
  { company: "Arize AI", platform: "greenhouse", slug: "arizeai", regions: ["us"], industries: ["ai", "data"] },
  { company: "RunPod", platform: "greenhouse", slug: "runpod", regions: ["us"], industries: ["ai", "devtools"] },
  { company: "CoreWeave", platform: "greenhouse", slug: "coreweave", regions: ["us"], industries: ["ai", "hardware"] },
  { company: "Glean", platform: "greenhouse", slug: "gleanwork", regions: ["us"], industries: ["ai", "enterprise"] },
  { company: "Vercel", platform: "greenhouse", slug: "vercel", regions: ["us"], industries: ["devtools"] },
  { company: "PlanetScale", platform: "greenhouse", slug: "planetscale", regions: ["us"], industries: ["devtools", "data"] },
  { company: "Hightouch", platform: "greenhouse", slug: "hightouch", regions: ["us"], industries: ["data", "saas"] },
  { company: "Cloudflare", platform: "greenhouse", slug: "cloudflare", regions: ["us", "uk"], industries: ["devtools", "security"] },
  { company: "Elastic", platform: "greenhouse", slug: "elastic", regions: ["global"], industries: ["devtools", "data"] },
  { company: "GitLab", platform: "greenhouse", slug: "gitlab", regions: ["global"], industries: ["devtools"] },
  { company: "MongoDB", platform: "greenhouse", slug: "mongodb", regions: ["global"], industries: ["data", "devtools"] },
  { company: "Datadog", platform: "greenhouse", slug: "datadog", regions: ["global"], industries: ["devtools", "data"] },

  // ── AI-native apps / automation ───────────────────────────────────────
  { company: "Notion", platform: "ashby", slug: "notion", regions: ["us"], industries: ["saas"] },
  { company: "Linear", platform: "ashby", slug: "linear", regions: ["global"], industries: ["saas", "devtools"] },
  { company: "Ramp", platform: "ashby", slug: "ramp", regions: ["us"], industries: ["fintech"] },
  { company: "Vanta", platform: "ashby", slug: "vanta", regions: ["us"], industries: ["security", "saas"] },
  { company: "Deel", platform: "ashby", slug: "deel", regions: ["global"], industries: ["saas", "fintech"] },
  { company: "Attio", platform: "ashby", slug: "attio", regions: ["uk", "eu"], industries: ["saas"] },
  { company: "Clay", platform: "ashby", slug: "claylabs", regions: ["us"], industries: ["saas", "ai"] },
  { company: "Lovable", platform: "ashby", slug: "lovable", regions: ["eu"], industries: ["ai", "devtools"] },
  { company: "Legora", platform: "ashby", slug: "legora", regions: ["eu", "us", "uk"], industries: ["ai", "saas"] },
  { company: "n8n", platform: "ashby", slug: "n8n", regions: ["eu", "us"], industries: ["devtools", "saas"] },
  { company: "Zapier", platform: "ashby", slug: "zapier", regions: ["global"], industries: ["saas"] },
  { company: "Photoroom", platform: "ashby", slug: "photoroom", regions: ["eu"], industries: ["ai", "consumer"] },
  { company: "Airtable", platform: "greenhouse", slug: "airtable", regions: ["us"], industries: ["saas"] },
  { company: "Intercom", platform: "greenhouse", slug: "intercom", regions: ["eu", "us"], industries: ["saas", "ai"] },
  { company: "Asana", platform: "greenhouse", slug: "asana", regions: ["global"], industries: ["saas"] },
  { company: "Contentful", platform: "greenhouse", slug: "contentful", regions: ["eu", "us"], industries: ["saas", "devtools"] },
  { company: "Boomi", platform: "greenhouse", slug: "boomilp", regions: ["us"], industries: ["saas", "enterprise"] },
  { company: "Hootsuite", platform: "greenhouse", slug: "hootsuite", regions: ["ca"], industries: ["saas", "media"] },
  { company: "Klue", platform: "ashby", slug: "klue", regions: ["ca"], industries: ["saas"] },
  { company: "HuggingFace", platform: "workable", slug: "huggingface", regions: ["eu", "us"], industries: ["ai", "devtools"] },

  // ── Fintech ───────────────────────────────────────────────────────────
  { company: "Stripe", platform: "greenhouse", slug: "stripe", regions: ["us", "uk", "eu"], industries: ["fintech"] },
  { company: "Brex", platform: "greenhouse", slug: "brex", regions: ["us"], industries: ["fintech"] },
  { company: "Affirm", platform: "greenhouse", slug: "affirm", regions: ["us"], industries: ["fintech"] },
  { company: "Chime", platform: "greenhouse", slug: "chime", regions: ["us"], industries: ["fintech"] },
  { company: "SoFi", platform: "greenhouse", slug: "sofi", regions: ["us"], industries: ["fintech"] },
  { company: "Marqeta", platform: "greenhouse", slug: "marqeta", regions: ["us"], industries: ["fintech"] },
  { company: "Monzo", platform: "greenhouse", slug: "monzo", regions: ["uk"], industries: ["fintech"] },
  { company: "GoCardless", platform: "greenhouse", slug: "gocardless", regions: ["uk", "eu"], industries: ["fintech"] },
  { company: "Cleo", platform: "greenhouse", slug: "cleo", regions: ["uk"], industries: ["fintech", "ai"] },
  { company: "Lendable", platform: "ashby", slug: "lendable", regions: ["uk"], industries: ["fintech"] },
  { company: "N26", platform: "greenhouse", slug: "n26", regions: ["eu"], industries: ["fintech"] },
  { company: "Trade Republic", platform: "greenhouse", slug: "traderepublicbank", regions: ["eu", "uk"], industries: ["fintech"] },
  { company: "SumUp", platform: "greenhouse", slug: "sumup", regions: ["eu", "uk"], industries: ["fintech"] },
  { company: "Qonto", platform: "lever", slug: "qonto", regions: ["eu"], industries: ["fintech"] },
  { company: "Pigment", platform: "lever", slug: "pigment", regions: ["eu", "us", "uk"], industries: ["fintech", "saas"] },
  { company: "Oscar Health", platform: "greenhouse", slug: "oscar", regions: ["us"], industries: ["healthtech", "fintech"] },
  { company: "Visa", platform: "smartrecruiters", slug: "Visa", regions: ["global"], industries: ["fintech", "enterprise"] },
  { company: "Experian", platform: "smartrecruiters", slug: "Experian", regions: ["uk", "us", "global"], industries: ["fintech", "data", "enterprise"] },

  // ── Data / ML platforms ───────────────────────────────────────────────
  { company: "Databricks", platform: "greenhouse", slug: "databricks", regions: ["global"], industries: ["data", "ai"] },
  { company: "Amplemarket", platform: "greenhouse", slug: "amplemarket", regions: ["eu", "us"], industries: ["ai", "saas"] },
  { company: "Quantexa", platform: "ashby", slug: "quantexa", regions: ["uk"], industries: ["data", "ai", "fintech"] },
  { company: "Beamery", platform: "ashby", slug: "beamery", regions: ["uk", "us"], industries: ["ai", "saas"] },
  { company: "Celonis", platform: "greenhouse", slug: "celonis", regions: ["eu", "us"], industries: ["data", "enterprise", "ai"] },

  // ── Security ──────────────────────────────────────────────────────────
  { company: "Lakera", platform: "ashby", slug: "lakera.ai", regions: ["eu", "us"], industries: ["security", "ai"] },

  // ── Healthtech / biotech ──────────────────────────────────────────────
  { company: "Isomorphic Labs", platform: "greenhouse", slug: "isomorphiclabs", regions: ["uk", "us"], industries: ["healthtech", "ai"] },
  { company: "Causaly", platform: "ashby", slug: "causaly", regions: ["uk", "eu"], industries: ["healthtech", "ai"] },
  { company: "Cradle", platform: "ashby", slug: "cradlebio", regions: ["eu"], industries: ["healthtech", "ai"] },
  { company: "Flatiron Health", platform: "greenhouse", slug: "flatironhealth", regions: ["us"], industries: ["healthtech"] },
  { company: "Komodo Health", platform: "greenhouse", slug: "komodohealth", regions: ["us"], industries: ["healthtech", "data"] },

  // ── Hardware / deep tech ──────────────────────────────────────────────
  { company: "Graphcore", platform: "greenhouse", slug: "graphcore", regions: ["uk"], industries: ["hardware", "ai"] },
  { company: "Wayve", platform: "greenhouse", slug: "wayve", regions: ["uk", "us"], industries: ["hardware", "ai"] },
  { company: "Helsing", platform: "greenhouse", slug: "helsing", regions: ["eu", "uk"], industries: ["hardware", "ai"] },
  { company: "PhysicsX", platform: "greenhouse", slug: "physicsx", regions: ["uk"], industries: ["hardware", "ai"] },
  { company: "Scandit", platform: "greenhouse", slug: "scandit", regions: ["eu"], industries: ["hardware", "ai"] },
  { company: "Samsara", platform: "greenhouse", slug: "samsara", regions: ["us"], industries: ["hardware", "logistics"] },
  { company: "Bosch", platform: "smartrecruiters", slug: "BoschGroup", regions: ["eu", "global"], industries: ["hardware", "enterprise"] },

  // ── Consumer / ecommerce / marketplaces ───────────────────────────────
  { company: "Airbnb", platform: "greenhouse", slug: "airbnb", regions: ["us"], industries: ["consumer", "ecommerce"] },
  { company: "Figma", platform: "greenhouse", slug: "figma", regions: ["us"], industries: ["saas", "devtools"] },
  { company: "Pinterest", platform: "greenhouse", slug: "pinterest", regions: ["us"], industries: ["consumer", "media"] },
  { company: "Reddit", platform: "greenhouse", slug: "reddit", regions: ["us"], industries: ["consumer", "media"] },
  { company: "Lyft", platform: "greenhouse", slug: "lyft", regions: ["us"], industries: ["consumer", "logistics"] },
  { company: "Instacart", platform: "greenhouse", slug: "instacart", regions: ["us"], industries: ["ecommerce", "consumer"] },
  { company: "Dropbox", platform: "greenhouse", slug: "dropbox", regions: ["us"], industries: ["saas"] },
  { company: "Squarespace", platform: "greenhouse", slug: "squarespace", regions: ["us"], industries: ["saas", "ecommerce"] },
  { company: "Webflow", platform: "greenhouse", slug: "webflow", regions: ["us"], industries: ["saas", "devtools"] },
  { company: "Faire", platform: "greenhouse", slug: "faire", regions: ["us"], industries: ["ecommerce"] },
  { company: "Toast", platform: "greenhouse", slug: "toast", regions: ["us"], industries: ["saas", "fintech"] },
  { company: "Gusto", platform: "greenhouse", slug: "gusto", regions: ["us"], industries: ["saas", "fintech"] },
  { company: "Peloton", platform: "greenhouse", slug: "peloton", regions: ["us"], industries: ["consumer"] },
  { company: "Sweetgreen", platform: "greenhouse", slug: "sweetgreen", regions: ["us"], industries: ["consumer"] },
  { company: "The Farmer's Dog", platform: "greenhouse", slug: "thefarmersdog", regions: ["us"], industries: ["consumer", "ecommerce"] },
  { company: "Glossier", platform: "greenhouse", slug: "glossier", regions: ["us"], industries: ["consumer", "ecommerce"] },
  { company: "GetYourGuide", platform: "greenhouse", slug: "getyourguide", regions: ["eu"], industries: ["consumer", "ecommerce"] },
  { company: "HelloFresh", platform: "greenhouse", slug: "hellofresh", regions: ["eu", "us"], industries: ["consumer", "ecommerce"] },
  { company: "Flexport", platform: "greenhouse", slug: "flexport", regions: ["us"], industries: ["logistics"] },
  { company: "Spotify", platform: "lever", slug: "spotify", regions: ["eu", "us", "uk"], industries: ["media", "consumer"] },
  { company: "Nubank", platform: "greenhouse", slug: "nubank", regions: ["global"], industries: ["fintech", "consumer"] },

  // ── Gaming / media / edtech ───────────────────────────────────────────
  { company: "Riot Games", platform: "greenhouse", slug: "riotgames", regions: ["us"], industries: ["gaming"] },
  { company: "Roblox", platform: "greenhouse", slug: "roblox", regions: ["us"], industries: ["gaming"] },
  { company: "Epic Games", platform: "greenhouse", slug: "epicgames", regions: ["us"], industries: ["gaming"] },
  { company: "Discord", platform: "greenhouse", slug: "discord", regions: ["us"], industries: ["gaming", "consumer"] },
  { company: "Twitch", platform: "greenhouse", slug: "twitch", regions: ["us"], industries: ["media", "gaming"] },
  { company: "Crunchyroll", platform: "greenhouse", slug: "crunchyroll", regions: ["us"], industries: ["media"] },
  { company: "Duolingo", platform: "greenhouse", slug: "duolingo", regions: ["us"], industries: ["edtech", "consumer"] },
  { company: "Udemy", platform: "greenhouse", slug: "udemy", regions: ["us"], industries: ["edtech"] },

  // ── Enterprise / pharma / cross-industry (SmartRecruiters) ────────────
  { company: "Veeva Systems", platform: "lever", slug: "veeva", regions: ["us", "eu"], industries: ["enterprise", "healthtech", "saas"] },
  { company: "Palantir", platform: "lever", slug: "palantir", regions: ["us", "uk"], industries: ["enterprise", "data", "ai"] },
  { company: "Faculty", platform: "ashby", slug: "faculty", regions: ["uk"], industries: ["ai", "enterprise"] },
  { company: "Synthesia", platform: "ashby", slug: "synthesia", regions: ["uk", "us"], industries: ["ai", "media"] },
  { company: "Later", platform: "greenhouse", slug: "later", regions: ["ca"], industries: ["saas", "media"] },
  { company: "Safari AI", platform: "greenhouse", slug: "safariai", regions: ["us", "ca"], industries: ["ai", "hardware"] },
  { company: "Glacis AI", platform: "ashby", slug: "glacis-ai", regions: ["global"], industries: ["ai", "logistics"] },
  { company: "Semios", platform: "workable", slug: "semios", regions: ["ca"], industries: ["hardware", "logistics"] },

  // ── Broad / high-volume / cross-function employers (added for coverage) ──
  { company: "Adyen", platform: "greenhouse", slug: "adyen", regions: ["eu", "uk", "us"], industries: ["fintech", "enterprise"] },
  { company: "Calendly", platform: "greenhouse", slug: "calendly", regions: ["us"], industries: ["saas"] },
  { company: "CircleCI", platform: "greenhouse", slug: "circleci", regions: ["us"], industries: ["devtools"] },
  { company: "Sumo Logic", platform: "greenhouse", slug: "sumologic", regions: ["us"], industries: ["devtools", "security", "data"] },
  { company: "Mercury", platform: "ashby", slug: "mercury", regions: ["us"], industries: ["fintech"] },
  { company: "Harvey", platform: "ashby", slug: "harvey", regions: ["us", "uk"], industries: ["ai", "saas"] },
  { company: "Writer", platform: "ashby", slug: "writer", regions: ["us"], industries: ["ai", "saas"] },
  { company: "Character.AI", platform: "ashby", slug: "character", regions: ["us"], industries: ["ai", "consumer"] },
  { company: "Multiverse", platform: "ashby", slug: "multiverse", regions: ["uk", "us"], industries: ["edtech", "ai"] },
  { company: "Sodexo", platform: "smartrecruiters", slug: "Sodexo", regions: ["global", "uk", "eu"], industries: ["enterprise", "consumer"] },
];

/** Distinct platforms represented (for diagnostics / UI copy). */
export function registryPlatforms(): string[] {
  return [...new Set(COMPANY_BOARDS.map((b) => b.platform))];
}
