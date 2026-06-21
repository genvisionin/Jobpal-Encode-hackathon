import {
  APPLY_TRANSITION_CACHE_LIMIT,
  APPLY_TRANSITION_TTL_MS,
  GENERATED_DOCUMENT_CACHE_LIMIT,
  JOB_CONTEXT_CACHE_LIMIT,
  JOB_CONTEXT_TTL_MS,
  STORAGE_KEYS,
} from "./config";
import type {
  ApplyTransition,
  BatchApplyResult,
  CaptureAnswersResult,
  ExtensionSession,
  GeneratedDocumentResult,
  JobContextSnapshot,
  MagicFillResult,
} from "./types";

function getStorage<T>(key: string): Promise<T | undefined> {
  return chrome.storage.local.get(key).then((data) => data[key] as T | undefined);
}

function setStorage(items: Record<string, unknown>): Promise<void> {
  return chrome.storage.local.set(items);
}

export async function getSession(): Promise<ExtensionSession | undefined> {
  return getStorage<ExtensionSession>(STORAGE_KEYS.session);
}

export async function setSession(session: ExtensionSession | null): Promise<void> {
  if (!session) {
    await chrome.storage.local.remove(STORAGE_KEYS.session);
    return;
  }
  await setStorage({ [STORAGE_KEYS.session]: session });
}

export async function getEnabled(): Promise<boolean> {
  return (await getStorage<boolean>(STORAGE_KEYS.enabled)) ?? false;
}

export async function setEnabled(enabled: boolean): Promise<void> {
  await setStorage({ [STORAGE_KEYS.enabled]: enabled });
}

export async function getMagicFillIncludeCv(): Promise<boolean> {
  return (await getStorage<boolean>(STORAGE_KEYS.magicFillIncludeCv)) ?? true;
}

export async function setMagicFillIncludeCv(includeCustomCv: boolean): Promise<void> {
  await setStorage({ [STORAGE_KEYS.magicFillIncludeCv]: includeCustomCv });
}

export async function getMagicFillIncludeCoverLetter(): Promise<boolean> {
  return (await getStorage<boolean>(STORAGE_KEYS.magicFillIncludeCoverLetter)) ?? true;
}

export async function setMagicFillIncludeCoverLetter(include: boolean): Promise<void> {
  await setStorage({ [STORAGE_KEYS.magicFillIncludeCoverLetter]: include });
}

export async function getLastResult(): Promise<MagicFillResult | undefined> {
  return getStorage<MagicFillResult>(STORAGE_KEYS.lastResult);
}

export async function setLastResult(result: MagicFillResult | undefined): Promise<void> {
  if (!result) {
    await chrome.storage.local.remove(STORAGE_KEYS.lastResult);
    return;
  }
  await setStorage({ [STORAGE_KEYS.lastResult]: result });
}

export async function getLastCapture(): Promise<CaptureAnswersResult | undefined> {
  return getStorage<CaptureAnswersResult>(STORAGE_KEYS.lastCapture);
}

export async function setLastCapture(result: CaptureAnswersResult | undefined): Promise<void> {
  if (!result) {
    await chrome.storage.local.remove(STORAGE_KEYS.lastCapture);
    return;
  }
  await setStorage({ [STORAGE_KEYS.lastCapture]: result });
}

export async function getLastBatch(): Promise<BatchApplyResult | undefined> {
  return getStorage<BatchApplyResult>(STORAGE_KEYS.lastBatch);
}

export async function setLastBatch(result: BatchApplyResult | undefined): Promise<void> {
  if (!result) {
    await chrome.storage.local.remove(STORAGE_KEYS.lastBatch);
    return;
  }
  await setStorage({ [STORAGE_KEYS.lastBatch]: result });
}

export async function getLastGenerated(): Promise<GeneratedDocumentResult | undefined> {
  return getStorage<GeneratedDocumentResult>(STORAGE_KEYS.lastGenerated);
}

export async function setLastGenerated(result: GeneratedDocumentResult | undefined): Promise<void> {
  if (!result) {
    await chrome.storage.local.remove(STORAGE_KEYS.lastGenerated);
    return;
  }
  await setStorage({ [STORAGE_KEYS.lastGenerated]: result });
}

