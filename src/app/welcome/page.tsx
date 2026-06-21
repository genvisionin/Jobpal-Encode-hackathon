import { redirect } from "next/navigation";
import { Aurora } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { getEntitlements } from "@/lib/billing/service";
import { getPlan, type PlanId } from "@/lib/billing/plans";
import { WelcomeCard } from "./_components/WelcomeCard";

export const metadata = { title: "Welcome to Jobpal" };
export const dynamic = "force-dynamic";

/**
 * /welcome — the post-checkout celebration. Dodo (or the local simulate path)
 * redirects here after a completed upgrade. We read the user's REAL resolved
 * plan from entitlements (not just the query param) so this only ever
 * celebrates a plan the user actually holds.
 */
export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const ent = await getEntitlements(user.id);
  const { plan: planParam } = await searchParams;

  // Prefer the actually-resolved plan; fall back to the hinted query param.
  const planId: PlanId = ent.planId !== "free" ? ent.planId : (getPlan(planParam).id as PlanId);
  const plan = getPlan(planId);

  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <Aurora />
      <div
        className="flow-screen"
        style={{
          position: "relative",
          zIndex: 2,
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 40,
          overflowY: "auto",
        }}
      >
        <WelcomeCard
          planName={plan.name}
          planId={planId}
          quota={ent.quota}
          features={plan.features}
          firstName={(user.name || "").split(/\s+/)[0] || ""}
          isFree={planId === "free"}
        />
      </div>
    </div>
  );
}
