import { allSkills, resumeToPlainText, type ResumeData, type ResumeEntry } from "@/lib/schema";
import type { ProfileEnrichmentFact, StoredProfile, StoredProfileEnrichment } from "@/lib/db/types";

export interface StructuredProfileFactRow {
  key: string;
  label: string;
  value: string;
  category: string;
  source: "resume" | "career_insights" | "captured_answer" | "user_edited";
  sensitivity?: ProfileEnrichmentFact["sensitivity"];
}

export interface StructuredCandidateContext {
  identity: {
    fullName: string;
    firstName: string;
    lastName: string;
    currentTitle: string;
  };
  contact: {
    email: string;
    phone: string;
    linkedin: string;
    github: string;
    website: string;
  };
  location: {
    raw: string;
    city: string;
    region: string;
    country: string;
  };
  demographics: {
    age: number | null;
    ageRange: string;
    dateOfBirth: string;
  };
  education: Array<{
    school: string;
    degree: string;
    location: string;
    start: string;
    end: string;
    highlights: string[];
  }>;
  experience: Array<{
    title: string;
    organization: string;
    location: string;
    start: string;
    end: string;
    summary: string;
    highlights: string[];
    tags: string[];
  }>;
  skills: string[];
  career: {
    headline: string;
    archetypes: string[];
    keySkills: string[];
    coreStrengths: string[];
    proofPoints: Array<{
      headline: string;
      detail: string;
      metrics: string[];
      skills: string[];
    }>;
  };
  applicationFacts: Array<{
    key: string;
    question: string;
    answer: string;
    sensitivity: ProfileEnrichmentFact["sensitivity"];
    source: ProfileEnrichmentFact["source"];
    confidence: number;
  }>;
  factTable: StructuredProfileFactRow[];
  fallbackResumeText: string;
}

const COUNTRY_ALIASES: Record<string, string> = {
  uk: "United Kingdom",
  "u k": "United Kingdom",
  gb: "United Kingdom",
  "great britain": "United Kingdom",
  britain: "United Kingdom",
  england: "United Kingdom",
  scotland: "United Kingdom",
  wales: "United Kingdom",
  "northern ireland": "United Kingdom",
  usa: "United States",
  us: "United States",
  "u s": "United States",
  america: "United States",
};

function clean(value: string | undefined, max = 500): string {
  return (value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalize(value: string | undefined): string {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values: string[], limit = 80): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values.map((item) => clean(item)).filter(Boolean)) {
    const key = normalize(value);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= limit) break;
  }
  return out;
}

function nameParts(fullName: string): { firstName: string; lastName: string } {
  const parts = clean(fullName).split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
}

function canonicalCountry(value: string): string {
  const normalized = normalize(value);
  return COUNTRY_ALIASES[normalized] ?? clean(value);
}

export function parseLocation(value: string): StructuredCandidateContext["location"] {
  const raw = clean(value);
  if (!raw) return { raw: "", city: "", region: "", country: "" };
  const parts = raw
    .split(/[,|/]+/)
    .map((part) => clean(part))
    .filter(Boolean);
  if (!parts.length) return { raw, city: raw, region: "", country: "" };

  const last = parts[parts.length - 1] ?? "";
  const country = canonicalCountry(last);
  const countryDetected = Boolean(COUNTRY_ALIASES[normalize(last)] || parts.length > 1);
  return {
    raw,
    city: parts[0] ?? "",
    region: parts.length > 2 ? parts.slice(1, -1).join(", ") : "",
    country: countryDetected ? country : "",
  };
}

function entryHighlights(entry: ResumeEntry, limit = 4): string[] {
  return unique([entry.description, ...entry.bullets].filter(Boolean), limit);
}

function educationEntries(resume: ResumeData): StructuredCandidateContext["education"] {
  return resume.sections
    .filter((section) => section.kind === "education")
    .flatMap((section) => section.entries)
    .map((entry) => ({
      school: clean(entry.organization),
      degree: clean(entry.title),
      location: clean(entry.location),
      start: clean(entry.start),
      end: clean(entry.end),
      highlights: entryHighlights(entry, 3),
    }))
    .filter((entry) => entry.school || entry.degree)
    .slice(0, 8);
}

