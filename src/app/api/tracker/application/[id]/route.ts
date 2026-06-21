import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId, UnauthorizedError } from "@/lib/auth";
import { getStore } from "@/lib/db/store";
import { computeStats, listApplications } from "@/lib/tracker";
import { companyKey } from "@/lib/tracker/linker";
import { parseJson, RequestValidationError, validationErrorResponse } from "@/lib/api/validation";

export const runtime = "nodejs";

const stageSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);
const outcomeSchema = z.union([z.literal("offer"), z.literal("rejected"), z.null()]);
const optionalDateString = z
  .string()
  .trim()
  .max(80)
  .refine((v) => !v || Number.isFinite(Date.parse(v)), "Date must be valid.")
  .optional();
const optionalHttpUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((v) => !v || /^https?:\/\//i.test(v), "URL must start with http:// or https://.")
  .optional();
const optionalEmail = z
  .string()
  .trim()
  .max(254)
  .refine((v) => !v || z.string().email().safeParse(v).success, "Email must be valid.")
  .optional();

const updateApplicationSchema = z.object({
  company: z.string().trim().min(1, "Company is required.").max(160).optional(),
  role: z.string().trim().min(1, "Role is required.").max(180).optional(),
  stage: stageSchema.optional(),
  outcome: outcomeSchema.optional(),
  needsAction: z.boolean().optional(),
  actionSummary: z.string().trim().max(280).optional(),
  actionDueAt: optionalDateString,
  notes: z.string().trim().max(5000).optional(),
  jobUrl: optionalHttpUrl,
  contactName: z.string().trim().max(160).optional(),
  contactEmail: optionalEmail,
  appliedAt: optionalDateString,
}).strict();

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const store = await getStore();
    const application = await store.getApplication(userId, id);
    if (!application) return NextResponse.json({ error: "Application not found." }, { status: 404 });
    const events = await store.listEmailEventsForApplication(userId, id);
    return NextResponse.json({ application, events });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error("[api.tracker.application.GET]", err);
    return NextResponse.json({ error: "Failed to load application details." }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const store = await getStore();
    const existing = await store.getApplication(userId, id);
    if (!existing) return NextResponse.json({ error: "Application not found." }, { status: 404 });

    const input = await parseJson(req, updateApplicationSchema);
    const company = input.company ?? existing.company;
    const outcome = input.outcome === undefined ? existing.outcome : input.outcome;
    const updated = {
      ...existing,
      ...input,
      company,
      companyKey: companyKey(company),
      outcome,
      stage: outcome ? 3 : input.stage ?? existing.stage,
      needsAction: outcome === "rejected" ? false : input.needsAction ?? existing.needsAction,
      actionSummary: input.actionSummary === "" ? undefined : input.actionSummary ?? existing.actionSummary,
      actionDueAt: input.actionDueAt === "" ? undefined : input.actionDueAt ?? existing.actionDueAt,
      notes: input.notes === "" ? undefined : input.notes ?? existing.notes,
      jobUrl: input.jobUrl === "" ? undefined : input.jobUrl ?? existing.jobUrl,
      contactName: input.contactName === "" ? undefined : input.contactName ?? existing.contactName,
      contactEmail: input.contactEmail === "" ? undefined : input.contactEmail ?? existing.contactEmail,
      appliedAt: input.appliedAt || existing.appliedAt,
      updatedAt: new Date().toISOString(),
    };

    await store.saveApplication(updated);
    const applications = await listApplications(userId);
    return NextResponse.json({ application: updated, applications, stats: computeStats(applications) });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof RequestValidationError) {
      return validationErrorResponse(err);
    }
    console.error("[api.tracker.application.PATCH]", err);
    return NextResponse.json({ error: "Failed to update application." }, { status: 500 });
  }
}
