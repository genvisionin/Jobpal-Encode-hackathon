"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui";
import { PageHeader } from "@/components/layout";
import { ResumeEditor } from "@/components/resume";
import type { StoredProfileEnrichment } from "@/lib/db/types";
import type { ResumeData, ProfileInsights } from "@/lib/schema";
import { ProfileView } from "./ProfileView";

/**
 * ProfileScreen — owns the base-profile experience. It swaps between a
 * read-only view and an in-place editor without leaving the screen, so the
 * sidebar and app frame never disappear. The old standalone /builder route
 * is gone; editing lives right here.
 */
export function ProfileScreen({
  initialResume,
  initialUpdatedAt,
  initialInsights,
  initialEnrichment,
  initialCapturedCount,
}: {
  initialResume: ResumeData;
  initialUpdatedAt: string;
  initialInsights?: ProfileInsights;
  initialEnrichment?: StoredProfileEnrichment | null;
  initialCapturedCount?: number;
}) {
  const [resume, setResume] = useState(initialResume);
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);
  const [enrichment, setEnrichment] = useState<StoredProfileEnrichment | null>(initialEnrichment ?? null);
  const [capturedCount, setCapturedCount] = useState(initialCapturedCount ?? 0);
  const [editing, setEditing] = useState(false);
  const [jumpTo, setJumpTo] = useState<string | undefined>(undefined);

  function startEdit(section?: string) {
    setJumpTo(section);
    setEditing(true);
  }

  function handleSaved(next: ResumeData) {
    setResume(next);
    setUpdatedAt(new Date().toISOString());
  }

  const lastUpdated = new Date(updatedAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

  if (editing) {
    return (
      <>
        <PageHeader
          title="Edit your profile"
          subtitle="Update once and every tailored resume stays in sync. Changes save to your base profile."
          eyebrow={
            <span className="chip chip-accent">
              <Icon name="edit" size={13} /> Editing
            </span>
          }
          actions={
            <Link href="/intake" className="btn btn-glass">
              <Icon name="upload" size={16} /> Re-upload instead
            </Link>
          }
        />
        <ResumeEditor
          initial={resume}
          initialSection={jumpTo}
          onSaved={handleSaved}
          onClose={() => setEditing(false)}
          closeLabel="Done editing"
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Your base profile"
        subtitle="The master we tailor every resume from. Edit it once and all your customizations stay in sync."
        actions={
          <>
            <Link href="/intake" className="btn btn-glass">
              <Icon name="upload" size={16} /> Re-upload
            </Link>
            <button className="btn btn-primary" onClick={() => startEdit()}>
              <Icon name="edit" size={16} /> Edit profile
            </button>
          </>
        }
      />
      <ProfileView
        resume={resume}
        lastUpdated={lastUpdated}
        onEdit={startEdit}
        insights={initialInsights}
        enrichment={enrichment}
        capturedCount={capturedCount}
        onEnrichmentChange={(next, nextCount) => {
          setEnrichment(next);
          if (typeof nextCount === "number") setCapturedCount(nextCount);
        }}
      />
    </>
  );
}
