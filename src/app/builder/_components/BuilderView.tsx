"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Logo, Icon } from "@/components/ui";
import { ResumeEditor } from "@/components/resume";
import type { ResumeData } from "@/lib/schema";

/**
 * BuilderView — the standalone builder used during onboarding to create a
 * first profile. It shares the exact same ResumeEditor as the in-place
 * profile editor, so the experience is identical everywhere. On save it
 * routes into the tailoring flow.
 */
export function BuilderView({ initial }: { initial: ResumeData }) {
  const router = useRouter();

  return (
    <div
      style={{
        position: "relative",
        zIndex: 2,
        minHeight: "100%",
        display: "flex",
        flexDirection: "column",
        padding: 32,
        maxWidth: 1180,
        margin: "0 auto",
        width: "100%",
      }}
    >
      {/* header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Link href="/customize" aria-label="Jobpal home">
            <Logo size={20} />
          </Link>
          <span style={{ color: "var(--ink-4)" }}>/</span>
          <h1 style={{ fontSize: 22, fontWeight: 600 }}>Build your resume</h1>
        </div>
        <Link href="/intake" className="btn btn-glass">
          <Icon name="upload" size={16} /> I have a resume to upload
        </Link>
      </div>

      <ResumeEditor
        initial={initial}
        onSaved={() => router.push("/customize")}
        onClose={() => router.push("/customize")}
        closeLabel="Skip for now"
      />
    </div>
  );
}