function experienceEntries(resume: ResumeData): StructuredCandidateContext["experience"] {
  return resume.sections
    .filter((section) => section.kind === "experience" || section.kind === "projects")
    .flatMap((section) => section.entries)
    .map((entry) => ({
      title: clean(entry.title),
      organization: clean(entry.organization),
      location: clean(entry.location),
      start: clean(entry.start),
      end: clean(entry.end),
      summary: clean(entry.description, 700),
      highlights: entryHighlights(entry, 5),
      tags: unique(entry.tags, 16),
    }))
    .filter((entry) => entry.title || entry.organization || entry.summary || entry.highlights.length)
    .slice(0, 12);
}

function factMatches(fact: ProfileEnrichmentFact, patterns: RegExp[]): boolean {
  const text = normalize(`${fact.key} ${fact.label}`);
  return patterns.some((pattern) => pattern.test(text));
}

function ageFromValue(value: string): number | null {
  const match = clean(value).match(/\b(1[6-9]|[2-9][0-9])\b/);
  if (!match) return null;
  const age = Number(match[1]);
  return Number.isFinite(age) && age >= 16 && age <= 99 ? age : null;
}

function ageFromDateOfBirth(value: string, now = new Date()): number | null {
  const raw = clean(value);
  const iso = raw.match(/\b(19[3-9][0-9]|20[0-1][0-9])[-/.](0?[1-9]|1[0-2])[-/.](0?[1-9]|[12][0-9]|3[01])\b/);
  const dmy = raw.match(/\b(0?[1-9]|[12][0-9]|3[01])[-/.](0?[1-9]|1[0-2])[-/.](19[3-9][0-9]|20[0-1][0-9])\b/);
  const parts = iso
    ? { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) }
    : dmy
      ? { year: Number(dmy[3]), month: Number(dmy[2]), day: Number(dmy[1]) }
      : null;
  if (!parts) return null;
  let age = now.getFullYear() - parts.year;
  const birthdayPassed =
    now.getMonth() + 1 > parts.month || (now.getMonth() + 1 === parts.month && now.getDate() >= parts.day);
  if (!birthdayPassed) age -= 1;
  return age >= 16 && age <= 99 ? age : null;
}

function demographicsFromFacts(facts: ProfileEnrichmentFact[]): StructuredCandidateContext["demographics"] {
  const ageFact = facts.find((fact) => factMatches(fact, [/\bage\b/, /date of birth/, /birth date/, /\bdob\b/]));
  const birthFact = facts.find((fact) => factMatches(fact, [/date of birth/, /birth date/, /\bdob\b/]));
  const age = ageFact ? ageFromValue(ageFact.value) ?? ageFromDateOfBirth(ageFact.value) : null;
  return {
    age,
    ageRange: ageFact && age === null ? clean(ageFact.value) : "",
    dateOfBirth: birthFact ? clean(birthFact.value) : "",
  };
}

function factRowsFromProfile(
  profile: StoredProfile,
  education: StructuredCandidateContext["education"],
  experience: StructuredCandidateContext["experience"],
  skills: string[],
  location: StructuredCandidateContext["location"],
): StructuredProfileFactRow[] {
  const { contact } = profile.resume;
  const { firstName, lastName } = nameParts(contact.name);
  const rows: StructuredProfileFactRow[] = [];
  const add = (category: string, key: string, label: string, value: string, source: StructuredProfileFactRow["source"] = "resume") => {
    const cleaned = clean(value, 900);
    if (!cleaned) return;
    rows.push({ category, key, label, value: cleaned, source });
  };

  add("Identity", "full_name", "Full name", contact.name);
  add("Identity", "first_name", "First name", firstName);
  add("Identity", "last_name", "Last name", lastName);
  add("Identity", "current_title", "Current title", contact.title);
  add("Contact", "email", "Email", contact.email);
  add("Contact", "phone", "Phone", contact.phone);
  add("Location", "current_location", "Current location", location.raw);
  add("Location", "city", "City", location.city);
  add("Location", "region", "Region", location.region);
  add("Location", "country", "Country", location.country);
  add("Links", "linkedin", "LinkedIn", contact.linkedin);
  add("Links", "github", "GitHub", contact.github);
  add("Links", "website", "Website", contact.website);

  const topEducation = education[0];
  if (topEducation) {
    add("Education", "university", "University / school", topEducation.school);
    add("Education", "degree", "Degree / course", topEducation.degree);
    add("Education", "education_end", "Graduation / end", topEducation.end);
  }

  const topExperience = experience[0];
  if (topExperience) {
    add("Experience", "current_role", "Current / recent role", topExperience.title);
    add("Experience", "current_company", "Current / recent company", topExperience.organization);
  }

  add("Skills", "top_skills", "Top skills", skills.slice(0, 24).join(", "));
  return rows;
}

