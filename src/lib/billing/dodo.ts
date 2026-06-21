/**
 * dodo.ts — SERVER-ONLY Dodo Payments client wrapper.
 *
 * Centralizes every Dodo interaction so the rest of the app never imports the
 * SDK directly:
 *   • `createCheckoutSession` — hosted checkout for a plan's subscription product
 *   • `createPortalSession`   — the customer self-service billing portal
 *   • `planForProduct`        — map a Dodo product id back to our PlanId
 *
 * Like the LLM/Gmail layers, this runs with NO config: when Dodo isn't
 * configured (`isDodoConfigured` false) the checkout falls back to a local
 * "simulate" URL so the full upgrade → welcome flow is testable before
 * credentials are wired up. Real Dodo switches on automatically once the API
 * key + product ids are present.
 */

import "server-only";
import DodoPayments from "dodopayments";
import { env, isDodoConfigured } from "@/lib/env";
import { PLANS, type PlanId } from "./plans";

/** Lazily-built singleton SDK client (only when configured). */
let client: DodoPayments | null = null;
function getClient(): DodoPayments {
  if (!client) {
    client = new DodoPayments({
      bearerToken: env.dodo.apiKey,
      environment: env.dodo.environment === "live_mode" ? "live_mode" : "test_mode",
    });
  }
  return client;
}

/** The configured Dodo product id for a paid plan, if any. */
export function productIdForPlan(plan: PlanId): string | undefined {
  if (plan === "pro") return env.dodo.products.pro;
  if (plan === "premium") return env.dodo.products.premium;
  return undefined;
}

/** Reverse map: which plan does a Dodo product id correspond to? */
export function planForProduct(productId: string | undefined | null): PlanId | null {
  if (!productId) return null;
  if (productId === env.dodo.products.pro) return "pro";
  if (productId === env.dodo.products.premium) return "premium";
  return null;
}

export interface CheckoutInput {
  plan: PlanId;
  userId: string;
  email: string;
  name?: string;
  /** Existing Dodo customer id, to reuse the same customer across upgrades. */
  customerId?: string;
  /** Where Dodo returns the user after checkout. */
  returnUrl: string;
}

export interface CheckoutResult {
  checkoutUrl: string;
  /** True when this is the local dev simulation (Dodo not configured). */
  simulated: boolean;
}

/**
 * Create a hosted checkout session for a plan's subscription product. We pass
 * `userId` in `metadata` so the webhook can attach the resulting subscription
 * to the right account regardless of email.
 */
export async function createCheckoutSession(input: CheckoutInput): Promise<CheckoutResult> {
  const productId = productIdForPlan(input.plan);

  // No config (or no product id for this plan) → simulate so the UX is
  // testable locally. The simulate route applies the plan and redirects to
  // the welcome screen, mirroring a completed real checkout.
  if (!isDodoConfigured || !productId) {
    const url = `/api/billing/simulate?plan=${input.plan}`;
    return { checkoutUrl: url, simulated: true };
  }

  const session = await getClient().checkoutSessions.create({
    product_cart: [{ product_id: productId, quantity: 1 }],
    customer: input.customerId
      ? { customer_id: input.customerId }
      : { email: input.email, name: input.name || input.email },
    metadata: { userId: input.userId, plan: input.plan },
    return_url: input.returnUrl,
  });

  if (!session.checkout_url) {
    throw new Error("Dodo checkout session did not return a checkout URL.");
  }
  return { checkoutUrl: session.checkout_url, simulated: false };
}

/**
 * Create a customer-portal session so the user can manage their card, view
 * invoices, or cancel. Requires a Dodo customer id.
 */
export async function createPortalSession(customerId: string): Promise<string | null> {
  if (!isDodoConfigured) return null;
  const session = await getClient().customers.customerPortal.create(customerId);
  return session.link ?? null;
}

/** True when a plan has a real Dodo product configured (vs. simulate-only). */
export function planIsPurchasable(plan: PlanId): boolean {
  return isDodoConfigured && Boolean(productIdForPlan(plan)) && plan in PLANS;
}
