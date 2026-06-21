import { randomUUID } from "crypto";
import { LocalStore } from "@/lib/db/local-store";
import { getStore, type JobpalStore } from "@/lib/db/store";
import type { ExtensionFieldMemory } from "@/lib/db/types";
import type { DetectedField, FillAnswer, PageFillRequest, SkippedField } from "./types";
import { semanticOptionMatch, semanticOptionTags } from "./semantic-options";

const MIN_SIMILARITY = 0.82;
const MAX_MEMORIES = 500;
const MAX_PROMPT_MEMORIES = 120;
const MAX_CAPTURE_VALUE = 4000;
const MAX_CAPTURE_TEXT = 1000;
const MAX_CAPTURE_OPTIONS = 80;

async function getExtensionDataStore(): Promise<JobpalStore> {
  if (process.env.NODE_ENV !== "production") {
    return new LocalStore();
  }
  return getStore();
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/\b[0-9a-f]{8}(?:\s|-)[0-9a-f]{4}(?:\s|-)[0-9a-f]{4}(?:\s|-)[0-9a-f]{4}(?:\s|-)[0-9a-f]{12}\b/g, " ")
    .replace(/\b[a-z]*field\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(
      /\b(please|select|choose|enter|provide|your|the|a|an|are|is|do|does|did|you|we|us|candidate)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

export function questionTextFor(field: DetectedField): string {
  const primary = [field.label, field.placeholder]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (primary) return primary.slice(0, 500);

  const fallback = [field.context, field.autocomplete, field.name, field.idAttr]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return fallback.slice(0, 500);
}

export function questionKeyFor(field: DetectedField): string {
  return normalizeText(questionTextFor(field));
}

function tokens(value: string): Set<string> {
  return new Set(normalizeText(value).split(" ").filter((token) => token.length > 2));
}

export function memorySimilarity(a: string, b: string): number {
  const left = tokens(a);
  const right = tokens(b);
  if (!left.size || !right.size) return 0;
  const intersection = [...left].filter((token) => right.has(token)).length;
  const union = new Set([...left, ...right]).size;
  return intersection / union;
}

function memoryQuestionCandidates(memory: ExtensionFieldMemory): string[] {
  return [
    memory.questionKey,
    normalizeText(
      [
        memory.metadata.fieldLabel,
        memory.metadata.placeholder,
        memory.metadata.context,
        memory.metadata.fieldName,
        memory.metadata.fieldId,
      ]
        .filter(Boolean)
        .join(" "),
    ),
  ].filter(Boolean);
}

function fieldKind(field: DetectedField): string {
  if (field.options.length) return "option";
  if (field.tagName.toLowerCase() === "textarea") return "long_text";
  return field.inputType || field.tagName;
}

function selectedOption(field: DetectedField): { optionValue?: string; optionLabel?: string } {
  if (!field.options.length || !field.value) return {};
  const selected = field.options.find((option) => option.value === field.value || option.label === field.value);
  return {
    optionValue: selected?.value ?? field.value,
    optionLabel: selected?.label,
  };
}

function semanticQuestionTags(value: string): string[] {
  const normalized = normalizeText(value);
  const tags = new Set<string>();

  if (/gender|pronoun|sex assigned|sex at birth/.test(normalized)) tags.add("gender");
  if (/race|ethnicity|ethnic origin/.test(normalized)) tags.add("ethnicity");
  if (/disability|disabled|neurodiverg/.test(normalized)) tags.add("disability");
  if (/veteran|military service|armed forces/.test(normalized)) tags.add("veteran_status");
  if (/work authorization|work authorisation|right to work|visa|sponsorship|legally authorized|legally authorised|security clearance/.test(normalized)) {
    tags.add("work_authorization");
  }
  if (/salary|compensation|expected pay|desired pay/.test(normalized)) tags.add("compensation");
  if (/notice period|start date|available to start|availability/.test(normalized)) tags.add("availability");
  if (/how did hear|heard about|referral|source role|source job/.test(normalized)) tags.add("referral_source");
  if (/data retention|privacy policy|terms|consent|agree|acknowledge/.test(normalized)) tags.add("consent");
  if (/nationality|citizenship|citizen/.test(normalized)) tags.add("country_or_nationality");
  if (/country/.test(normalized) && /residence|current|address|location|based|live/.test(normalized)) {
    tags.add("residence_country");
  }
  if (/\bage\b|age group|date of birth|birth date/.test(normalized)) tags.add("age");

  return [...tags];
}

function truncate(value: string | undefined, max = MAX_CAPTURE_TEXT): string | undefined {
  if (!value) return value;
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function captureValue(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_CAPTURE_VALUE);
}

function captureOptions(field: DetectedField): { value: string; label: string }[] {
  return field.options.slice(0, MAX_CAPTURE_OPTIONS).map((option) => ({
    value: truncate(option.value, MAX_CAPTURE_TEXT) ?? "",
    label: truncate(option.label, MAX_CAPTURE_TEXT) ?? "",
  }));
}

function isNeverCaptured(field: DetectedField): string | null {
  const corpus = questionTextFor(field).toLowerCase();
  const type = field.inputType.toLowerCase();
  if (["hidden", "password", "file"].includes(type)) return "Sensitive or unsupported field type.";
  if (/captcha|recaptcha|verification code|one time code|otp/.test(corpus)) return "Verification field.";
  if (/credit card|card number|payment|billing|iban|bank account/.test(corpus)) return "Payment field.";
  if (/\bssn\b|social security|national insurance|passport|driver'?s license/.test(corpus)) {
    return "Government identity field.";
  }
  return null;
}

function valueForCurrentOptions(field: DetectedField, memory: ExtensionFieldMemory): string | null {
  if (!field.options.length) return memory.answer.value;
  const candidates = [
    memory.answer.optionValue,
    memory.answer.optionLabel,
    memory.answer.label,
    memory.answer.value,
  ]
    .filter(Boolean)
    .map((value) => value!.trim().toLowerCase());
  const option = field.options.find((item) => {
    const value = item.value.toLowerCase();
    const label = item.label.toLowerCase();
    return candidates.some((candidate) => candidate === value || candidate === label);
  }) ?? semanticOptionMatch(field.options, candidates.join(" "));
  return option ? option.value || option.label : null;
}

function memoryToAnswer(field: DetectedField, memory: ExtensionFieldMemory): FillAnswer | null {
  const value = valueForCurrentOptions(field, memory);
  if (!value) return null;
  return {
    fieldId: field.id,
    value,
    confidence: 0.96,
    source: "extension.field_memory",
  };
}

export async function findMemoryAnswer(
  userId: string,
  field: DetectedField,
  memories?: ExtensionFieldMemory[],
): Promise<FillAnswer | null> {
  const questionKey = questionKeyFor(field);
  if (!questionKey) return null;
  const all = memories ?? (await (await getExtensionDataStore()).listExtensionFieldMemories(userId));
  const exact = all.find((memory) => memory.questionKey === questionKey);
  if (exact) return memoryToAnswer(field, exact);

  let best: { memory: ExtensionFieldMemory; score: number } | null = null;
  for (const memory of all) {
    const score = Math.max(
      ...memoryQuestionCandidates(memory).map((candidate) => memorySimilarity(questionKey, candidate)),
    );
    if (score >= MIN_SIMILARITY && (!best || score > best.score)) {
      best = { memory, score };
    }
  }
  return best ? memoryToAnswer(field, best.memory) : null;
}

export async function captureFieldMemories(
  userId: string,
  req: PageFillRequest,
): Promise<{ captured: number; skipped: SkippedField[]; warnings: string[] }> {
  const store = await getExtensionDataStore();
  const existing = await store.listExtensionFieldMemories(userId);
  const byKey = new Map(existing.map((memory) => [memory.questionKey, memory]));
  const skipped: SkippedField[] = [];
  let captured = 0;
  if (req.fields.length === 0) {
    return {
      captured,
      skipped,
      warnings: ["No changed answers were detected on the page. Change or select a field, then capture again."],
    };
  }

  for (const field of req.fields) {
    const reason = isNeverCaptured(field);
    if (reason) {
      skipped.push({ fieldId: field.id, reason });
      continue;
    }
    const value = captureValue(field.value);
    const questionKey = questionKeyFor(field);
    if (!value || !questionKey) continue;

    const now = new Date().toISOString();
    const prior = byKey.get(questionKey);
    const option = selectedOption(field);
    const memory: ExtensionFieldMemory = {
      id: prior?.id ?? randomUUID(),
      userId,
      questionKey,
      normalizedQuestion: questionKey,
      fieldKind: fieldKind(field),
      answer: {
        value,
        label: truncate(option.optionLabel ?? value),
        optionValue: truncate(option.optionValue),
        optionLabel: truncate(option.optionLabel),
      },
      metadata: {
        sourceUrl: req.url,
        sourceTitle: truncate(req.title, 300),
        fieldLabel: truncate(field.label),
        fieldName: truncate(field.name),
        fieldId: truncate(field.idAttr),
        placeholder: truncate(field.placeholder),
        context: truncate(field.context, 1500),
        options: captureOptions(field),
      },
      captureCount: (prior?.captureCount ?? 0) + 1,
      createdAt: prior?.createdAt ?? now,
      updatedAt: now,
    };
    try {
      await store.upsertExtensionFieldMemory(memory);
      byKey.set(questionKey, memory);
      captured += 1;
    } catch (err) {
      console.error("[extension.field-memory.capture] failed field", {
        fieldId: field.id,
        label: field.label,
        err,
      });
      skipped.push({ fieldId: field.id, reason: "Could not save this captured answer." });
    }
  }

  const warnings =
    byKey.size > MAX_MEMORIES
      ? [`You have ${byKey.size} saved field memories; consider adding a cleanup UI before production scale.`]
      : [];
  return { captured, skipped, warnings };
}

export async function listFieldMemories(userId: string): Promise<ExtensionFieldMemory[]> {
  return getExtensionDataStore().then((store) => store.listExtensionFieldMemories(userId));
}

export function memoriesForPrompt(memories: ExtensionFieldMemory[]) {
  return [...memories]
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, MAX_PROMPT_MEMORIES)
    .map((memory) => ({
      id: memory.id,
      question: memory.metadata.fieldLabel || memory.metadata.placeholder || memory.normalizedQuestion,
      normalizedQuestion: memory.normalizedQuestion,
      fieldKind: memory.fieldKind,
      answer: {
        value: memory.answer.value,
        label: memory.answer.label,
        optionValue: memory.answer.optionValue,
        optionLabel: memory.answer.optionLabel,
      },
      source: {
        title: memory.metadata.sourceTitle,
        url: memory.metadata.sourceUrl,
        context: memory.metadata.context,
      },
      previousOptions: memory.metadata.options?.slice(0, 25) ?? [],
      questionTags: semanticQuestionTags(
        [memory.normalizedQuestion, memory.metadata.fieldLabel, memory.metadata.placeholder, memory.metadata.context]
          .filter(Boolean)
          .join(" "),
      ),
      answerTags: semanticOptionTags(
        [
          memory.answer.value,
          memory.answer.label,
          memory.answer.optionValue,
          memory.answer.optionLabel,
        ]
          .filter(Boolean)
          .join(" "),
      ),
      captureCount: memory.captureCount,
    }));
}
