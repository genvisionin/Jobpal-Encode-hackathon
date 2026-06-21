/**
 * client.ts — Azure AI Foundry chat client.
 *
 * Azure AI Foundry / Azure OpenAI exposes an OpenAI-compatible Chat
 * Completions API. This thin client supports JSON-mode responses, multimodal
 * file content (e.g. sending a PDF straight to the model), and is the single
 * place network calls to the model happen.
 *
 * When Azure isn't configured, callers should branch on `isAzureConfigured`
 * and use the mock generators instead — this client throws if asked to run
 * without credentials.
 */

import { env, isAzureConfigured } from "@/lib/env";

/** A text part of a multimodal message. */
export interface TextPart {
  type: "text";
  text: string;
}

/** A file part — sends raw file bytes (e.g. a PDF) to the model. */
export interface FilePart {
  type: "file";
  file: { filename: string; file_data: string }; // file_data is a data: URL
}

export type ContentPart = TextPart | FilePart;

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  /** Either a plain string or an array of multimodal content parts. */
  content: string | ContentPart[];
}

export interface ChatOptions {
  /** Force a JSON object response (Azure `response_format`). */
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  /** Abort the request after this many ms (default 60s). */
  timeoutMs?: number;
}

export class LLMError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "LLMError";
  }
}

function resolveUrl(): string {
  const { endpoint, deployment, apiVersion } = env.azure;
  const base = endpoint!.replace(/\/$/, "");
  // v1 / Foundry project endpoint vs classic Azure OpenAI.
  const isV1 = /\/openai\/v\d+$/.test(base) || base.includes("services.ai.azure.com");
  return isV1
    ? `${base.replace(/\/openai\/v\d+$/, "/openai/v1")}/chat/completions`
    : `${base}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
}

function isV1Surface(): boolean {
  const base = env.azure.endpoint!.replace(/\/$/, "");
  return /\/openai\/v\d+$/.test(base) || base.includes("services.ai.azure.com");
}

/**
 * Run a chat completion against Azure AI Foundry.
 * Returns the assistant message content as a string.
 */
export async function chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
  if (!isAzureConfigured) {
    throw new LLMError("Azure AI Foundry is not configured (missing API key or endpoint).");
  }

  const { apiKey, deployment } = env.azure;
  const url = resolveUrl();
  const isV1 = isV1Surface();

  const body: Record<string, unknown> = {
    messages,
    temperature: options.temperature ?? 0.4,
  };
  // The v1 surface requires the model in the body and uses
  // `max_completion_tokens` (newer models reject `max_tokens`).
  if (isV1) {
    body.model = deployment;
    body.max_completion_tokens = options.maxTokens ?? 8000;
  } else {
    body.max_tokens = options.maxTokens ?? 4000;
  }
  if (options.json) {
    body.response_format = { type: "json_object" };
  }

  // Bound the request so a slow/hung model can't block the route. Honors a
  // caller-provided signal too.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 60_000);
  if (options.signal) {
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey!,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (controller.signal.aborted) throw new LLMError("Azure Foundry request timed out.");
    throw new LLMError(`Azure Foundry request failed: ${(err as Error).message}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new LLMError(
      `Azure Foundry request failed (${res.status}): ${detail.slice(0, 300)}`,
      res.status,
    );
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new LLMError("Azure Foundry returned an empty response.");
  }
  return content;
}

/**
 * Run a chat completion and parse the result as JSON.
 * Tolerates models that wrap JSON in markdown fences.
 */
export async function chatJSON<T>(messages: ChatMessage[], options: ChatOptions = {}): Promise<T> {
  const raw = await chat(messages, { ...options, json: true });
  return parseJSONResponse<T>(raw);
}

/** Extract and parse a JSON object from a possibly-fenced LLM response. */
export function parseJSONResponse<T>(raw: string): T {
  const trimmed = raw.trim();
  // Strip ```json ... ``` fences if present.
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    // Last resort: grab the outermost {...} block.
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1)) as T;
    }
    throw new LLMError("Failed to parse JSON from model response.");
  }
}
