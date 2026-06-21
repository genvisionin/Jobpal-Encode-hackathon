import { NextResponse } from "next/server";
import { z } from "zod";

export class RequestValidationError extends Error {
  constructor(
    message = "Invalid request.",
    readonly status = 400,
  ) {
    super(message);
    this.name = "RequestValidationError";
  }
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new RequestValidationError("Request body must be valid JSON.");
  }
}

export async function parseJson<T extends z.ZodType>(
  req: Request,
  schema: T,
): Promise<z.infer<T>> {
  try {
    return schema.parse(await readJson(req));
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new RequestValidationError(zodMessage(err));
    }
    throw err;
  }
}

export function zodMessage(err: z.ZodError, fallback = "Invalid request."): string {
  return err.issues[0]?.message || fallback;
}

export function validationErrorResponse(err: RequestValidationError): NextResponse {
  return NextResponse.json({ error: err.message }, { status: err.status });
}

export function parsePaper(value: string | null, fallback: "letter" | "a4"): "letter" | "a4" {
  return value === "letter" || value === "a4" ? value : fallback;
}
