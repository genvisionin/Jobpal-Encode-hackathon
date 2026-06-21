import { notFound, redirect } from "next/navigation";
import { getTailoredCV } from "@/lib/services/tailor-service";
import { getCurrentUser } from "@/lib/auth";
import { hasFeature } from "@/lib/billing/service";
import { CVViewer } from "./_components/CVViewer";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return { title: "Resume · Jobpal" };
  const { id } = await params;
  const cv = await getTailoredCV(id, user.id);
  return { title: cv ? `${cv.company} — ${cv.role} · Jobpal` : "Resume · Jobpal" };
}

/** Generated CV view — the tailored resume on paper with a match-insights panel. */
export default async function CVPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const cv = await getTailoredCV(id, user.id);
  if (!cv) notFound();

  // The full A–F fit analysis / match ranking is a paid feature; free users
  // see the tailored resume + a tasteful upgrade prompt instead of the scores.
  const showRanking = await hasFeature(user.id, "ranking");

  return <CVViewer cv={cv} showRanking={showRanking} />;
}
