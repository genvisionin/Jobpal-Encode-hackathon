/**
 * supabase-store.ts — Supabase (Postgres) implementation of JobpalStore.
 *
 * Uses the service-role key on the server only. Tables are defined in
 * `supabase/schema.sql`. Auth is deferred for now — rows hang off a
 * `user_id` text column that currently holds the demo user id.
 */

import { type SupabaseClient, type PostgrestError } from "@supabase/supabase-js";
import { createAdminSupabase } from "@/lib/auth/supabase-server";
import { resumeSchema, jobDescriptionSchema, profileInsightsSchema, coverLetterSchema } from "@/lib/schema";
import { interviewPrepSchema } from "@/lib/schema/interview-prep";
import type { JobpalStore } from "./store";
import type {
  StoredProfile,
  StoredTailoredCV,
  TrackerConnection,
  TrackedApplication,
  EmailEvent,
  ExtensionAuthCode,
  ExtensionFieldMemory,
  ExtensionSession,
  StoredProfileEnrichment,
  StoredInterviewPrep,
  Subscription,
  UsageCounter,
} from "./types";

/**
 * True when an error is PostgREST complaining about an unknown column
 * (PGRST204) — i.e. the DB hasn't been migrated to the latest schema yet, or
 * its schema cache is stale. We use this to gracefully degrade: persist the
 * stable columns now, and the newer columns once the migration is applied,
 * instead of failing the whole write.
 */
function isMissingColumnError(err: unknown): err is PostgrestError {
  const e = err as Partial<PostgrestError> | null;
  return Boolean(
    e &&
      (e.code === "PGRST204" ||
        (typeof e.message === "string" &&
          /could not find the '.*' column|column .* does not exist/i.test(e.message))),
  );
}

/**
 * True when an error is PostgREST/Postgres complaining about a missing table
 * or function — i.e. the billing/quota migration hasn't been applied yet. We
 * use this to gracefully degrade: treat the user as on the free plan with zero
 * usage (and make usage increments a no-op) instead of crashing every page
 * that resolves entitlements. Apply `supabase/migrations/0002_billing_quota.sql`
 * to enable real billing persistence.
 */
function isMissingRelationError(err: unknown): boolean {
  const e = err as Partial<PostgrestError> | null;
  if (!e) return false;
  if (e.code === "42P01" || e.code === "PGRST205" || e.code === "42883") return true;
  return Boolean(
    typeof e.message === "string" &&
      /relation .* does not exist|could not find the table|could not find the function|schema cache/i.test(
        e.message,
      ),
  );
}

let warnedBilling = false;
/** One-time console warning when the billing/quota tables aren't migrated yet. */
function warnBillingMigration(): void {
  if (warnedBilling) return;
  warnedBilling = true;
  console.warn(
    "[supabase] billing tables (subscriptions/usage_counters) missing — treating " +
      "users as Free with no usage. Apply supabase/migrations/0002_billing_quota.sql " +
      "to enable plans, quota, and payments persistence.",
  );
}

export class SupabaseStore implements JobpalStore {
  private client: SupabaseClient;

