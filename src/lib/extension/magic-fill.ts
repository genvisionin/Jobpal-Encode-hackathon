import { isAzureConfigured } from "@/lib/env";
import { chatJSON, LLMError } from "@/lib/llm";
import { allSkills } from "@/lib/schema";
import type { ExtensionFieldMemory, StoredProfile, StoredProfileEnrichment } from "@/lib/db/types";
import type { DetectedField, FillAnswer, FillPlan, PageFillRequest, SkippedField } from "./types";
import { fillPlanSchema } from "./types";
import { findMemoryAnswer, listFieldMemories, memoriesForPrompt } from "./field-memory";
import { enrichmentForPrompt, getProfileEnrichment } from "./profile-enrichment";
import { normalizeOptionText, semanticOptionMatch, type OptionLike } from "./semantic-options";
import { buildStructuredCandidateContext, type StructuredCandidateContext } from "./structured-profile";

const HIGH_CONFIDENCE = 0.6;
const MAX_MODEL_FIELDS = 40;
const OPTION_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "been",
  "but",
  "by",
  "do",
  "for",
  "from",
  "have",
  "i",
  "im",
  "in",
  "is",
  "it",
  "my",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
  "you",
  "your",
]);

function corpusFor(field: DetectedField): string {
  return [field.label, field.name, field.idAttr, field.placeholder, field.autocomplete, field.context]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function includesAny(text: string, terms: RegExp[]): boolean {
  return terms.some((term) => term.test(text));
}

function optionTokens(value: string): Set<string> {
  return new Set(
    normalizeOptionText(value)
      .split(" ")
      .filter((token) => token.length > 2 && !OPTION_STOPWORDS.has(token)),
  );
}

function tokenOverlapOptionMatch(options: OptionLike[], wanted: string): OptionLike | null {
  const wantedTokens = optionTokens(wanted);
  if (wantedTokens.size === 0) return null;
  const scored = options
    .map((option) => {
      const optionTokensSet = optionTokens(`${option.value} ${option.label}`);
      const shared = [...wantedTokens].filter((token) => optionTokensSet.has(token)).length;
      const score = shared / Math.max(1, Math.min(wantedTokens.size, optionTokensSet.size));
      return { option, score, shared };
    })
    .filter((item) => item.shared >= 2 || item.score >= 0.66)
    .sort((a, b) => b.score - a.score || b.shared - a.shared);
  if (!scored.length) return null;
  if (scored[1] && scored[1].score >= scored[0].score - 0.05) return null;
  return scored[0].option;
}

function firstNumber(value: string): number | null {
  const match = normalizeOptionText(value).match(/\b\d+(?:\.\d+)?\b/);
  if (!match) return null;
  const number = Number(match[0]);
  return Number.isFinite(number) ? number : null;
}

function numericRangeForOption(option: OptionLike): { min: number; max: number } | null {
  const text = normalizeOptionText(`${option.label} ${option.value}`);
  const range = text.match(/\b(\d+(?:\.\d+)?)\s*(?:to|through|-)\s*(\d+(?:\.\d+)?)\b/);
  if (range) {
    const left = Number(range[1]);
    const right = Number(range[2]);
    if (Number.isFinite(left) && Number.isFinite(right)) {
      return { min: Math.min(left, right), max: Math.max(left, right) };
    }
  }

  const plus = text.match(/\b(\d+(?:\.\d+)?)\s*(?:plus|and over|or older|or more|or above)\b/);
  if (plus) {
    const min = Number(plus[1]);
    return Number.isFinite(min) ? { min, max: Number.POSITIVE_INFINITY } : null;
  }

  const under = text.match(/\b(?:under|less than|below|younger than)\s*(\d+(?:\.\d+)?)\b/);
  if (under) {
    const max = Number(under[1]);
    return Number.isFinite(max) ? { min: Number.NEGATIVE_INFINITY, max: max - 0.0001 } : null;
  }

  const over = text.match(/\b(?:over|more than|above|older than)\s*(\d+(?:\.\d+)?)\b/);
  if (over) {
    const min = Number(over[1]);
    return Number.isFinite(min) ? { min: min + 0.0001, max: Number.POSITIVE_INFINITY } : null;
  }

  return null;
}

function numericRangeOptionMatch(options: OptionLike[], wanted: string): OptionLike | null {
  const number = firstNumber(wanted);
  if (number === null) return null;
  const matches = options
    .map((option) => {
      const range = numericRangeForOption(option);
      if (!range || number < range.min || number > range.max) return null;
      const width = range.max === Number.POSITIVE_INFINITY ? 999 : range.max - range.min;
      return { option, width };
    })
    .filter((item): item is { option: OptionLike; width: number } => Boolean(item))
    .sort((a, b) => a.width - b.width);
  return matches[0]?.option ?? null;
}

function neverFillReason(field: DetectedField): string | null {
  const c = corpusFor(field);
  const type = field.inputType.toLowerCase();
  if (["hidden", "password", "file"].includes(type) || includesAny(c, [/\bpassword\b/])) {
    return "Sensitive or unsupported field type.";
  }
  if (includesAny(c, [/captcha|recaptcha|verification code|one time code|otp/])) return "Verification field.";
  if (includesAny(c, [/credit card|card number|payment|billing|iban|bank account/])) return "Payment field.";
  if (includesAny(c, [/\bssn\b|social security|national insurance|passport|driver'?s license/])) return "Government identity field.";
  return null;
}

function memoryOnlyReason(field: DetectedField): string | null {
  const c = corpusFor(field);
  if (
    includesAny(c, [
      /gender|race|ethnicity|veteran|disability|sexual orientation|pronouns/,
      /voluntary self-identification|equal employment|eeo/,
    ])
  ) {
    return "Voluntary demographic field.";
  }
  if (includesAny(c, [/work authorization|sponsorship|visa|legally authorized|security clearance/])) {
    return "Legal/work-authorization answer not stored in profile.";
  }
  if (includesAny(c, [/nationality|citizenship|\bcitizen\b/])) {
    return "Nationality or citizenship answer not stored in profile.";
  }
  if (includesAny(c, [/salary|compensation|expected pay|desired pay|notice period|start date|available to start/])) {
    return "Preference or availability answer not stored in profile.";
  }
  if (includesAny(c, [/how did you hear|heard about|referral source|source.*role|source.*job/])) {
    return "Referral/source answer not stored in profile.";
  }
  if (includesAny(c, [/data retention|privacy policy|terms|consent|i agree|acknowledge/])) {
    return "Consent or policy acknowledgement requires saved answer memory.";
  }
  return null;
}

function optionValue(field: DetectedField, wanted: string): string {
  if (!field.options.length) return wanted;
  const normalized = normalizeOptionText(wanted);
  const options = field.options.filter((o) => o.value || o.label);
  const exact = options.find((o) => normalizeOptionText(o.value) === normalized || normalizeOptionText(o.label) === normalized);
  if (exact) return exact.value || exact.label;
  const semantic = semanticOptionMatch(options, wanted);
  if (semantic) return semantic.value || semantic.label;
  const numericRange = numericRangeOptionMatch(options, wanted);
  if (numericRange) return numericRange.value || numericRange.label;
  const tokenOverlap = tokenOverlapOptionMatch(options, wanted);
  if (tokenOverlap) return tokenOverlap.value || tokenOverlap.label;
  const contains = options.find((o) => {
    const label = normalizeOptionText(o.label);
    return normalized.length > 2 && (label.includes(normalized) || normalized.includes(label));
  });
  return contains?.value || contains?.label || wanted;
}

function isOptionField(field: DetectedField): boolean {
  const type = field.inputType.toLowerCase();
  return field.options.length > 0 || ["select", "radio", "checkbox", "combobox"].includes(type);
}

function existingValueReason(field: DetectedField): string | null {
  if (!field.value.replace(/\s+/g, " ").trim()) return null;
  return "Already filled on the page; preserving the existing answer.";
}

// A field that should contain a link/URL rather than free text.
function isUrlField(field: DetectedField): boolean {
  if (field.inputType.toLowerCase() === "url") return true;
  const c = corpusFor(field);
  return /portfolio|linkedin|github|gitlab|behance|dribbble|personal (web)?site|\bwebsite\b|\bweb ?site\b|\burl\b|profile link|link to your|portfolio link|your site/.test(
    c,
  );
}

// Turn a bare domain/handle into a complete, valid absolute URL so link fields
// never receive something like "johndoe.com" instead of "https://johndoe.com".
// Applies to deterministic profile values and model output alike.
function normalizeUrlValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed)) return trimmed; // free text, not a single link
  if (/^https?:\/\//i.test(trimmed)) return trimmed; // already absolute
  if (/^mailto:/i.test(trimmed)) return trimmed;
  // Bare domain, optional path: johndoe.com, www.x.io/portfolio, linkedin.com/in/x
  if (/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(trimmed)) {
    return `https://${trimmed.replace(/^\/+/, "")}`;
  }
  return trimmed;
}

function deterministicAnswer(
  field: DetectedField,
  profile: StoredProfile,
  structuredProfile: StructuredCandidateContext,
): FillAnswer | SkippedField | null {
  const contact = profile.resume.contact;
  const education = structuredProfile.education[0];
  const experience = structuredProfile.experience[0];
  const c = corpusFor(field);
  const sensitive = neverFillReason(field) || memoryOnlyReason(field);
  if (sensitive) return { fieldId: field.id, reason: sensitive };

  const fullName = contact.name.trim();
  const [firstName, ...rest] = fullName.split(/\s+/);
  const lastName = rest.join(" ");
  const candidates: [RegExp[], string, string][] = [
    [[/\bfirst name\b/, /\bgiven name\b/, /\bgiven-name\b/, /\bfirst_name\b/], firstName, "profile.contact.name"],
    [[/\blast name\b/, /\bfamily name\b/, /\bsurname\b/, /\bfamily-name\b/, /\blast_name\b/], lastName, "profile.contact.name"],
    [[/\bfull name\b/, /^name$/, /\bcandidate name\b/, /\bautocomplete name\b/], fullName, "profile.contact.name"],
    [[/email|e-mail/], contact.email, "profile.contact.email"],
    [[/phone|mobile|telephone|\btel\b/], contact.phone, "profile.contact.phone"],
    [[/linkedin/], contact.linkedin, "profile.contact.linkedin"],
    [[/github/], contact.github, "profile.contact.github"],
    [[/portfolio|website|personal site/], contact.website, "profile.contact.website"],
    [[/\bcurrent title\b|\bjob title\b|\bheadline\b|current role/], contact.title, "profile.contact.title"],
    [[/\bcurrent company\b|\bcurrent employer\b|\bemployer\b|\bcompany\b/], experience?.organization ?? "", "profile.experience.organization"],
    [[/\buniversity\b|\bschool\b|\bcollege\b|\binstitution\b/], education?.school ?? "", "profile.education.school"],
    [[/\bdegree\b|\bcourse\b|\bprogramme\b|\bprogram\b|\bmajor\b|\bqualification\b/], education?.degree ?? "", "profile.education.degree"],
    [[/\bgraduation\b|\bgraduated\b|\beducation end\b|\bcompletion year\b/], education?.end ?? "", "profile.education.end"],
    [[/\bcountry\b|\bcountry-name\b|\bcountry of residence\b|\bcurrent country\b|\baddress country\b|\bcountry\/region\b|\bcountry region\b/], structuredProfile.location.country, "profile.location.country"],
    [[/\bregion\b|\bstate\b|\bprovince\b|\bcounty\b|\baddress-level1\b/], structuredProfile.location.region, "profile.location.region"],
    [[/\bcurrent location\b|\blocation\b|\bcity\b|\baddress city\b|\baddress-level2\b/], contact.location, "profile.contact.location"],
  ];

  for (const [patterns, value, source] of candidates) {
    if (value && includesAny(c, patterns)) {
      return {
        fieldId: field.id,
        value: optionValue(field, value),
        confidence: 0.98,
        source,
      };
    }
  }
  return null;
}

function shouldAskModel(field: DetectedField): boolean {
  if (neverFillReason(field)) return false;
  if (memoryOnlyReason(field)) return true;
  const c = corpusFor(field);
  const type = field.inputType.toLowerCase();
  const tagName = field.tagName.toLowerCase();
  const prompt = [field.label, field.placeholder, field.context].filter(Boolean).join(" ").trim();
  if (!prompt && !field.name && !field.idAttr) return false;
  if (field.value.trim() && !isOptionField(field)) return false;
  if (tagName === "textarea" || type === "textarea") return true;
  if (["select", "radio", "checkbox", "number", "combobox"].includes(type)) return true;
  if (field.options.length > 0) return true;
  if (field.tagName.toLowerCase() === "textarea") return true;
  if (
    includesAny(c, [
      /\?/,
      /\bwhy\b|\bhow\b|\bwhat\b|\bwhich\b|\bwhen\b/,
      /cover letter|additional information|tell us|describe|explain|summari[sz]e|motivation|interest/,
      /experience with|years of|proficien|skill|education|degree|school|university|certification/,
    ])
  ) {
    return true;
  }
  return field.maxLength != null && field.maxLength > 80;
}

function enrichmentKeyForText(text: string): string | null {
  const c = text.toLowerCase();
  if (/\bage\b|age group|current age|date of birth|birth date/.test(c)) return "age_range";
  if (/gender|pronoun|sex assigned|sex at birth/.test(c)) return "gender_identity";
  if (/race|racial|ethnicity|ethnic origin|ethnic identity/.test(c)) return "racial_ethnic_identity";
  if (/disability|disabled|neurodiverg|community|communities|refugee|immigrant|parent/.test(c)) {
    return "community_membership";
  }
  if (/veteran|military service|armed forces/.test(c)) return "veteran_status";
  if (/work authorization|work authorisation|visa|sponsorship|legally authorized|legally authorised|security clearance/.test(c)) {
    return "work_authorization_or_sponsorship";
  }
  if (/nationality|citizenship|citizen/.test(c)) return "country_or_nationality";
  if (/country/.test(c) && /residence|current|address|location|based|live/.test(c)) return "residence_country";
  if (/salary|compensation|expected pay|desired pay|pay range/.test(c)) return "compensation_preference";
  if (/notice period|start date|available to start|availability/.test(c)) return "availability_preference";
  if (/how did you hear|heard about|referral source|source.*role|source.*job|job source/.test(c)) return "referral_source";
  if (/data retention|privacy policy|terms|consent|i agree|acknowledge/.test(c)) return "consent_acknowledgement";
  return null;
}

function enrichmentKeyForField(field: DetectedField): string | null {
  return enrichmentKeyForText(corpusFor(field));
}

function enrichmentAnswer(field: DetectedField, enrichment: StoredProfileEnrichment | null): FillAnswer | null {
  if (!enrichment) return null;
  const key = enrichmentKeyForField(field);
  if (!key) return null;
  const fact = [...enrichment.sensitiveFacts, ...enrichment.facts]
    .filter((item) => item.key === key || enrichmentKeyForText(`${item.key} ${item.label}`) === key)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
  if (!fact?.value) return null;
  return {
    fieldId: field.id,
    value: optionValue(field, fact.value),
    confidence: fact.confidence,
    source:
      fact.sensitivity === "protected_demographic" || fact.sensitivity === "legal" || fact.sensitivity === "consent"
        ? `profile_enrichment.sensitive_fact:${fact.key}`
        : `profile_enrichment.fact:${fact.key}`,
  };
}

function mockLongAnswer(field: DetectedField, profile: StoredProfile, req: PageFillRequest): FillAnswer | null {
  const text = corpusFor(field);
  const contact = profile.resume.contact;
  const skills = allSkills(profile.resume).slice(0, 5).join(", ");
  const company = req.jobContext?.company || "the team";
  const role = req.jobContext?.role || "this role";
  const summary = profile.resume.summary || profile.insights?.narrative || profile.insights?.headline;
  if (!summary && !skills) return null;

  let value = "";
  if (/why .*company|why .*role|interest|motivation/.test(text)) {
    value = `I am interested in ${role} at ${company} because it aligns with my background in ${skills || contact.title}. ${summary || ""}`.trim();
  } else if (/additional information|tell us|anything else|cover letter/.test(text)) {
    value = `${summary || `My background is strongest in ${skills}.`} I would welcome the chance to bring that experience to ${company}.`;
  } else if (/experience with|describe|explain|summari[sz]e|background|qualification/.test(text)) {
    value = summary || `My relevant background includes ${skills}.`;
  } else {
    return null;
  }
  return { fieldId: field.id, value, confidence: 0.78, source: "profile.summary" };
}

function profileExample(profile: StoredProfile): string {
  const sections = profile.resume.sections.filter((section) => ["experience", "projects", "education", "custom"].includes(section.kind));
  for (const section of sections) {
    for (const entry of section.entries) {
      const headline = [entry.title, entry.organization].filter(Boolean).join(" at ");
      const detail = entry.bullets[0] || entry.description;
      if (headline && detail) return `${headline}, where I ${detail.replace(/\.$/, "")}.`;
      if (detail) return detail;
      if (headline) return headline;
    }
  }
  return "";
}

function bestEffortProfileAnswer(field: DetectedField, profile: StoredProfile, req: PageFillRequest): FillAnswer | null {
  if (neverFillReason(field) || memoryOnlyReason(field) || isOptionField(field)) return null;
  if (!shouldAskModel(field)) return null;

  const text = corpusFor(field);
  const contact = profile.resume.contact;
  const skills = allSkills(profile.resume).slice(0, 6).join(", ");
  const summary = profile.resume.summary || profile.insights?.narrative || profile.insights?.headline;
  const example = profileExample(profile);
  const company = req.jobContext?.company || "your team";
  const role = req.jobContext?.role || "this role";

  if (!summary && !skills && !example && !contact.title) return null;

  // Only synthesize an answer for genuinely open-ended "about you / motivation /
  // experience" prompts. For any other free-text field (e.g. "list your other
  // languages", "what are your salary expectations") a profile-summary dump is
  // WRONG, so we return null and let the field be skipped rather than filled
  // with irrelevant content.
  const isMotivation = /\bwhy\b|interest(ed)?|motivat|attract|appeal|career move|excite|drawn to|keen to/.test(text);
  const isOpenEnded =
    /tell us|describe|give an example|cover letter|introduce yourself|about (you|yourself)|your background|relevant (experience|background)|experience with|why are you|what (makes|interests)|anything else (you|we)|additional information|summari[sz]e your|walk us through|your motivation|personal statement/.test(
      text,
    );
  if (!isMotivation && !isOpenEnded) return null;

  let value = "";
  if (isMotivation) {
    value = [
      `I am interested in ${role} at ${company} because it aligns with my background${skills ? ` in ${skills}` : contact.title ? ` as ${contact.title}` : ""}.`,
      summary || example,
      `I would be keen to apply that experience in a role where I can contribute quickly and keep developing.`,
    ]
      .filter(Boolean)
      .join(" ");
  } else {
    value = [
      summary || (contact.title ? `My background is in ${contact.title}.` : ""),
      example ? `One relevant example is ${example}` : "",
      skills ? `The main skills I would bring are ${skills}.` : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  const max = field.maxLength && field.maxLength > 0 ? field.maxLength : 1200;
  const trimmed = value.replace(/\s+/g, " ").trim().slice(0, max);
  if (!trimmed) return null;
  return { fieldId: field.id, value: trimmed, confidence: 0.64, source: "profile.best_effort" };
}

// Short option lists are sent in full. Long enumerable lists (countries,
// states, universities) are sent only as a small sample: the model already
// knows the candidate's real value from the profile and outputs it as text, and
// the server matches that text against the COMPLETE option list in
// validOptionAnswer(). This keeps the prompt small and scalable regardless of
// how many options a dropdown has.
const FULL_OPTION_LIMIT = 50;
const LONG_LIST_SAMPLE = 20;

function conciseField(field: DetectedField) {
  const total = field.options.length;
  const sampled = total > FULL_OPTION_LIMIT;
  const options = sampled ? field.options.slice(0, LONG_LIST_SAMPLE) : field.options;
  return {
    fieldId: field.id,
    tagName: field.tagName,
    inputType: field.inputType,
    label: field.label,
    name: field.name,
    placeholder: field.placeholder,
    currentValue: field.value,
    required: field.required,
    maxLength: field.maxLength,
    multi: field.multi,
    options,
    optionCount: total,
    // When true, `options` above is ONLY a sample of a much longer list. The
    // model must output the candidate's real value as text rather than limiting
    // itself to the shown sample; the server resolves it to the real option.
    optionsTruncated: sampled,
    // Custom type-ahead widgets arrive with no pre-extracted options; the client
    // opens the menu and resolves the typed value at apply time.
    isCombobox: field.inputType.toLowerCase() === "combobox",
    context: field.context,
  };
}

function candidateProfileForPrompt(profile: StoredProfile, enrichment: StoredProfileEnrichment | null) {
  const structuredProfile = buildStructuredCandidateContext(profile, enrichment);
  return {
    updatedAt: profile.updatedAt,
    source: profile.source,
    sourceFileName: profile.sourceFileName,
    structuredProfile,
    resume: profile.resume,
    insights: profile.insights ?? null,
    resumeText: structuredProfile.fallbackResumeText,
  };
}

function modelSystemPrompt(): string {
  return [
    "You fill job application form fields for one candidate.",
    "Use ONLY the provided candidate profile, full structured resume, career insights, captured profile facts, saved answer memory, application field labels, current field values, field options, and job context.",
    "The candidate.structuredProfile object is the primary source for direct facts. It is a normalized JSON fact table built from the CV/profile and captured answers: identity, contact, location, demographics, education, experience, skills, career evidence, and application facts.",
    "Before answering a field, decide what fact category it asks for, then read candidate.structuredProfile.factTable and the relevant structured object. Do not rely on keyword equality alone; match the meaning of the question to the normalized fact.",
    "Return strict JSON only with shape: {\"answers\":[{\"fieldId\":\"...\",\"value\":\"...\",\"confidence\":0.0,\"source\":\"...\"}],\"skipped\":[{\"fieldId\":\"...\",\"reason\":\"...\"}],\"warnings\":[]}.",
    "Be proactive for ordinary job-application questions. The user expects you to fill as much of the form as possible, and they will review before submitting.",
    "For ordinary professional, education, skills, experience, motivation, assessment, background, availability-to-discuss, and free-text application questions, produce the best grounded answer from the resume/profile/job context even when evidence is indirect.",
    "Do not skip an ordinary career/application question just because the wording is not an exact match. Use the closest relevant resume section, profile insight, skill, project, education entry, or proof point and answer naturally.",
    "Only skip ordinary fields when there is genuinely no usable candidate context at all, the field is impossible to understand, or no available option is even roughly compatible.",
    "For protected demographic, legal/work authorization, visa/sponsorship, salary/compensation, start date/notice period, referral/source, consent/policy, government ID, payment, CAPTCHA, and identity-document fields, be conservative: answer only from captured facts, saved answer memory, or an explicit value in candidate.structuredProfile.demographics/applicationFacts; otherwise skip.",
    "For normal contact fields, the system has already filled deterministic profile data; focus on remaining application questions.",
    "Saved answer memory contains explicit values the user previously entered and chose to capture from other applications.",
    "Captured profile facts are exact question-and-answer facts saved from prior applications; treat them as structured JSON memory, not as a summary.",
    "Use captured profile facts directly when the current question is semantically asking the same thing, even when wording or option labels differ.",
    "Use capturedSensitiveFacts only when the current field asks for that exact protected, legal, consent, or identity category.",
    "Treat saved answer memory as a semantic memory bank: compare current question wording, field context, current options, previous options, answer labels, answer values, questionTags, and answerTags before deciding whether a memory applies.",
    "For demographic, EEO, diversity, work authorization, visa, sponsorship, salary, availability, referral/source, consent, or policy acknowledgement fields, you may answer ONLY from saved answer memory, captured profile facts, or explicit structuredProfile.applicationFacts/demographics values. Never infer these from resume/profile/job context.",
    "When using saved answer memory for a semantically similar question, set source to \"extension.field_memory.semantic:<memory id>\".",
    "When using captured sensitive facts, set source to \"profile_enrichment.sensitive_fact:<fact key>\". When using captured normal facts, set source to \"profile_enrichment.fact:<fact key>\".",
    "For every select, radio, or checkbox field, read the complete options array before answering. Infer the intended answer from structured evidence first, then choose the exact available option value whose label/value best expresses that answer.",
    "For numeric ranges such as age groups, years of experience, graduation years, or percentage bands, output the exact candidate number when known or the exact option value when the matching range is obvious. Example: if structuredProfile.demographics.age is 24 and options include 18-20, 20-25, 25-30, choose the 20-25 option value.",
    "Field options may be a SAMPLE, not the full list. When optionsTruncated is true (a long enumerable dropdown such as country, state/region, university), the shown options are only the first few of optionCount total entries. Do NOT restrict yourself to the sample: output the candidate's exact real-world value as plain text (for example the full country or state name derived from the profile location). The server matches your text against the complete option list, so always answer these — never skip them just because the value is not in the visible sample.",
    "When inputType is \"combobox\", the field is a custom type-ahead widget with no options listed at all. Output the candidate's exact intended value as plain text; the client opens the widget and selects the matching entry.",
    "For geographic residence/address fields (country of residence, current country, state, region, province, county, city, current location), always fill them from structuredProfile.location. These are not sensitive and must not be skipped when the profile has any location signal. Do not infer nationality or citizenship from location; those require captured memory/facts.",
    "Default to filling rather than skipping for any ordinary application field. Skipping should be the rare exception, reserved for the conservative sensitive categories below or fields that are genuinely impossible to ground.",
    "currentValue is only the page's current state. It may be an empty placeholder, an ATS default, or a previously selected option. Do not assume currentValue is correct unless it is supported by candidate data or saved/captured memory.",
    "If a page default option is contradicted by the candidate data, return the supported option value. If the candidate data does not clearly support any option, skip the field.",
    "If saved memory says the user does not require sponsorship and the current field asks the same question with Yes/No choices, select the exact current No option value. If wording is ambiguous or the saved memory points to a different fact, skip.",
    "For SHORT option fields (optionsTruncated is false), only return an option value that is present in the provided options; if none is semantically supported, skip. This rule does NOT apply to sampled long lists (optionsTruncated true) or comboboxes, where you output the real value as text.",
    "Read each field's label AND its context/instruction text, then answer exactly what THAT field asks for. The context often contains the real question and explicit instructions (for example a CEFR language list, a character limit, or 'if none apply, enter NA'). Follow those instructions literally — if the field says to enter NA when nothing applies and the profile has no relevant data, answer \"NA\".",
    "Never paste the candidate's profile summary, headline, or generic resume text into a field that is not explicitly asking for a personal summary, motivation, cover letter, or open-ended background answer. A mismatched dump (for example putting a professional summary into an 'other languages' field) is a serious error; skip instead when you have no answer that actually fits the question.",
    "For long-form answers, write in a natural first-person candidate voice, concise and specific. Prefer 2-4 sentences unless the field asks for more. If the question asks for examples, use one real project, role, education entry, or proof point from structuredProfile.experience/education/career.",
    "Use the job description to tailor motivation and relevance, but do not claim experience that is not in the resume/profile.",
    "Never invent skills, employers, degrees, metrics, certifications, work authorization, visa status, salary, availability, demographic facts, identity documents, or location details.",
    "For ordinary professional questions, confidence 0.6 or above is acceptable when the answer is reasonably grounded in profile/resume/job context. Do not artificially lower confidence because the answer is a natural synthesis.",
    "For select, radio, or checkbox fields, return exactly one available option value from the field options. If no option is safely supported, skip.",
    "For checkbox groups where multi=true, you may return multiple available option values joined with ' || ' only when each selected value is directly supported by the candidate profile.",
    "For any field asking for a portfolio, website, LinkedIn, GitHub, or other link/URL, output a complete valid absolute URL that includes the https:// scheme (for example https://www.example.com/portfolio or https://www.linkedin.com/in/username). Never output a bare domain, a partial path, or just the site name.",
    "Respect maxLength when provided. Do not use markdown, bullets, placeholders, or generic filler.",
    "Return an answer for every ordinary field you can reasonably ground. Return skipped only for fields covered by the conservative categories above, impossible/unclear fields, unsupported option choices, or fields with no relevant candidate context.",
  ].join(" ");
}

async function modelAnswers(
  fields: DetectedField[],
  profile: StoredProfile,
  req: PageFillRequest,
  memories: ExtensionFieldMemory[],
  enrichment: StoredProfileEnrichment | null,
): Promise<FillPlan> {
  if (!fields.length) return { answers: [], skipped: [], warnings: [] };
  if (!isAzureConfigured) {
    return {
      answers: fields
        .map((field) => mockLongAnswer(field, profile, req))
        .filter((answer): answer is FillAnswer => Boolean(answer)),
      skipped: fields
        .filter((field) => !mockLongAnswer(field, profile, req))
        .map((field) => ({ fieldId: field.id, reason: "No grounded profile evidence for this question." })),
      warnings: ["Using deterministic local answer generator because Azure is not configured."],
    };
  }

  const raw = await chatJSON<unknown>(
    [
      {
        role: "system",
        content: modelSystemPrompt(),
      },
      {
        role: "user",
        content: JSON.stringify({
          page: {
            url: req.url,
            title: req.title,
            summary: req.pageTextSummary,
            job: {
              role: req.jobContext?.role,
              company: req.jobContext?.company,
              description: req.jobContext?.description || req.pageTextSummary,
            },
          },
          candidate: candidateProfileForPrompt(profile, enrichment),
          savedAnswerMemory: memoriesForPrompt(memories),
          capturedProfileFacts: enrichmentForPrompt(enrichment),
          fields: fields.map(conciseField),
        }),
      },
    ],
    { temperature: 0.35, maxTokens: 5000, timeoutMs: 75_000 },
  );
  return fillPlanSchema.parse(raw);
}

function validOptionAnswer(field: DetectedField, value: string): string | null {
  if (!field.options.length) return value;
  const requested = field.multi
    ? value.split(/\s*\|\|\s*|\s*,\s*|\s*;\s*/).map((item) => item.trim()).filter(Boolean)
    : [value.trim()];
  const selected: string[] = [];
  for (const item of requested) {
    const normalized = normalizeOptionText(item);
    const option = field.options.find((o) => {
      const value = normalizeOptionText(o.value);
      const label = normalizeOptionText(o.label);
      if (value === normalized || label === normalized) return true;
      return normalized.length > 2 && (label.includes(normalized) || normalized.includes(label));
    }) ?? semanticOptionMatch(field.options, item) ?? numericRangeOptionMatch(field.options, item) ?? tokenOverlapOptionMatch(field.options, item);
    if (!option) return null;
    selected.push(option.value || option.label);
  }
  return selected.length ? selected.join(" || ") : null;
}

function normalizeAnswer(field: DetectedField, answer: FillAnswer): FillAnswer | SkippedField {
  const never = neverFillReason(field);
  if (never) return { fieldId: field.id, reason: never };
  const memoryOnly = memoryOnlyReason(field);
  if (
    memoryOnly &&
    !answer.source.includes("extension.field_memory") &&
    !answer.source.includes("profile_enrichment.sensitive_fact") &&
    !answer.source.includes("profile_enrichment.fact")
  ) {
    return { fieldId: field.id, reason: `${memoryOnly} No matching captured answer was found.` };
  }
  const value = validOptionAnswer(field, answer.value);
  if (!value) return { fieldId: field.id, reason: "Model answer did not match an available option." };
  const max = field.maxLength && field.maxLength > 0 ? field.maxLength : 3000;
  const trimmed = value.replace(/\s+/g, " ").trim().slice(0, max);
  if (!trimmed) return { fieldId: field.id, reason: "Model returned an empty answer." };
  return { ...answer, fieldId: field.id, value: trimmed };
}

export async function buildMagicFillPlan(
  req: PageFillRequest,
  profile: StoredProfile,
  userId = profile.userId,
): Promise<FillPlan> {
  const answers: FillAnswer[] = [];
  const skipped: SkippedField[] = [];
  const unanswered: DetectedField[] = [];
  const fieldsById = new Map(req.fields.map((field) => [field.id, field]));
  const [memories, enrichment] = await Promise.all([
    listFieldMemories(userId),
    getProfileEnrichment(userId).catch(() => null),
  ]);
  const structuredProfile = buildStructuredCandidateContext(profile, enrichment);

  for (const field of req.fields) {
    const never = neverFillReason(field);
    if (never) {
      skipped.push({ fieldId: field.id, reason: never });
      continue;
    }

    const existing = existingValueReason(field);
    if (existing) {
      skipped.push({ fieldId: field.id, reason: existing });
      continue;
    }

    const memory = await findMemoryAnswer(userId, field, memories);
    if (memory) {
      answers.push(memory);
      continue;
    }

    const enriched = enrichmentAnswer(field, enrichment);
    if (enriched) {
      const normalized = normalizeAnswer(field, enriched);
      if ("reason" in normalized) skipped.push(normalized);
      else answers.push(normalized);
      continue;
    }

    if (memoryOnlyReason(field)) {
      unanswered.push(field);
      continue;
    }

    const deterministic = deterministicAnswer(field, profile, structuredProfile);
    if (!deterministic) {
      if (shouldAskModel(field)) unanswered.push(field);
      else skipped.push({ fieldId: field.id, reason: "No safe profile match found." });
      continue;
    }
    if ("reason" in deterministic) skipped.push(deterministic);
    else answers.push(deterministic);
  }

  const modelFields = unanswered.slice(0, MAX_MODEL_FIELDS);
  const deferred = unanswered.slice(MAX_MODEL_FIELDS);
  const model = await modelAnswers(modelFields, profile, req, memories, enrichment).catch((err) => {
    const reason =
      err instanceof LLMError
        ? `Model could not answer these fields: ${err.message}`
        : "Model could not answer these fields.";
    return {
      answers: [],
      skipped: modelFields.map((field) => ({ fieldId: field.id, reason })),
      warnings: [reason],
    } satisfies FillPlan;
  });
  for (const answer of model.answers) {
    const field = fieldsById.get(answer.fieldId);
    if (!field) {
      model.warnings.push(`Ignored model answer for unknown field ${answer.fieldId}.`);
      continue;
    }
    if (answer.confidence < HIGH_CONFIDENCE || !answer.value.trim()) {
      const fallback = bestEffortProfileAnswer(field, profile, req);
      if (fallback) {
        const normalizedFallback = normalizeAnswer(field, fallback);
        if ("reason" in normalizedFallback) skipped.push(normalizedFallback);
        else answers.push(normalizedFallback);
      } else {
        skipped.push({ fieldId: answer.fieldId, reason: "Model confidence was too low." });
      }
      continue;
    }
    const normalized = normalizeAnswer(field, answer);
    if ("reason" in normalized) skipped.push(normalized);
    else answers.push(normalized);
  }
  for (const modelSkip of model.skipped) {
    const field = fieldsById.get(modelSkip.fieldId);
    const fallback = field ? bestEffortProfileAnswer(field, profile, req) : null;
    if (field && fallback) {
      const normalizedFallback = normalizeAnswer(field, fallback);
      if ("reason" in normalizedFallback) skipped.push(normalizedFallback);
      else answers.push(normalizedFallback);
    } else {
      skipped.push(modelSkip);
    }
  }
  skipped.push(...deferred.map((field) => ({ fieldId: field.id, reason: "Too many unanswered fields for one Magic Fill run." })));

  const seen = new Set<string>();
  const answeredIds = new Set(answers.map((a) => a.fieldId));
  const dedupedAnswers = answers
    .filter((a) => {
      if (seen.has(a.fieldId)) return false;
      seen.add(a.fieldId);
      return true;
    })
    .map((a) => {
      const field = fieldsById.get(a.fieldId);
      if (!field || isOptionField(field) || !isUrlField(field)) return a;
      const value = normalizeUrlValue(a.value);
      return value === a.value ? a : { ...a, value };
    });
  return {
    answers: dedupedAnswers,
    skipped: skipped.filter((s) => !answeredIds.has(s.fieldId)),
    warnings: model.warnings,
  };
}
