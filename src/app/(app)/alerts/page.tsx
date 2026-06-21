import { getProfile } from "@/lib/services/profile-service";
import { requireUserId } from "@/lib/auth";
import { AlertsView } from "./_components/AlertsView";

export const metadata = { title: "Job Alerts · Jobpal" };
export const dynamic = "force-dynamic";

/**
 * Derive a sensible starting search from the user's own profile — their job
 * title, else their top role archetype. Empty when we have nothing yet, so the
 * feed opens on a broad search rather than someone else's role.
 */
function defaultKeywords(title?: string, archetype?: string): string {
  return (title || archetype || "").trim();
}

/** Job Alerts — filtered, profile-matched postings with a fresh-jobs toggle. */
export default async function AlertsPage() {
  const userId = await requireUserId();
  const profile = await getProfile(userId).catch(() => null);
  const initialKeywords = defaultKeywords(
    profile?.resume.contact.title,
    profile?.insights?.archetypes?.[0]?.name,
  );

  return <AlertsView initialKeywords={initialKeywords} />;
}