  constructor() {
    this.client = createAdminSupabase();
  }
  async getProfile(userId: string): Promise<StoredProfile | null> {
    const { data, error } = await this.client
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      userId: data.user_id,
      resume: resumeSchema.parse(data.resume),
      insights: data.insights ? profileInsightsSchema.parse(data.insights) : undefined,
      source: data.source,
      sourceFileKey: data.source_file_key ?? undefined,
      sourceFileName: data.source_file_name ?? undefined,
      updatedAt: data.updated_at,
    };
  }

  async saveProfile(profile: StoredProfile): Promise<StoredProfile> {
    const base = {
      user_id: profile.userId,
      resume: profile.resume,
      source: profile.source,
      source_file_key: profile.sourceFileKey ?? null,
      source_file_name: profile.sourceFileName ?? null,
      updated_at: profile.updatedAt,
    };
    // Try with the derived-insights column; if the DB hasn't been migrated to
    // include it yet, fall back to the stable columns so the upload still saves.
    const { error } = await this.client
      .from("profiles")
      .upsert({ ...base, insights: profile.insights ?? null }, { onConflict: "user_id" });
    if (error) {
      if (isMissingColumnError(error)) {
        console.warn(
          "[supabase] profiles.insights column missing — saving without it. " +
            "Apply supabase/schema.sql to enable career-intelligence persistence.",
        );
        const { error: retryError } = await this.client
          .from("profiles")
          .upsert(base, { onConflict: "user_id" });
        if (retryError) throw retryError;
        return profile;
      }
      throw error;
    }
    return profile;
  }

  async listTailoredCVs(userId: string): Promise<StoredTailoredCV[]> {
    const { data, error } = await this.client
      .from("tailored_cvs")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(this.rowToCV);
  }

  async getTailoredCV(userId: string, id: string): Promise<StoredTailoredCV | null> {
    const { data, error } = await this.client
      .from("tailored_cvs")
      .select("*")
      .eq("user_id", userId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? this.rowToCV(data) : null;
  }

  async saveTailoredCV(cv: StoredTailoredCV): Promise<StoredTailoredCV> {
    const base = {
      id: cv.id,
      user_id: cv.userId,
      company: cv.company,
      role: cv.role,
      template_id: cv.templateId,
      resume: cv.resume,
      job: cv.job,
      match_score: cv.matchScore,
      changes: cv.changes,
      keyword_coverage: cv.keywordCoverage,
      created_at: cv.createdAt,
    };
    const analysis = {
      archetype: cv.archetype ?? null,
      archetype_rationale: cv.archetypeRationale ?? null,
      score_breakdown: cv.scoreBreakdown ?? [],
      requirement_matches: cv.requirementMatches ?? [],
      customization_plan: cv.customizationPlan ?? [],
      cover_letter: cv.coverLetter ?? null,
    };
    // Try with the career-ops analysis columns; gracefully fall back to the
    // stable columns if the DB hasn't been migrated to include them yet.
    const { error } = await this.client.from("tailored_cvs").upsert({ ...base, ...analysis });
    if (error) {
      if (isMissingColumnError(error)) {
        console.warn(
          "[supabase] tailored_cvs analysis columns missing — saving without them. " +
            "Apply supabase/schema.sql to enable the full fit analysis.",
        );
        const { error: retryError } = await this.client.from("tailored_cvs").upsert(base);
        if (retryError) throw retryError;
        return cv;
      }
      throw error;
    }
    return cv;
  }

  private rowToCV = (data: Record<string, unknown>): StoredTailoredCV => ({
    id: data.id as string,
    userId: data.user_id as string,
    company: data.company as string,
    role: data.role as string,
    templateId: data.template_id as string,
    resume: resumeSchema.parse(data.resume),
    job: jobDescriptionSchema.parse(data.job),
    archetype: (data.archetype as string) ?? undefined,
    archetypeRationale: (data.archetype_rationale as string) ?? undefined,
    matchScore: Number(data.match_score ?? 0),
    scoreBreakdown: (data.score_breakdown as StoredTailoredCV["scoreBreakdown"]) ?? [],
    requirementMatches: (data.requirement_matches as StoredTailoredCV["requirementMatches"]) ?? [],
    customizationPlan: (data.customization_plan as StoredTailoredCV["customizationPlan"]) ?? [],
    changes: (data.changes as string[]) ?? [],
    keywordCoverage: (data.keyword_coverage as StoredTailoredCV["keywordCoverage"]) ?? [],
    coverLetter: data.cover_letter ? coverLetterSchema.parse(data.cover_letter) : undefined,
    createdAt: data.created_at as string,
  });

  // --- Gmail tracker ---

  async getConnection(userId: string): Promise<TrackerConnection | null> {
    const { data, error } = await this.client
      .from("tracker_connections")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      userId: data.user_id,
      email: data.email,
      accessToken: data.access_token ?? undefined,
      refreshToken: data.refresh_token ?? undefined,
      tokenExpiresAt: data.token_expires_at ?? undefined,
      connectedAt: data.connected_at,
      lastSyncedAt: data.last_synced_at ?? undefined,
      syncCursor: data.sync_cursor ?? undefined,
      status: data.status,
    };
  }

  async saveConnection(conn: TrackerConnection): Promise<TrackerConnection> {
    const { error } = await this.client.from("tracker_connections").upsert(
      {
        user_id: conn.userId,
        email: conn.email,
        access_token: conn.accessToken ?? null,
        refresh_token: conn.refreshToken ?? null,
        token_expires_at: conn.tokenExpiresAt ?? null,
        connected_at: conn.connectedAt,
        last_synced_at: conn.lastSyncedAt ?? null,
        sync_cursor: conn.syncCursor ?? null,
        status: conn.status,
      },
      { onConflict: "user_id" },
    );
    if (error) throw error;
    return conn;
  }

  async deleteConnection(userId: string): Promise<void> {
    await this.client.from("email_events").delete().eq("user_id", userId);
    await this.client.from("tracked_applications").delete().eq("user_id", userId);
    const { error } = await this.client.from("tracker_connections").delete().eq("user_id", userId);
    if (error) throw error;
  }

  async listConnectedUserIds(): Promise<string[]> {
    const { data, error } = await this.client
      .from("tracker_connections")
      .select("user_id")
      .eq("status", "connected");
    if (error) throw error;
    return (data ?? []).map((r: { user_id: string }) => r.user_id);
  }

  async listApplications(userId: string): Promise<TrackedApplication[]> {
    const { data, error } = await this.client
      .from("tracked_applications")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(this.rowToApp);
  }

  async getApplication(userId: string, id: string): Promise<TrackedApplication | null> {
    const { data, error } = await this.client
      .from("tracked_applications")
      .select("*")
      .eq("user_id", userId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? this.rowToApp(data) : null;
  }

  async saveApplication(app: TrackedApplication): Promise<TrackedApplication> {
    const row = {
      id: app.id,
      user_id: app.userId,
      company: app.company,
      company_key: app.companyKey,
      role: app.role,
      stage: app.stage,
      outcome: app.outcome,
      needs_action: app.needsAction,
      action_summary: app.actionSummary ?? null,
      action_due_at: app.actionDueAt ?? null,
      notes: app.notes ?? null,
      job_url: app.jobUrl ?? null,
      contact_name: app.contactName ?? null,
      contact_email: app.contactEmail ?? null,
      latest_email_id: app.latestEmailId ?? null,
      latest_thread_id: app.latestThreadId ?? null,
      applied_at: app.appliedAt,
      updated_at: app.updatedAt,
      source: app.source,
    };
    const { error } = await this.client.from("tracked_applications").upsert(row);
    if (error) {
      if (!isMissingColumnError(error)) throw error;
      const { error: retry } = await this.client.from("tracked_applications").upsert({
        id: app.id,
        user_id: app.userId,
        company: app.company,
        company_key: app.companyKey,
        role: app.role,
        stage: app.stage,
        outcome: app.outcome,
        needs_action: app.needsAction,
        action_summary: app.actionSummary ?? null,
        applied_at: app.appliedAt,
        updated_at: app.updatedAt,
        source: app.source,
      });
      if (retry) throw retry;
    }
    return app;
  }

  async hasEmailEvent(userId: string, emailId: string): Promise<boolean> {
    const { data, error } = await this.client
      .from("email_events")
      .select("id")
      .eq("user_id", userId)
      .eq("id", emailId)
      .maybeSingle();
    if (error) throw error;
    return Boolean(data);
  }

  async saveEmailEvent(event: EmailEvent): Promise<EmailEvent> {
    const row = {
      id: event.id,
      user_id: event.userId,
      application_id: event.applicationId ?? null,
      thread_id: event.threadId ?? null,
      kind: event.kind,
      company: event.company,
      role: event.role,
      received_at: event.receivedAt,
      event_date: event.eventDate ?? null,
      summary: event.summary,
      confidence: event.confidence,
    };
    const { error } = await this.client.from("email_events").upsert(row);
    if (error) {
      if (!isMissingColumnError(error)) throw error;
      const { error: retry } = await this.client.from("email_events").upsert({
        id: event.id,
        user_id: event.userId,
        application_id: event.applicationId ?? null,
        kind: event.kind,
        company: event.company,
        role: event.role,
        received_at: event.receivedAt,
        summary: event.summary,
        confidence: event.confidence,
      });
      if (retry) throw retry;
    }
    return event;
  }

  async listEmailEvents(userId: string): Promise<EmailEvent[]> {
    const { data, error } = await this.client
      .from("email_events")
      .select("*")
      .eq("user_id", userId)
      .order("received_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((d: Record<string, unknown>) => ({
      id: d.id as string,
      userId: d.user_id as string,
      applicationId: (d.application_id as string) ?? undefined,
      threadId: (d.thread_id as string) ?? undefined,
      kind: d.kind as EmailEvent["kind"],
      company: d.company as string,
      role: d.role as string,
      receivedAt: d.received_at as string,
      eventDate: (d.event_date as string) ?? undefined,
      summary: d.summary as string,
      confidence: Number(d.confidence ?? 0),
    }));
  }

  async listEmailEventsForApplication(userId: string, applicationId: string): Promise<EmailEvent[]> {
    const { data, error } = await this.client
      .from("email_events")
      .select("*")
      .eq("user_id", userId)
      .eq("application_id", applicationId)
      .order("received_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((d: Record<string, unknown>) => ({
      id: d.id as string,
      userId: d.user_id as string,
      applicationId: (d.application_id as string) ?? undefined,
      threadId: (d.thread_id as string) ?? undefined,
      kind: d.kind as EmailEvent["kind"],
      company: d.company as string,
      role: d.role as string,
      receivedAt: d.received_at as string,
      eventDate: (d.event_date as string) ?? undefined,
      summary: d.summary as string,
      confidence: Number(d.confidence ?? 0),
    }));
  }

  private rowToApp = (data: Record<string, unknown>): TrackedApplication => ({
    id: data.id as string,
    userId: data.user_id as string,
    company: data.company as string,
    companyKey: data.company_key as string,
    role: data.role as string,
    stage: Number(data.stage ?? 0) as TrackedApplication["stage"],
    outcome: (data.outcome as TrackedApplication["outcome"]) ?? null,
    needsAction: Boolean(data.needs_action),
    actionSummary: (data.action_summary as string) ?? undefined,
    actionDueAt: (data.action_due_at as string) ?? undefined,
    notes: (data.notes as string) ?? undefined,
    jobUrl: (data.job_url as string) ?? undefined,
    contactName: (data.contact_name as string) ?? undefined,
    contactEmail: (data.contact_email as string) ?? undefined,
    latestEmailId: (data.latest_email_id as string) ?? undefined,
    latestThreadId: (data.latest_thread_id as string) ?? undefined,
    appliedAt: data.applied_at as string,
    updatedAt: data.updated_at as string,
    source: (data.source as TrackedApplication["source"]) ?? "gmail",
  });

  // --- Interview prep ---

  async getInterviewPrep(
    userId: string,
    applicationId: string,
  ): Promise<StoredInterviewPrep | null> {
    const { data, error } = await this.client
      .from("interview_preps")
      .select("*")
      .eq("user_id", userId)
      .eq("application_id", applicationId)
      .maybeSingle();
    if (error) {
      // Table not migrated yet → behave as "no prep yet" instead of crashing.
      if (isMissingRelationError(error)) return null;
      throw error;
    }
    if (!data) return null;
    return {
      id: data.id as string,
      userId: data.user_id as string,
      applicationId: data.application_id as string,
      company: (data.company as string) ?? "",
      role: (data.role as string) ?? "",
      prep: interviewPrepSchema.parse(data.prep ?? {}),
      source: (data.source as StoredInterviewPrep["source"]) ?? "azure",
      createdAt: data.created_at as string,
      updatedAt: data.updated_at as string,
    };
  }

  async saveInterviewPrep(prep: StoredInterviewPrep): Promise<StoredInterviewPrep> {
    const { error } = await this.client.from("interview_preps").upsert(
      {
        id: prep.id,
        user_id: prep.userId,
        application_id: prep.applicationId,
        company: prep.company,
        role: prep.role,
        prep: prep.prep,
        source: prep.source,
        created_at: prep.createdAt,
        updated_at: prep.updatedAt,
      },
      { onConflict: "user_id,application_id" },
    );
    if (error && !isMissingRelationError(error)) throw error;
    return prep;
  }

  // --- Chrome extension auth ---

  async saveExtensionAuthCode(code: ExtensionAuthCode): Promise<ExtensionAuthCode> {
    const { error } = await this.client.from("extension_auth_codes").upsert({
      code_hash: code.codeHash,
      user_id: code.userId,
      extension_id: code.extensionId,
      redirect_uri: code.redirectUri,
      expires_at: code.expiresAt,
      created_at: code.createdAt,
      used_at: code.usedAt ?? null,
    });
    if (error) throw error;
    return code;
  }

  async getExtensionAuthCode(codeHash: string): Promise<ExtensionAuthCode | null> {
    const { data, error } = await this.client
      .from("extension_auth_codes")
      .select("*")
      .eq("code_hash", codeHash)
      .maybeSingle();
    if (error) throw error;
    return data
      ? {
          codeHash: data.code_hash as string,
          userId: data.user_id as string,
          extensionId: data.extension_id as string,
          redirectUri: data.redirect_uri as string,
          expiresAt: data.expires_at as string,
          createdAt: data.created_at as string,
          usedAt: (data.used_at as string) ?? undefined,
        }
      : null;
  }

  async markExtensionAuthCodeUsed(codeHash: string, usedAt: string): Promise<void> {
    const { error } = await this.client
      .from("extension_auth_codes")
      .update({ used_at: usedAt })
      .eq("code_hash", codeHash);
    if (error) throw error;
  }

  async saveExtensionSession(session: ExtensionSession): Promise<ExtensionSession> {
    const { error } = await this.client.from("extension_sessions").upsert({
      id: session.id,
      user_id: session.userId,
      extension_id: session.extensionId,
      access_token_hash: session.accessTokenHash,
      refresh_token_hash: session.refreshTokenHash,
      access_expires_at: session.accessExpiresAt,
      refresh_expires_at: session.refreshExpiresAt,
      created_at: session.createdAt,
      last_used_at: session.lastUsedAt,
      revoked_at: session.revokedAt ?? null,
    });
    if (error) throw error;
    return session;
  }

  async getExtensionSessionByAccessHash(accessTokenHash: string): Promise<ExtensionSession | null> {
    const { data, error } = await this.client
      .from("extension_sessions")
      .select("*")
      .eq("access_token_hash", accessTokenHash)
      .maybeSingle();
    if (error) throw error;
    return data ? this.rowToExtensionSession(data) : null;
  }

  async getExtensionSessionByRefreshHash(refreshTokenHash: string): Promise<ExtensionSession | null> {
    const { data, error } = await this.client
      .from("extension_sessions")
      .select("*")
      .eq("refresh_token_hash", refreshTokenHash)
      .maybeSingle();
    if (error) throw error;
    return data ? this.rowToExtensionSession(data) : null;
  }

  async revokeExtensionSession(id: string, revokedAt: string): Promise<void> {
    const { error } = await this.client
      .from("extension_sessions")
      .update({ revoked_at: revokedAt, last_used_at: revokedAt })
      .eq("id", id);
    if (error) throw error;
  }

  async listExtensionFieldMemories(userId: string): Promise<ExtensionFieldMemory[]> {
    const { data, error } = await this.client
      .from("extension_field_memories")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    return (data ?? []).map(this.rowToExtensionFieldMemory);
  }

  async upsertExtensionFieldMemory(memory: ExtensionFieldMemory): Promise<ExtensionFieldMemory> {
    const { data, error } = await this.client
      .from("extension_field_memories")
      .upsert(
        {
          id: memory.id,
          user_id: memory.userId,
          question_key: memory.questionKey,
          normalized_question: memory.normalizedQuestion,
          field_kind: memory.fieldKind,
          answer: memory.answer,
          metadata: memory.metadata,
          capture_count: memory.captureCount,
          created_at: memory.createdAt,
          updated_at: memory.updatedAt,
        },
        { onConflict: "user_id,question_key" },
      )
      .select("*")
      .single();
    if (error) throw error;
    return data ? this.rowToExtensionFieldMemory(data) : memory;
  }

  async getProfileEnrichment(userId: string): Promise<StoredProfileEnrichment | null> {
    const { data, error } = await this.client
      .from("user_profile_enrichments")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      if (isMissingRelationError(error)) return null;
      throw error;
    }
    return data ? this.rowToProfileEnrichment(data) : null;
  }

  async saveProfileEnrichment(enrichment: StoredProfileEnrichment): Promise<StoredProfileEnrichment> {
    const { error } = await this.client.from("user_profile_enrichments").upsert(
      {
        user_id: enrichment.userId,
        summary: enrichment.summary,
        application_preferences: enrichment.applicationPreferences,
        communication_style: enrichment.communicationStyle,
        facts: enrichment.facts,
        sensitive_facts: enrichment.sensitiveFacts,
        conflicts: enrichment.conflicts,
        source_memory_ids: enrichment.sourceMemoryIds,
        source_memory_updated_at: enrichment.sourceMemoryUpdatedAt ?? null,
        version: enrichment.version,
        created_at: enrichment.createdAt,
        updated_at: enrichment.updatedAt,
      },
      { onConflict: "user_id" },
    );
    if (error) {
      if (isMissingRelationError(error)) {
        console.warn(
          "[supabase] user_profile_enrichments table missing — skipping profile enrichment persistence. " +
            "Apply supabase/migrations/0007_profile_enrichments.sql.",
        );
        return enrichment;
      }
      throw error;
    }
    return enrichment;
  }

  private rowToExtensionSession = (data: Record<string, unknown>): ExtensionSession => ({
    id: data.id as string,
    userId: data.user_id as string,
    extensionId: data.extension_id as string,
    accessTokenHash: data.access_token_hash as string,
    refreshTokenHash: data.refresh_token_hash as string,
    accessExpiresAt: data.access_expires_at as string,
    refreshExpiresAt: data.refresh_expires_at as string,
    createdAt: data.created_at as string,
    lastUsedAt: data.last_used_at as string,
    revokedAt: (data.revoked_at as string) ?? undefined,
  });

  private rowToExtensionFieldMemory = (data: Record<string, unknown>): ExtensionFieldMemory => ({
    id: data.id as string,
    userId: data.user_id as string,
    questionKey: data.question_key as string,
    normalizedQuestion: data.normalized_question as string,
    fieldKind: data.field_kind as string,
    answer: data.answer as ExtensionFieldMemory["answer"],
    metadata: data.metadata as ExtensionFieldMemory["metadata"],
    captureCount: (data.capture_count as number) ?? 1,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  });

  private rowToProfileEnrichment = (data: Record<string, unknown>): StoredProfileEnrichment => ({
    userId: data.user_id as string,
    summary: (data.summary as string) ?? "",
    applicationPreferences: (data.application_preferences as string[]) ?? [],
    communicationStyle: (data.communication_style as string[]) ?? [],
    facts: (data.facts as StoredProfileEnrichment["facts"]) ?? [],
    sensitiveFacts: (data.sensitive_facts as StoredProfileEnrichment["sensitiveFacts"]) ?? [],
    conflicts: (data.conflicts as StoredProfileEnrichment["conflicts"]) ?? [],
    sourceMemoryIds: (data.source_memory_ids as string[]) ?? [],
    sourceMemoryUpdatedAt: (data.source_memory_updated_at as string) ?? undefined,
    version: Number(data.version ?? 1),
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  });

  // --- Billing & quota ---

  async getSubscription(userId: string): Promise<Subscription | null> {
    const { data, error } = await this.client
      .from("subscriptions")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      if (isMissingRelationError(error)) {
        warnBillingMigration();
        return null; // → treated as free
      }
      throw error;
    }
    return data ? this.rowToSub(data) : null;
  }

  async saveSubscription(sub: Subscription): Promise<Subscription> {
    const { error } = await this.client.from("subscriptions").upsert(
      {
        user_id: sub.userId,
        plan: sub.plan,
        status: sub.status,
        dodo_customer_id: sub.dodoCustomerId ?? null,
        dodo_subscription_id: sub.dodoSubscriptionId ?? null,
        current_period_end: sub.currentPeriodEnd ?? null,
        cancel_at_period_end: sub.cancelAtPeriodEnd ?? false,
        updated_at: sub.updatedAt,
      },
      { onConflict: "user_id" },
    );
    if (error) {
      if (isMissingRelationError(error)) {
        warnBillingMigration();
        return sub; // can't persist yet, but don't crash the upgrade flow
      }
      throw error;
    }
    return sub;
  }

  async getSubscriptionByDodoId(dodoSubscriptionId: string): Promise<Subscription | null> {
    const { data, error } = await this.client
      .from("subscriptions")
      .select("*")
      .eq("dodo_subscription_id", dodoSubscriptionId)
      .maybeSingle();
    if (error) {
      if (isMissingRelationError(error)) {
        warnBillingMigration();
        return null;
      }
      throw error;
    }
    return data ? this.rowToSub(data) : null;
  }

  private rowToSub = (data: Record<string, unknown>): Subscription => ({
    userId: data.user_id as string,
    plan: data.plan as Subscription["plan"],
    status: data.status as Subscription["status"],
    dodoCustomerId: (data.dodo_customer_id as string) ?? undefined,
    dodoSubscriptionId: (data.dodo_subscription_id as string) ?? undefined,
    currentPeriodEnd: (data.current_period_end as string) ?? undefined,
    cancelAtPeriodEnd: Boolean(data.cancel_at_period_end),
    createdAt: (data.created_at as string) ?? undefined,
    updatedAt: data.updated_at as string,
  });

  async getUsage(
    userId: string,
    metric: string,
    period: string,
  ): Promise<UsageCounter | null> {
    const { data, error } = await this.client
      .from("usage_counters")
      .select("*")
      .eq("user_id", userId)
      .eq("metric", metric)
      .eq("period", period)
      .maybeSingle();
    if (error) {
      if (isMissingRelationError(error)) {
        warnBillingMigration();
        return null; // → usage treated as 0
      }
      throw error;
    }
    if (!data) return null;
    return {
      userId: data.user_id,
      metric: data.metric,
      period: data.period,
      count: Number(data.count ?? 0),
      updatedAt: data.updated_at,
    };
  }

  async incrementUsage(
    userId: string,
    metric: string,
    period: string,
    delta: number,
  ): Promise<UsageCounter> {
    // Atomic increment via a Postgres RPC (defined in schema.sql). Falls back
    // to a read-modify-write if the function isn't present yet.
    const { data, error } = await this.client.rpc("increment_usage", {
      p_user_id: userId,
      p_metric: metric,
      p_period: period,
      p_delta: delta,
    });
    if (!error && data != null) {
      const row = Array.isArray(data) ? data[0] : data;
      return {
        userId,
        metric,
        period,
        count: Number((row as { count?: number })?.count ?? delta),
        updatedAt: new Date().toISOString(),
      };
    }
    if (error && isMissingRelationError(error)) {
      warnBillingMigration();
      // Can't meter yet — report the delta so callers proceed without crashing.
      return { userId, metric, period, count: Math.max(0, delta), updatedAt: new Date().toISOString() };
    }
    // Fallback: best-effort read-modify-write (not concurrency-safe, but the
    // local/demo path is single-process and this only triggers pre-migration).
    const existing = await this.getUsage(userId, metric, period);
    const next = (existing?.count ?? 0) + delta;
    const now = new Date().toISOString();
    const { error: upErr } = await this.client.from("usage_counters").upsert(
      { user_id: userId, metric, period, count: next, updated_at: now },
      { onConflict: "user_id,metric,period" },
    );
    if (upErr) {
      if (isMissingRelationError(upErr)) {
        warnBillingMigration();
        return { userId, metric, period, count: next, updatedAt: now };
      }
      throw upErr;
    }
    return { userId, metric, period, count: next, updatedAt: now };
  }
}
