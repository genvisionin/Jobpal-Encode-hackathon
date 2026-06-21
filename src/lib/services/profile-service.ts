/**
 * profile-service.ts — orchestrates resume upload → parse → save, scoped
 * to a specific user. Every function takes an explicit `userId` resolved
 * from the auth session by the calling route — there is no shared default,
 * so users never see each other's data.
 *
 * Flow: extract text from the uploaded file, optionally store the original
 * in R2, parse the text into structured resume data via the LLM (or mock),
 * derive reusable career intelligence, and persist both as that user's base
 * profile.
 */

import { detectKind, extractResumeText, type SupportedKind } from "@/lib/parsing/extract-text";
import { parseCV, parseCVFromPDF, deriveInsights, type LLMSource } from "@/lib/llm";
import { storeOriginalFile } from "@/lib/storage/r2";
import { getStore } from "@/lib/db/store";
import { emptyResume } from "@/lib/schema";
import type { StoredProfile } from "@/lib/db/types";
import type { ResumeData } from "@/lib/schema";

export interface UploadResult {
  profile: StoredProfile;
  source: LLMSource;
  kind: SupportedKind;
}

export class UnsupportedFileError extends Error {}

export async function ingestResumeFile(
  file: { buffer: ArrayBuffer; filename: string; mime: string },
  userId: string,
): Promise<UploadResult> {
  const kind = detectKind(file.filename, file.mime);
  if (!kind) {
    throw new UnsupportedFileError("Unsupported file type. Upload a PDF, DOCX, or text resume.");
  }

  // For PDFs, send the document straight to the multimodal model — this is
  // far more reliable than text extraction on multi-column / multi-page
  // resumes. We still extract text as a fallback. For DOCX/text, use text.
  let resume: ResumeData;
  let source: LLMSource;

  if (kind === "pdf") {
    // Capture the bytes BEFORE text extraction — unpdf/pdf.js detaches the
    // ArrayBuffer when it processes it, which would break a later read.
    const pdfBase64 = Buffer.from(new Uint8Array(file.buffer)).toString("base64");
    const fallbackText = await extractResumeText(file.buffer, kind).catch(() => "");
    const parsed = await parseCVFromPDF(pdfBase64, file.filename, fallbackText);
    resume = parsed.data;
    source = parsed.source;
  } else {
    const text = await extractResumeText(file.buffer, kind);
    if (!text || text.length < 30) {
      throw new UnsupportedFileError(
        "We couldn't read enough text from that file. It may be a scanned image — try a text-based PDF or DOCX.",
      );
    }
    const parsed = await parseCV(text);
    resume = parsed.data;
    source = parsed.source;
  }

  // Best-effort original-file archival (no-op without R2).
  const stored = await storeOriginalFile(file.buffer, file.filename, file.mime).catch(() => null);

  // Derive the "career intelligence" layer (archetypes + narrative + proof
  // points) from the parsed resume. Required for high-quality
  // tailoring, so production model failures should surface instead of silently
  // saving a weak profile.
  const { data: insights } = await deriveInsights(resume);

  const store = await getStore();
  const profile = await store.saveProfile({
    userId,
    resume,
    insights,
    source: "upload",
    sourceFileKey: stored?.key,
    sourceFileName: file.filename,
    updatedAt: new Date().toISOString(),
  });

  return { profile, source, kind };
}

/**
 * Get the user's profile. Returns null if they have not created one yet.
 * (No auto-seed — new users genuinely start empty and are guided to
 * upload or build their profile.)
 */
export async function getProfile(userId: string): Promise<StoredProfile | null> {
  const store = await getStore();
  return store.getProfile(userId);
}

/** Get the user's profile, or a fresh empty one if none exists yet. */
export async function getProfileOrEmpty(userId: string): Promise<StoredProfile> {
  const existing = await getProfile(userId);
  if (existing) return existing;
  return {
    userId,
    resume: emptyResume(),
    source: "builder",
    updatedAt: new Date().toISOString(),
  };
}

export async function saveProfileResume(
  resume: ResumeData,
  userId: string,
): Promise<StoredProfile> {
  const store = await getStore();
  // Re-derive career intelligence since the base resume changed. This keeps
  // manual profile edits in sync with the preprocessing layer used by tailoring.
  const { data: insights } = await deriveInsights(resume);
  return store.saveProfile({
    userId,
    resume,
    insights,
    source: "builder",
    updatedAt: new Date().toISOString(),
  });
}

/** Whether the user has a saved (non-empty) profile yet. */
export async function hasProfile(userId: string): Promise<boolean> {
  const p = await getProfile(userId);
  if (!p) return false;
  const r = p.resume;
  return Boolean(r.contact.name || r.summary || r.sections.length);
}

/**
 * Patch the basic account fields on the user's profile contact (name, title,
 * location) without touching the rest of the resume or re-deriving insights —
 * this is the cheap "edit my account info" path used by Settings. Creates an
 * empty profile to hang the contact on if the user has none yet.
 */
export async function updateAccountContact(
  patch: { name?: string; title?: string; location?: string },
  userId: string,
): Promise<StoredProfile> {
  const store = await getStore();
  const existing = (await getProfile(userId)) ?? (await getProfileOrEmpty(userId));
  const contact = { ...existing.resume.contact };
  if (typeof patch.name === "string") contact.name = patch.name;
  if (typeof patch.title === "string") contact.title = patch.title;
  if (typeof patch.location === "string") contact.location = patch.location;

  return store.saveProfile({
    ...existing,
    resume: { ...existing.resume, contact },
    updatedAt: new Date().toISOString(),
  });
}
