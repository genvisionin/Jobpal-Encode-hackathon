import { Screen } from "@/components/layout";
import { requireUserId } from "@/lib/auth";
import { getEntitlements } from "@/lib/billing/service";
import { SettingsNav } from "../_components/SettingsNav";
import { BillingView } from "./_components/BillingView";
import type { BillingStatus } from "@/lib/api-client";

export const metadata = { title: "Plan & Billing · Jobpal" };
export const dynamic = "force-dynamic";

/** Plan & Billing — the subscription tiers, current plan, usage, and payment. */
export default async function BillingPage() {
  const userId = await requireUserId();
  const ent = await getEntitlements(userId);

  const billing: BillingStatus = {
    planId: ent.planId,
    status: ent.status,
    quota: ent.quota,
    used: ent.used,
    remaining: ent.remaining,
    canTailor: ent.canTailor,
    features: ent.plan.features,
    currentPeriodEnd: ent.currentPeriodEnd,
    cancelAtPeriodEnd: ent.cancelAtPeriodEnd,
    hasBillingAccount: ent.hasBillingAccount,
  };

  return (
    <Screen max={720}>
      <SettingsNav />
      <BillingView billing={billing} />
    </Screen>
  );
}
