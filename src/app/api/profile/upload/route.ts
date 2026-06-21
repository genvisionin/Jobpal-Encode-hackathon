import { NextResponse } from "next/server";
import { ingestResumeFile, UnsupportedFileError } from "@/lib/services/profile-service";
import { requireUserId, UnauthorizedError } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_BYTES = 10 * 1024 * 1024; // 10MB

/** POST /api/profile/upload — multipart form with `file`; parses & saves the base profile. */
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "The uploaded file is empty." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "File is larger than 10MB." }, { status: 413 });
    }

    const buffer = await file.arrayBuffer();
    const result = await ingestResumeFile(
      { buffer, filename: file.name, mime: file.type },
      userId,
    );

    return NextResponse.json({
      profile: result.profile,
      source: result.source,
      kind: result.kind,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof UnsupportedFileError) {
      return NextResponse.json({ error: err.message }, { status: 415 });
    }
    console.error("[api.profile.upload]", err);
    return NextResponse.json({ error: "Failed to process the resume." }, { status: 500 });
  }
}
