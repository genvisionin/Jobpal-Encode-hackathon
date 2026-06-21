import { z } from "zod";
import { getStore, type JobpalStore } from "@/lib/db/store";
import { LocalStore } from "@/lib/db/local-store";
import { getProfile } from "@/lib/services/profile-service";
import type {
  ExtensionFieldMemory,
  ProfileEnrichmentConflict,
  ProfileEnrichmentFact,
  ProfileEnrichmentSensitivity,
  StoredProfile,
  StoredProfileEnrichment,
} from "@/lib/db/types";

const ENRICHMENT_VERSION = 1;
const MAX_SOURCE_MEMORIES = 160;

const editableFactSchema = z.object({
  key: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(160),
  value: z.string().trim().max(400),
  sensitivity: z.enum(["standard", "preference", "protected_demographic", "legal", "consent"]),
  sourceMemoryIds: z.array(z.string().trim().max(120)).max(25).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export const editableProfileEnrichmentSchema = z.object({
  summary: z.string().trim().max(1200).optional().default(""),
  applicationPreferences: z.array(z.string().trim().max(240)).max(12).optional().default([]),
  communicationStyle: z.array(z.string().trim().max(180)).max(8).optional().default([]),
  facts: z.array(editableFactSchema).max(80).default([]),
  sensitiveFacts: z.array(editableFactSchema).max(80).default([]),
}).strict();

export type EditableProfileEnrichmentInput = z.infer<typeof editableProfileEnrichmentSchema>;

async function getEnrichmentStore(): Promise<JobpalStore> {
  if (process.env.NODE_ENV !== "production") return new LocalStore();
  return getStore();
}

function normalize(value: string | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clean(value: string | undefined, max = 500): string {
  return (value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function stableKey(value: string): string {
  return normalize(value).replace(/\s+/g, "_").slice(0, 90) || `fact_${Date.now()}`;
}

function questionFor(memory: ExtensionFieldMemory): string {
  return clean(
    [
      memory.metadata.fieldLabel,
      memory.metadata.placeholder,
      memory.metadata.context,
      memory.normalizedQuestion,
    ]
      .filter(Boolean)
      .join(" "),
    700,
  );
}

function classifyMemory(memory: ExtensionFieldMemory): {
  key: string;
  label: string;
  sensitivity: ProfileEnrichmentSensitivity;
} | null {
  const q = normalize(questionFor(memory));
  if (!q) return null;
  const question = clean(memory.metadata.fieldLabel || memory.metadata.placeholder || memory.normalizedQuestion, 160);

  if (/\bage\b|age group|current age|date of birth|birth date/.test(q)) {
    return { key: "age_range", label: question || "Age range", sensitivity: "protected_demographic" };
  }
  if (/gender|pronoun|sex assigned|sex at birth/.test(q)) {
    return { key: "gender_identity", label: question || "Gender identity", sensitivity: "protected_demographic" };
  }
  if (/race|racial|ethnicity|ethnic origin|ethnic identity/.test(q)) {
    return { key: "racial_ethnic_identity", label: question || "Racial or ethnic identity", sensitivity: "protected_demographic" };
  }
  if (/disability|disabled|neurodiverg|community|communities|refugee|immigrant|parent/.test(q)) {
    return { key: "community_membership", label: question || "Community membership", sensitivity: "protected_demographic" };
  }
  if (/veteran|military service|armed forces/.test(q)) {
    return { key: "veteran_status", label: question || "Veteran status", sensitivity: "protected_demographic" };
  }
  if (/work authorization|work authorisation|right to work|visa|sponsorship|legally authorized|legally authorised|security clearance/.test(q)) {
    return { key: "work_authorization_or_sponsorship", label: question || "Work authorization or sponsorship", sensitivity: "legal" };
  }
  if (/nationality|citizenship|citizen/.test(q)) {
    return { key: "country_or_nationality", label: question || "Nationality or citizenship", sensitivity: "legal" };
  }
  if (/country/.test(q) && /residence|current|address|location|based|live/.test(q)) {
    return { key: "residence_country", label: question || "Country of residence", sensitivity: "standard" };
  }
  if (/salary|compensation|expected pay|desired pay|pay range/.test(q)) {
    return { key: "compensation_preference", label: question || "Compensation preference", sensitivity: "preference" };
  }
  if (/notice period|start date|available to start|availability/.test(q)) {
    return { key: "availability_preference", label: question || "Availability preference", sensitivity: "preference" };
  }
  if (/how did hear|heard about|referral|source role|source job|job source/.test(q)) {
    return { key: "referral_source", label: question || "Referral source", sensitivity: "standard" };
  }
  if (/data retention|privacy policy|terms|consent|agree|acknowledge/.test(q)) {
    return { key: "consent_acknowledgement", label: question || "Consent acknowledgement", sensitivity: "consent" };
  }
  if (/why .*new job|why considering|what matters most|career move|most fulfilling|projects.*why|work.*fulfilling/.test(q)) {
    return { key: `preference_${normalize(question || memory.normalizedQuestion).slice(0, 70)}`, label: question || "Application preference", sensitivity: "preference" };
  }
  if (/work style|management style|environment|remote|hybrid|office/.test(q)) {
    return { key: `work_style_${normalize(question || memory.normalizedQuestion).slice(0, 70)}`, label: question || "Work style", sensitivity: "preference" };
  }

  return {
    key: `captured_${stableKey(question || memory.normalizedQuestion)}`,
    label: question || "Captured answer",
    sensitivity: "standard",
  };
}

function contactValueSet(profile: StoredProfile | null): Set<string> {
  const contact = profile?.resume.contact;
  return new Set(
    [
      contact?.name,
      contact?.email,
      contact?.phone,
      contact?.location,
      contact?.linkedin,
      contact?.github,
      contact?.website,
      contact?.title,
    ]
      .map(normalize)
      .filter(Boolean),
  );
}

function questionAcceptsContactValue(memory: ExtensionFieldMemory): boolean {
  const q = normalize(questionFor(memory));
  return /name|email|phone|mobile|telephone|location|address|city|linkedin|github|website|portfolio|current title|job title/.test(q);
}

function isLikelyCorruptMemory(memory: ExtensionFieldMemory, profile: StoredProfile | null): boolean {
  const value = normalize(memory.answer.value);
  if (!value) return true;
  if (!questionAcceptsContactValue(memory) && contactValueSet(profile).has(value)) return true;
  if (value.length < 2) return true;
  return false;
}

function factFromMemory(memory: ExtensionFieldMemory, profile: StoredProfile | null): ProfileEnrichmentFact | null {
  if (isLikelyCorruptMemory(memory, profile)) return null;
  const classification = classifyMemory(memory);
  if (!classification) return null;
  const value = clean(memory.answer.optionLabel || memory.answer.label || memory.answer.value, 400);
  if (!value) return null;
  return {
    key: classification.key,
    label: classification.label,
    value,
    sensitivity: classification.sensitivity,
    source: "captured_answer",
    sourceMemoryIds: [memory.id],
    confidence: 1,
    updatedAt: memory.updatedAt,
  };
}

function mergeFacts(facts: ProfileEnrichmentFact[]): {
  facts: ProfileEnrichmentFact[];
  sensitiveFacts: ProfileEnrichmentFact[];
  conflicts: ProfileEnrichmentConflict[];
} {
  const byKey = new Map<string, ProfileEnrichmentFact[]>();
  for (const fact of facts) byKey.set(fact.key, [...(byKey.get(fact.key) ?? []), fact]);

  const merged: ProfileEnrichmentFact[] = [];
  const conflicts: ProfileEnrichmentConflict[] = [];
  for (const group of byKey.values()) {
    const sorted = [...group].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    const latest = sorted[0];
    const values = [...new Set(sorted.map((fact) => fact.value).filter(Boolean))];
    const sourceMemoryIds = [...new Set(sorted.flatMap((fact) => fact.sourceMemoryIds))];
    merged.push({ ...latest, sourceMemoryIds });
    if (values.length > 1) {
      conflicts.push({
        key: latest.key,
        label: latest.label,
        values,
        sourceMemoryIds,
        resolvedValue: latest.value,
      });
    }
  }

  const sensitiveFacts = merged.filter((fact) =>
    ["protected_demographic", "legal", "consent"].includes(fact.sensitivity),
  );
  const normalFacts = merged.filter((fact) => !sensitiveFacts.includes(fact));
  return { facts: normalFacts, sensitiveFacts, conflicts };
}

export async function getProfileEnrichment(userId: string): Promise<StoredProfileEnrichment | null> {
  return (await getEnrichmentStore()).getProfileEnrichment(userId);
}

export async function refreshProfileEnrichment(
  userId: string,
): Promise<{ enrichment: StoredProfileEnrichment; warnings: string[] }> {
  const store = await getEnrichmentStore();
  const [profile, memories, existing] = await Promise.all([
    getProfile(userId).catch(() => null),
    store.listExtensionFieldMemories(userId),
    store.getProfileEnrichment(userId),
  ]);
  const sourceMemories = memories
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, MAX_SOURCE_MEMORIES);
  const sourceMemoryIds = sourceMemories.map((memory) => memory.id);
  const sourceMemoryUpdatedAt = sourceMemories[0]?.updatedAt;
  const candidateFacts = sourceMemories
    .map((memory) => factFromMemory(memory, profile))
    .filter((fact): fact is ProfileEnrichmentFact => Boolean(fact));
  const { facts, sensitiveFacts, conflicts } = mergeFacts(candidateFacts);

  const now = new Date().toISOString();
  const enrichment: StoredProfileEnrichment = {
    userId,
    summary: "",
    applicationPreferences: [],
    communicationStyle: [],
    facts,
    sensitiveFacts,
    conflicts,
    sourceMemoryIds,
    sourceMemoryUpdatedAt,
    version: ENRICHMENT_VERSION,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await store.saveProfileEnrichment(enrichment);
  return { enrichment, warnings: [] };
}

function editableFactToStored(
  fact: z.infer<typeof editableFactSchema>,
  now: string,
): ProfileEnrichmentFact | null {
  const value = clean(fact.value, 400);
  if (!value) return null;
  const label = clean(fact.label, 160);
  return {
    key: stableKey(fact.key || label),
    label,
    value,
    sensitivity: fact.sensitivity,
    source: "user_edited",
    sourceMemoryIds: [...new Set(fact.sourceMemoryIds ?? [])],
    confidence: fact.confidence ?? 1,
    updatedAt: now,
  };
}

export async function saveEditableProfileEnrichment(
  userId: string,
  input: EditableProfileEnrichmentInput,
): Promise<StoredProfileEnrichment> {
  const store = await getEnrichmentStore();
  const existing = await store.getProfileEnrichment(userId);
  const now = new Date().toISOString();
  const facts = input.facts
    .map((fact) => editableFactToStored(fact, now))
    .filter((fact): fact is ProfileEnrichmentFact => Boolean(fact));
  const sensitiveFacts = input.sensitiveFacts
    .map((fact) => editableFactToStored(fact, now))
    .filter((fact): fact is ProfileEnrichmentFact => Boolean(fact));

  const enrichment: StoredProfileEnrichment = {
    userId,
    summary: "",
    applicationPreferences: [],
    communicationStyle: [],
    facts,
    sensitiveFacts,
    conflicts: existing?.conflicts ?? [],
    sourceMemoryIds: existing?.sourceMemoryIds ?? [],
    sourceMemoryUpdatedAt: existing?.sourceMemoryUpdatedAt,
    version: ENRICHMENT_VERSION,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  return store.saveProfileEnrichment(enrichment);
}

export function enrichmentForPrompt(enrichment: StoredProfileEnrichment | null) {
  if (!enrichment) return null;
  return {
    capturedFacts: enrichment.facts.map((fact) => ({
      key: fact.key,
      question: fact.label,
      answer: fact.value,
      sensitivity: fact.sensitivity,
      source: fact.source,
      confidence: fact.confidence,
      updatedAt: fact.updatedAt,
    })),
    capturedSensitiveFacts: enrichment.sensitiveFacts.map((fact) => ({
      key: fact.key,
      question: fact.label,
      answer: fact.value,
      sensitivity: fact.sensitivity,
      source: fact.source,
      confidence: fact.confidence,
      updatedAt: fact.updatedAt,
    })),
    facts: enrichment.facts.map((fact) => ({
      key: fact.key,
      label: fact.label,
      value: fact.value,
      sensitivity: fact.sensitivity,
      source: fact.source,
      confidence: fact.confidence,
      updatedAt: fact.updatedAt,
    })),
    sensitiveFacts: enrichment.sensitiveFacts.map((fact) => ({
      key: fact.key,
      label: fact.label,
      value: fact.value,
      sensitivity: fact.sensitivity,
      source: fact.source,
      confidence: fact.confidence,
      updatedAt: fact.updatedAt,
    })),
    conflicts: enrichment.conflicts,
    updatedAt: enrichment.updatedAt,
  };
}
