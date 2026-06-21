import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout";
import { getCurrentUser } from "@/lib/auth";
import { getProfile } from "@/lib/services/profile-service";
import { getEntitlements } from "@/lib/billing/service";

export const dynamic = "force-dynamic";

/** Layout for all sidebar-framed, authenticated screens. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [profile, ent] = await Promise.all([
    getProfile(user.id),
    getEntitlements(user.id),
  ]);
  const contact = profile?.resume.contact;
  return (
    <AppShell
      userName={contact?.name || user.name || "Your profile"}
      userEmail={contact?.email || user.email || ""}
      usage={{ planId: ent.planId, used: ent.used, quota: ent.quota }}
    >
      {children}
    </AppShell>
  );
}
