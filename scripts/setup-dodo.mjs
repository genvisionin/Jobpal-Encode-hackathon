/**
 * setup-dodo.mjs — one-time provisioning of the two paid subscription products
 * in Dodo Payments (Pro $9.99/mo, Premium $19.99/mo).
 *
 * Idempotent-ish: it lists existing products first and reuses any whose name
 * matches, so re-running won't create duplicates. Prints the product ids to
 * paste into .env.local (DODO_PRODUCT_PRO / DODO_PRODUCT_PREMIUM).
 *
 * Usage:
 *   DODO_PAYMENTS_API_KEY=... node scripts/setup-dodo.mjs
 */

import DodoPayments from "dodopayments";

const apiKey = process.env.DODO_PAYMENTS_API_KEY;
if (!apiKey) {
  console.error("Set DODO_PAYMENTS_API_KEY before running.");
  process.exit(1);
}

const client = new DodoPayments({ bearerToken: apiKey, environment: "test_mode" });

/** The plans we sell, matching src/lib/billing/plans.ts. Price in cents. */
const PLANS = [
  { key: "pro", name: "Jobpal Pro", priceCents: 999, description: "30 tailored CVs/month, match ranking, automatic Gmail application tracking, and priority job alerts." },
  { key: "premium", name: "Jobpal Premium", priceCents: 1999, description: "70 tailored CVs/month plus everything in Pro." },
];

function recurringPrice(priceCents) {
  return {
    type: "recurring_price",
    currency: "USD",
    price: priceCents,
    discount: 0,
    purchasing_power_parity: false,
    payment_frequency_count: 1,
    payment_frequency_interval: "Month",
    subscription_period_count: 1,
    subscription_period_interval: "Month",
    tax_inclusive: false,
    trial_period_days: 0,
  };
}

async function findExisting(name) {
  // Auto-paginate via the SDK's async iterator.
  try {
    for await (const p of client.products.list({ page_size: 100 })) {
      if ((p.name ?? "").trim() === name) return p.product_id ?? p.id;
    }
  } catch (err) {
    console.warn(`  (couldn't list existing products: ${err?.message ?? err})`);
  }
  return null;
}

async function ensureProduct(plan) {
  const existingId = await findExisting(plan.name).catch(() => null);
  if (existingId) {
    console.log(`• ${plan.name}: reusing existing ${existingId}`);
    return { key: plan.key, id: existingId };
  }
  const created = await client.products.create({
    name: plan.name,
    description: plan.description,
    tax_category: "saas",
    price: recurringPrice(plan.priceCents),
  });
  const id = created.product_id ?? created.id;
  console.log(`• ${plan.name}: created ${id}`);
  return { key: plan.key, id };
}

const results = {};
for (const plan of PLANS) {
  const { key, id } = await ensureProduct(plan);
  results[key] = id;
}

console.log("\n=== Product ids ===");
console.log(`DODO_PRODUCT_PRO=${results.pro ?? ""}`);
console.log(`DODO_PRODUCT_PREMIUM=${results.premium ?? ""}`);
