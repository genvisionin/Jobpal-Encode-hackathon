import Link from "next/link";
import { Suspense } from "react";
import { Icon, FadeIn, Stagger, StaggerItem } from "@/components/ui";
import { Screen } from "@/components/layout";
import { listTailoredCVs } from "@/lib/services/tailor-service";
import { requireUserId } from "@/lib/auth";
import { InputConsole } from "./_components/InputConsole";
import { GeneratedCVCard } from "./_components/GeneratedCVCard";

export const metadata = { title: "Customize CV · Jobpal" };
export const dynamic = "force-dynamic";

/**
 * Customize CV — paste a job description or link, pick a template, and
 * generate a resume tailored to the role. Recent tailored CVs below.
 */
export default async function CustomizePage() {
  const userId = await requireUserId();
  const cvs = await listTailoredCVs(userId);

  return (
    <Screen max={960}>
      <div style={{ textAlign: "center", maxWidth: 640, margin: "0 auto 0" }}>
        <FadeIn>
          <h1 style={{ fontSize: 38, lineHeight: 1.1, letterSpacing: "-0.03em", fontWeight: 800 }}>
            Tailor a resume to any job
          </h1>
        </FadeIn>
        <FadeIn delay={0.06}>
          <p style={{ fontSize: 15.5, color: "var(--ink-2)", marginTop: 10, maxWidth: 480, marginInline: "auto" }}>
            Paste a job description or drop a link. We rewrite your profile to match the role.
          </p>
        </FadeIn>
      </div>

      <FadeIn delay={0.14} style={{ width: "100%", margin: "24px auto 0" }}>
        <Suspense fallback={null}>
          <InputConsole />
        </Suspense>
      </FadeIn>

      {cvs.length > 0 && (
        <div style={{ width: "100%", margin: "36px auto 0" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 16,
            }}
          >
            <h2 style={{ fontSize: 18, fontWeight: 600 }}>Recent resumes</h2>
            <Link href="/resumes" className="btn btn-ghost btn-sm">
              View all <Icon name="arrow" size={15} />
            </Link>
          </div>
          <Stagger
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
              gap: 18,
            }}
          >
            {cvs.slice(0, 6).map((cv) => (
              <StaggerItem key={cv.id}>
                <GeneratedCVCard cv={cv} />
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      )}
    </Screen>
  );
}
