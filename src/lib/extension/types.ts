import { z } from "zod";

export const detectedFieldSchema = z.object({
  id: z.string().min(1),
  selector: z.string().min(1).optional().default(""),
  tagName: z.string().min(1),
  inputType: z.string().optional().default(""),
  label: z.string().optional().default(""),
  name: z.string().optional().default(""),
  idAttr: z.string().optional().default(""),
  placeholder: z.string().optional().default(""),
  autocomplete: z.string().optional().default(""),
  value: z.string().optional().default(""),
  required: z.boolean().optional().default(false),
  maxLength: z.number().optional(),
  multi: z.boolean().optional().default(false),
  options: z.array(z.object({ value: z.string(), label: z.string() })).optional().default([]),
  context: z.string().optional().default(""),
});

export const pageFillRequestSchema = z.object({
  url: z.string().url().max(4000),
  title: z.string().max(300).optional().default(""),
  pageTextSummary: z.string().max(8000).optional().default(""),
  jobContext: z
    .object({
      company: z.string().max(200).optional(),
      role: z.string().max(200).optional(),
      description: z.string().max(8000).optional(),
    })
    .optional(),
  fields: z.array(detectedFieldSchema).max(200),
});

export const fillAnswerSchema = z.object({
  fieldId: z.string(),
  value: z.string(),
  confidence: z.number().min(0).max(1),
  source: z.string(),
});

export const skippedFieldSchema = z.object({
  fieldId: z.string(),
  reason: z.string(),
});

export const fillPlanSchema = z.object({
  answers: z.array(fillAnswerSchema).default([]),
  skipped: z.array(skippedFieldSchema).default([]),
  warnings: z.array(z.string()).default([]),
});

export const captureAnswersRequestSchema = pageFillRequestSchema;

export const captureAnswersResultSchema = z.object({
  captured: z.number().int().nonnegative(),
  skipped: z.array(skippedFieldSchema).default([]),
  warnings: z.array(z.string()).default([]),
});

export const contactRecommendationRequestSchema = z
  .object({
    company: z.string().trim().min(1).max(200),
    role: z.string().trim().min(1).max(200),
    location: z.string().trim().max(200).optional().default(""),
    description: z.string().trim().max(12_000).optional().default(""),
    sourceUrl: z.string().url().max(4000).optional(),
  })
  .strict();

export const contactRecommendationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  title: z.string().min(1),
  company: z.string().min(1),
  linkedinUrl: z.string().url(),
  contactType: z.enum(["recruiter", "hiring_manager", "team_lead", "exec", "peer"]),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1),
  evidence: z
    .array(
      z.object({
        title: z.string().default(""),
        url: z.string().url(),
        snippet: z.string().default(""),
      }),
    )
    .default([]),
});

export const contactRecommendationsResultSchema = z.object({
  company: z.string().min(1),
  role: z.string().min(1),
  generatedAt: z.string().min(1),
  contacts: z.array(contactRecommendationSchema).max(4).default([]),
  warnings: z.array(z.string()).default([]),
});

export type DetectedField = z.infer<typeof detectedFieldSchema>;
export type PageFillRequest = z.infer<typeof pageFillRequestSchema>;
export type FillAnswer = z.infer<typeof fillAnswerSchema>;
export type SkippedField = z.infer<typeof skippedFieldSchema>;
export type FillPlan = z.infer<typeof fillPlanSchema>;
export type CaptureAnswersRequest = z.infer<typeof captureAnswersRequestSchema>;
export type CaptureAnswersResult = z.infer<typeof captureAnswersResultSchema>;
export type ContactRecommendationRequest = z.infer<typeof contactRecommendationRequestSchema>;
export type ContactRecommendation = z.infer<typeof contactRecommendationSchema>;
export type ContactRecommendationsResult = z.infer<typeof contactRecommendationsResultSchema>;

export interface ExtensionUserSummary {
  id: string;
  email: string;
  name: string;
  title: string;
  hasProfile: boolean;
}

export interface ExtensionSessionPayload {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  user: ExtensionUserSummary;
}