function rowsFromCapturedFacts(facts: ProfileEnrichmentFact[]): StructuredProfileFactRow[] {
  return facts.map((fact) => ({
    key: fact.key,
    label: fact.label,
    value: clean(fact.value, 900),
    category:
      fact.sensitivity === "preference"
        ? "Preferences"
        : fact.sensitivity === "standard"
          ? "Application facts"
          : "Sensitive facts",
    source: fact.source === "user_edited" ? "user_edited" : "captured_answer",
    sensitivity: fact.sensitivity,
  }));
}

export function structuredProfileRows(
  profile: StoredProfile | { resume: ResumeData; insights?: StoredProfile["insights"] },
  enrichment: StoredProfileEnrichment | null = null,
): StructuredProfileFactRow[] {
  const storedProfile: StoredProfile = {
    userId: "preview",
    resume: profile.resume,
    insights: profile.insights,
    source: "builder",
    updatedAt: "",
  };
  const education = educationEntries(storedProfile.resume);
  const experience = experienceEntries(storedProfile.resume);
  const skills = unique([...allSkills(storedProfile.resume), ...(storedProfile.insights?.keySkills ?? [])], 80);
  const location = parseLocation(storedProfile.resume.contact.location);
  const rows = [
    ...factRowsFromProfile(storedProfile, education, experience, skills, location),
    ...rowsFromCapturedFacts([...(enrichment?.facts ?? []), ...(enrichment?.sensitiveFacts ?? [])]),
  ];
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.category}:${row.key}:${normalize(row.value)}`;
    if (!row.value || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildStructuredCandidateContext(
  profile: StoredProfile,
  enrichment: StoredProfileEnrichment | null = null,
): StructuredCandidateContext {
  const { contact } = profile.resume;
  const { firstName, lastName } = nameParts(contact.name);
  const allFacts = [...(enrichment?.facts ?? []), ...(enrichment?.sensitiveFacts ?? [])];
  const education = educationEntries(profile.resume);
  const experience = experienceEntries(profile.resume);
  const skills = unique([...allSkills(profile.resume), ...(profile.insights?.keySkills ?? [])], 80);
  const location = parseLocation(contact.location);

  return {
    identity: {
      fullName: clean(contact.name),
      firstName,
      lastName,
      currentTitle: clean(contact.title),
    },
    contact: {
      email: clean(contact.email),
      phone: clean(contact.phone),
      linkedin: clean(contact.linkedin),
      github: clean(contact.github),
      website: clean(contact.website),
    },
    location,
    demographics: demographicsFromFacts(allFacts),
    education,
    experience,
    skills,
    career: {
      headline: clean(profile.insights?.headline),
      archetypes: unique(profile.insights?.archetypes.map((item) => item.name) ?? [], 8),
      keySkills: unique(profile.insights?.keySkills ?? [], 30),
      coreStrengths: unique(profile.insights?.coreStrengths ?? [], 20),
      proofPoints:
        profile.insights?.proofPoints.slice(0, 8).map((point) => ({
          headline: clean(point.headline, 220),
          detail: clean(point.detail, 500),
          metrics: unique(point.metrics, 8),
          skills: unique(point.skills, 12),
        })) ?? [],
    },
    applicationFacts: allFacts.map((fact) => ({
      key: fact.key,
      question: fact.label,
      answer: fact.value,
      sensitivity: fact.sensitivity,
      source: fact.source,
      confidence: fact.confidence,
    })),
    factTable: structuredProfileRows(profile, enrichment),
    fallbackResumeText: resumeToPlainText(profile.resume).slice(0, 12_000),
  };
}
