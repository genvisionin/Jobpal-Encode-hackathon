/**
 * env.ts — centralized environment configuration.
 *
 * Every integration is optional. When a key is missing the app falls back
 * to a local/mock implementation so the full Customize CV flow works for
 * testing before any credentials are wired up. Each `*Configured` flag
 * lets callers branch cleanly.
 */

function get(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : undefined;
}

export const env = {
  // --- Azure AI Foundry (LLM) ---
  azure: {
    apiKey: get("AZURE_FOUNDRY_API_KEY"),
    endpoint: get("AZURE_FOUNDRY_ENDPOINT"),
    deployment: get("AZURE_FOUNDRY_DEPLOYMENT") ?? "gpt-4o",
    apiVersion: get("AZURE_FOUNDRY_API_VERSION") ?? "2024-08-01-preview",
  },

  // --- Exa (people/company web research) ---
  exa: {
    apiKey: get("EXA_API_KEY"),
  },

  // --- Supabase (DB + Auth, auth deferred for now) ---
  supabase: {
    url: get("NEXT_PUBLIC_SUPABASE_URL"),
    anonKey: get("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    serviceKey: get("SUPABASE_SERVICE_ROLE_KEY"),
  },

  // --- Cloudflare R2 (storage) ---
  r2: {
    accountId: get("R2_ACCOUNT_ID"),
    accessKeyId: get("R2_ACCESS_KEY_ID"),
    secretAccessKey: get("R2_SECRET_ACCESS_KEY"),
    bucket: get("R2_BUCKET"),
    endpoint: get("R2_ENDPOINT"),
  },

  // --- Google OAuth (Gmail tracker) ---
  google: {
    clientId: get("GOOGLE_CLIENT_ID"),
    clientSecret: get("GOOGLE_CLIENT_SECRET"),
    /** OAuth redirect; defaults to the app's callback route. */
    redirectUri: get("GOOGLE_REDIRECT_URI"),
  },

  // --- Dodo Payments (subscriptions) ---
  dodo: {
    apiKey: get("DODO_PAYMENTS_API_KEY"),
    webhookKey: get("DODO_PAYMENTS_WEBHOOK_KEY"),
    /** "test_mode" | "live_mode" — defaults to test_mode when a key is set. */
    environment: get("DODO_PAYMENTS_ENVIRONMENT") ?? "test_mode",
    /** Where Dodo redirects after a completed checkout. */
    returnUrl: get("DODO_PAYMENTS_RETURN_URL"),
    /** Dodo product ids for each paid plan's subscription product. */
    products: {
      pro: get("DODO_PRODUCT_PRO"),
      premium: get("DODO_PRODUCT_PREMIUM"),
    },
  },

  // --- App ---
  app: {
    /** Public base URL, used to build OAuth redirect + cron links. */
    baseUrl: get("NEXT_PUBLIC_APP_URL") ?? "http://localhost:3000",
    /** Deployed Chrome extension origin, e.g. chrome-extension://abcdefghijklmnop. */
    extensionOrigin: get("CHROME_EXTENSION_ORIGIN"),
    /** Shared secret guarding the cron endpoint. */
    cronSecret: get("CRON_SECRET"),
  },
} as const;

export const isAzureConfigured = Boolean(env.azure.apiKey && env.azure.endpoint);
export const isExaConfigured = Boolean(env.exa.apiKey);
/** DB persistence (service role) is available. */
export const isSupabaseConfigured = Boolean(env.supabase.url && env.supabase.serviceKey);
/** Browser auth (anon key) is available — gates the real sign-in flow. */
export const isAuthConfigured = Boolean(env.supabase.url && env.supabase.anonKey);
export const isR2Configured = Boolean(
  env.r2.accountId && env.r2.accessKeyId && env.r2.secretAccessKey && env.r2.bucket,
);
export const isGoogleConfigured = Boolean(env.google.clientId && env.google.clientSecret);
/**
 * Dodo Payments is configured when we have an API key + at least one paid
 * product id. Without it, billing runs in a local "simulate" mode so the full
 * plan/quota UX is testable before credentials are wired up (mirrors how the
 * LLM/Gmail integrations fall back to mocks).
 */
export const isDodoConfigured = Boolean(
  env.dodo.apiKey && (env.dodo.products.pro || env.dodo.products.premium),
);
/**
 * Local dev fallback user id, used ONLY when auth is not configured
 * (no anon key). With Supabase auth on, every request resolves the real
 * authenticated user id instead. Never used in production with auth enabled.
 */
export const DEMO_USER_ID = "local-dev-user";
