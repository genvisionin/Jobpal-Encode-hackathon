import { redirect } from "next/navigation";
import { Aurora } from "@/components/ui";
import { getProfileOrEmpty } from "@/lib/services/profile-service";
import { getCurrentUser } from "@/lib/auth";
import { BuilderView } from "./_components/BuilderView";

export const metadata = { title: "Build your resume · Jobpal" };
export const dynamic = "force-dynamic";

/** Resume Builder — the onboarding "build from scratch" path, sharing the
 * same editor as the in-place profile editor. */
export default async function BuilderPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const stored = await getProfileOrEmpty(user.id);

  return (
    <div style={{ position: "fixed", inset: 0, overflowY: "auto" }}>
      <Aurora />
      <BuilderView initial={stored.resume} />
    </div>
  );
}
