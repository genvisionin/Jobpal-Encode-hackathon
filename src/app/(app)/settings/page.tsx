import { Screen } from "@/components/layout";
import { getCurrentUser, requireUserId } from "@/lib/auth";
import { getProfile } from "@/lib/services/profile-service";
import { getEntitlements } from "@/lib/billing/service";
import { SettingsNav } from "./_components/SettingsNav";
import { AccountForm } from "./_components/AccountForm";

export const metadata = { title: "Settings · Jobpal" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const userId = await requireUserId();
  const [user, stored, ent] = await Promise.all([
    getCurrentUser(),
    getProfile(userId),
    getEntitlements(userId),
  ]);

  const contact = stored?.resume.contact;

  return (
    <Screen max={720}>
      <SettingsNav />
      <AccountForm
        init={{
          name: contact?.name || user?.name || "",
          title: contact?.title || "",
          location: contact?.location || "",
          email: contact?.email || user?.email || "",
        }}
        plan={{ planId: ent.planId, used: ent.used, quota: ent.quota }}
      />
    </Screen>
  );
}
