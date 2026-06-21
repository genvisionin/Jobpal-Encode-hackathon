import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getStore } from "@/lib/db/store";
import { getInterviewPrep } from "@/lib/services/interview-prep-service";
import { InterviewPrepView } from "./_components/InterviewPrepView";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return { title: "Interview prep · Jobpal" };
  const { id } = await params;
  const store = await getStore();
  const apps = await store.listApplications(user.id);
  const app = apps.find((a) => a.id === id);
  return {
    title: app ? `Prep · ${app.role} at ${app.company} · Jobpal` : "Interview prep · Jobpal",
  };
}

/**
 * Interview prep — a full-bleed page for ONE booked interview. We resolve the
 * application server-side, pass any already-generated pack as initial data,
 * and let the client view generate it on first visit (deep-research LLM pass).
 */
export default async function InterviewPrepPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const store = await getStore();
  const apps = await store.listApplications(user.id);
  const app = apps.find((a) => a.id === id);
  if (!app) notFound();

  const stored = await getInterviewPrep(id, user.id);

  return (
    <InterviewPrepView
      applicationId={id}
      company={app.company}
      role={app.role}
      initialPrep={stored?.prep ?? null}
      initialSource={stored?.source ?? null}
    />
  );
}