export async function getGeneratedDocuments(): Promise<GeneratedDocumentResult[]> {
  const documents = (await getStorage<GeneratedDocumentResult[]>(STORAGE_KEYS.generatedDocuments)) ?? [];
  const legacy = await getLastGenerated();
  const combined = legacy ? [legacy, ...documents] : documents;
  const seen = new Set<string>();
  return combined
    .filter((item) => item.contextId && item.cvId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .filter((item) => {
      const key = item.contextId;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, GENERATED_DOCUMENT_CACHE_LIMIT);
}

export async function upsertGeneratedDocument(result: GeneratedDocumentResult): Promise<GeneratedDocumentResult[]> {
  const documents = await getGeneratedDocuments();
  const next = [result, ...documents.filter((item) => item.contextId !== result.contextId)]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, GENERATED_DOCUMENT_CACHE_LIMIT);
  await setStorage({ [STORAGE_KEYS.generatedDocuments]: next, [STORAGE_KEYS.lastGenerated]: result });
  return next;
}

export async function clearGeneratedDocuments(): Promise<void> {
  await chrome.storage.local.remove([STORAGE_KEYS.generatedDocuments, STORAGE_KEYS.lastGenerated]);
}

function nowMs(): number {
  return Date.now();
}

function recent<T extends { capturedAt?: string; lastSeenAt?: string }>(item: T, ttlMs: number): boolean {
  const stamp = Date.parse(item.lastSeenAt || item.capturedAt || "");
  return Number.isFinite(stamp) && nowMs() - stamp <= ttlMs;
}

function trimDescription(snapshot: JobContextSnapshot): JobContextSnapshot {
  const description = snapshot.description.replace(/\s+/g, " ").trim().slice(0, 12_000);
  return {
    ...snapshot,
    description,
    descriptionLength: description.length,
    applyHints: snapshot.applyHints.slice(-8),
  };
}

export async function getJobContexts(): Promise<JobContextSnapshot[]> {
  const contexts = (await getStorage<JobContextSnapshot[]>(STORAGE_KEYS.jobContexts)) ?? [];
  return contexts.filter((item) => recent(item, JOB_CONTEXT_TTL_MS)).slice(0, JOB_CONTEXT_CACHE_LIMIT);
}

export async function setJobContexts(contexts: JobContextSnapshot[]): Promise<void> {
  const pruned = contexts
    .filter((item) => recent(item, JOB_CONTEXT_TTL_MS))
    .sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt))
    .slice(0, JOB_CONTEXT_CACHE_LIMIT)
    .map(trimDescription);
  await setStorage({ [STORAGE_KEYS.jobContexts]: pruned });
}

export async function upsertJobContext(snapshot: JobContextSnapshot): Promise<JobContextSnapshot[]> {
  const incoming = trimDescription(snapshot);
  const contexts = await getJobContexts();
  const index = contexts.findIndex(
    (item) => item.id === incoming.id || item.canonicalUrl === incoming.canonicalUrl || item.url === incoming.url,
  );
  if (index >= 0) {
    const existing = contexts[index];
    contexts[index] = {
      ...existing,
      ...incoming,
      capturedAt: existing.capturedAt || incoming.capturedAt,
      description: incoming.description.length >= existing.description.length ? incoming.description : existing.description,
      descriptionLength: Math.max(incoming.descriptionLength, existing.descriptionLength),
      applyHints: [...existing.applyHints, ...incoming.applyHints].slice(-8),
      confidence: Math.max(existing.confidence, incoming.confidence),
    };
  } else {
    contexts.unshift(incoming);
  }
  await setJobContexts(contexts);
  return getJobContexts();
}

export async function getApplyTransitions(): Promise<ApplyTransition[]> {
  const transitions = (await getStorage<ApplyTransition[]>(STORAGE_KEYS.applyTransitions)) ?? [];
  return transitions.filter((item) => recent(item, APPLY_TRANSITION_TTL_MS)).slice(0, APPLY_TRANSITION_CACHE_LIMIT);
}

export async function setApplyTransitions(transitions: ApplyTransition[]): Promise<void> {
  const pruned = transitions
    .filter((item) => recent(item, APPLY_TRANSITION_TTL_MS))
    .sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt))
    .slice(0, APPLY_TRANSITION_CACHE_LIMIT);
  await setStorage({ [STORAGE_KEYS.applyTransitions]: pruned });
}

export async function recordApplyTransition(transition: ApplyTransition): Promise<ApplyTransition[]> {
  const transitions = await getApplyTransitions();
  transitions.unshift(transition);
  await setApplyTransitions(transitions);
  return getApplyTransitions();
}
