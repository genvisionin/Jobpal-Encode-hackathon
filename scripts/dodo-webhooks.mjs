/**
 * dodo-webhooks.mjs — list the account's webhook endpoints and print each
 * one's id, url, filter, and signing secret. Used to wire
 * DODO_PAYMENTS_WEBHOOK_KEY after `dodo wh listen` (or a dashboard endpoint)
 * has been created.
 *
 * Usage: DODO_PAYMENTS_API_KEY=... node scripts/dodo-webhooks.mjs
 */

import DodoPayments from "dodopayments";

const apiKey = process.env.DODO_PAYMENTS_API_KEY;
if (!apiKey) {
  console.error("Set DODO_PAYMENTS_API_KEY before running.");
  process.exit(1);
}

const client = new DodoPayments({ bearerToken: apiKey, environment: "test_mode" });

const found = [];
try {
  for await (const w of client.webhooks.list({})) {
    found.push(w);
  }
} catch (err) {
  console.error("Couldn't list webhooks:", err?.message ?? err);
  process.exit(1);
}

if (!found.length) {
  console.log("No webhook endpoints found yet.");
  process.exit(0);
}

for (const w of found) {
  let secret = "(unavailable)";
  try {
    const res = await client.webhooks.retrieveSecret(w.id);
    secret = res.secret;
  } catch {
    /* some endpoints don't expose the secret after creation */
  }
  console.log("─".repeat(60));
  console.log("id:      ", w.id);
  console.log("url:     ", w.url);
  console.log("filters: ", (w.filter_types ?? []).join(", ") || "(all events)");
  console.log("disabled:", Boolean(w.disabled));
  console.log("secret:  ", secret);
}
console.log("─".repeat(60));
