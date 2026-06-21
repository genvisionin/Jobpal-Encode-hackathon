/**
 * webhook/route.ts — Dodo Payments webhook receiver.
 *
 * Uses the official `@dodopayments/nextjs` adaptor, which verifies the
 * Standard-Webhooks signature against `DODO_PAYMENTS_WEBHOOK_KEY` before any
 * handler runs (401 on bad signature, 400 on bad payload). We only translate
 * the subscription lifecycle into our plan state via `reconcileSubscriptionEvent`.
 *
 * Subscription is the source of truth for access; we deliberately track the
 * subscription.* events (Dodo's recommended approach) rather than reacting to
 * raw payments. All handlers are idempotent.
 */

import { Webhooks } from "@dodopayments/nextjs";
import type { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { reconcileSubscriptionEvent } from "@/lib/billing/service";
import { planForProduct } from "@/lib/billing/dodo";
import type { SubscriptionStatus } from "@/lib/db/types";

export const runtime = "nodejs";

/** Narrow the parts of a Dodo subscription payload we actually use. */
interface DodoSubscriptionData {
  payload_type?: string;
  subscription_id?: string;
  product_id?: string;
  status?: string;
  customer?: { customer_id?: string };
  metadata?: Record<string, string>;
  next_billing_date?: string | Date | null;
  cancelled_at?: string | Date | null;
  expires_at?: string | Date | null;
  cancel_at_next_billing_date?: boolean;
}

/** Map a Dodo subscription status string to our SubscriptionStatus. */
function mapStatus(status: string | undefined): SubscriptionStatus {
  switch (status) {
    case "active":
      return "active";
    case "on_hold":
      return "on_hold";
    case "cancelled":
      return "cancelled";
    case "expired":
      return "expired";
    case "failed":
      return "failed";
    case "pending":
      // A pending mandate isn't active access yet; treat as on_hold.
      return "on_hold";
    default:
      return "on_hold";
  }
}

function toIso(d: string | Date | null | undefined): string | undefined {
  if (!d) return undefined;
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}

/** Shared handler for every subscription.* lifecycle event. */
async function handleSubscription(
  data: DodoSubscriptionData,
  statusOverride?: SubscriptionStatus,
): Promise<void> {
  if (!data?.subscription_id) return;
  await reconcileSubscriptionEvent({
    metadataUserId: data.metadata?.userId,
    dodoSubscriptionId: data.subscription_id,
    dodoCustomerId: data.customer?.customer_id,
    plan: planForProduct(data.product_id),
    status: statusOverride ?? mapStatus(data.status),
    currentPeriodEnd: toIso(data.expires_at) ?? toIso(data.next_billing_date),
    cancelAtPeriodEnd: Boolean(data.cancel_at_next_billing_date),
  });
}

// The adaptor passes the parsed payload to each handler. Its `data` is the
// event's data object; we read the subscription fields off it.
type Payload = { data?: DodoSubscriptionData };

/**
 * Build the signature-verifying handler lazily. The adaptor throws if the
 * webhook key is empty, so we only construct it when configured — otherwise
 * the route returns 503 (and never at module-load / build time).
 */
let handler: ((req: NextRequest) => Promise<Response>) | null = null;
function getHandler() {
  if (!env.dodo.webhookKey) return null;
  if (!handler) {
    handler = Webhooks({
      webhookKey: env.dodo.webhookKey,
      onSubscriptionActive: async (p: Payload) => handleSubscription(p.data ?? {}, "active"),
      onSubscriptionRenewed: async (p: Payload) => handleSubscription(p.data ?? {}, "active"),
      onSubscriptionUpdated: async (p: Payload) => handleSubscription(p.data ?? {}),
      onSubscriptionPlanChanged: async (p: Payload) => handleSubscription(p.data ?? {}),
      onSubscriptionOnHold: async (p: Payload) => handleSubscription(p.data ?? {}, "on_hold"),
      onSubscriptionCancelled: async (p: Payload) =>
        handleSubscription(p.data ?? {}, "cancelled"),
      onSubscriptionFailed: async (p: Payload) => handleSubscription(p.data ?? {}, "failed"),
      onSubscriptionExpired: async (p: Payload) => handleSubscription(p.data ?? {}, "expired"),
    });
  }
  return handler;
}

export async function POST(req: NextRequest) {
  const h = getHandler();
  if (!h) {
    return Response.json(
      { error: "Billing webhooks aren't configured." },
      { status: 503 },
    );
  }
  return h(req);
}
