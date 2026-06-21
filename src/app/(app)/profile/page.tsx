import { Screen } from "@/components/layout";
import { getProfileOrEmpty } from "@/lib/services/profile-service";
import { requireUserId } from "@/lib/auth";
import { listFieldMemories } from "@/lib/extension/field-memory";
import { getProfileEnrichment } from "@/lib/extension/profile-enrichment";
import { ProfileScreen } from "./_components/ProfileScreen";

export const metadata = { title: "My Profile · Jobpal" };
export const dynamic = "force-dynamic";

/** Base Profile — view and edit the master resume in place, no context loss. */
export default async function ProfilePage() {
  const userId = await requireUserId();
  const [stored, enrichment, memories] = await Promise.all([
    getProfileOrEmpty(userId),
    getProfileEnrichment(userId).catch(() => null),
    listFieldMemories(userId).catch(() => []),
  ]);

  return (
    <Screen max={1080}>
      <ProfileScreen
        initialResume={stored.resume}
        initialUpdatedAt={stored.updatedAt}
        initialInsights={stored.insights}
        initialEnrichment={enrichment}
        initialCapturedCount={memories.length}
      />
    </Screen>
  );
}
