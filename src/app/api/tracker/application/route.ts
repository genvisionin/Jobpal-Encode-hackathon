import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId, UnauthorizedError } from "@/lib/auth";
import type { TrackedApplication } from "@/lib/db/types";
import { getStore } from "@/lib/db/store";
import { companyKey } from "@/lib/tracker/linker";
import { computeStats, listApplications } from "@/lib/tracker";
import { parseJson, RequestValidationError, validationErrorResponse } from "@/lib/api/validation";

export const runtime = "nodejs";

const stageSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);
const outcomeSchema = z.union([z.literal("offer"), z.literal("rejected"), z.null()]);
const optionalDateString = z
  .string()
  .trim()
  .max(80)
  .refine((v) => !v || Number.isFinite(Date.parse(v)), "Date must be valid.")
  .optional()
  .default("");
const optionalHttpUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((v) => !v || /^https?:\/\//i.test(v), "URL must start with http:// or https://.")
  .optional()
  .default("");
const optionalEmail = z
  .string()
  .trim()
  .max(254)
  .refine((v) => !v || z.string().email().safeParse(v).success, "Email must be valid.")
  .optional()
  .default("");

const manualApplicationSchema = z.object({
  company: z.string().trim().min(1, "Company is required.").max(160),
  role: z.string().trim().min(1, "Role is required.").max(180),
  stage: stageSchema.default(0),
  outcome: outcomeSchema.default(null),
  needsAction: z.boolean().default(false),
  actionSummary: z.string().trim().max(280).optional().default(""),
  actionDueAt: optionalDateString,
  notes: z.string().trim().max(5000).optional().default(""),
  jobUrl: optionalHttpUrl,
  contactName: z.string().trim().max(160).optional().default(""),
  contactEmail: optionalEmail,
  appliedAt: optionalDateString,
}).strict();

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const input = await parseJson(req, manualApplicationSchema);
    const now = new Date().toISOString();
    const app: TrackedApplication = {
      id: randomUUID(),
      userId,
      company: input.company,
      companyKey: companyKey(input.company),
      role: input.role,
      stage: input.outcome ? 3 : input.stage,
      outcome: input.outcome,
      needsAction: input.outcome === "rejected" ? false : input.needsAction,
      actionSummary: input.actionSummary || undefined,
      actionDueAt: input.actionDueAt || undefined,
      notes: input.notes || undefined,
      jobUrl: input.jobUrl || undefined,
      contactName: input.contactName || undefined,
      contactEmail: input.contactEmail || undefined,
      appliedAt: input.appliedAt || now,
      updatedAt: now,
      source: "manual",
    };

    const store = await getStore();
    await store.saveApplication(app);
    const applications = await listApplications(userId);
    return NextResponse.json({ application: app, applications, stats: computeStats(applications) });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof RequestValidationError) {
      return validationErrorResponse(err);
    }
    console.error("[api.tracker.application.POST]", err);
    return NextResponse.json({ error: "Failed to add application." }, { status: 500 });
  }
}
