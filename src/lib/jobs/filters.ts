import { z } from "zod";
import { DEFAULT_FILTERS, type JobSearchFilters } from "./types";

const arrangementSchema = z.enum(["remote", "hybrid", "onsite"]);
const jobTypeSchema = z.enum(["full_time", "part_time", "contract", "permanent"]);
const experienceSchema = z.enum(["intern", "entry", "mid", "senior", "lead", "director"]);
const sortSchema = z.enum(["relevance", "date", "salary"]);

const optionalFiniteNumber = z.preprocess(
  (value) => (value === "" || value == null ? undefined : value),
  z.number().finite().optional(),
);

export const jobSearchFilterSchema = z
  .object({
    keywords: z.string().trim().max(160).optional(),
    location: z.string().trim().max(160).optional(),
    country: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z]{2}$/)
      .optional(),
    distanceKm: optionalFiniteNumber.pipe(z.number().min(0).max(500).optional()),
    arrangements: z.array(arrangementSchema).max(3).optional(),
    jobTypes: z.array(jobTypeSchema).max(4).optional(),
    experience: z.array(experienceSchema).max(6).optional(),
    salaryMin: optionalFiniteNumber.pipe(z.number().min(0).max(1_000_000).optional()),
    salaryMax: optionalFiniteNumber.pipe(z.number().min(0).max(1_000_000).optional()),
    maxDaysOld: optionalFiniteNumber.pipe(z.number().int().min(1).max(60).optional()),
    visaSponsorship: z.boolean().optional(),
    sortBy: sortSchema.optional(),
    page: z.number().int().min(1).max(100).optional(),
    resultsPerPage: z.number().int().min(1).max(50).optional(),
  })
  .strict()
  .transform((body): JobSearchFilters => {
    const salaryMin = body.salaryMin;
    const salaryMax =
      body.salaryMax && salaryMin && body.salaryMax < salaryMin ? salaryMin : body.salaryMax;

    return {
      ...DEFAULT_FILTERS,
      ...body,
      salaryMax,
      arrangements: body.arrangements ?? [],
      jobTypes: body.jobTypes ?? [],
      experience: body.experience ?? [],
      page: body.page ?? DEFAULT_FILTERS.page,
      resultsPerPage: body.resultsPerPage ?? DEFAULT_FILTERS.resultsPerPage,
    };
  });
