/**
 * classify.ts — turn a raw email into a structured EmailClassification.
 *
 * Uses Azure AI Foundry when configured; otherwise a deterministic heuristic
 * classifier so the tracker pipeline runs end-to-end without a key. Both
 * return the same validated shape, so the linker downstream is identical.
 */

import { isAzureConfigured } from "@/lib/env";
import { chatJSON } from "@/lib/llm/client";
import { emailClassificationSchema, type EmailClassification, type EmailMessage } from "@/lib/schema/tracker";
import type { ChatMessage } from "@/lib/llm/client";

/* ---------- prompt ---------- */

function buildClassifyMessages(email: EmailMessage): ChatMessage[] {
  const system = `You analyze a single email from a job-seeker's inbox and decide whether it relates to a job application, then extract structured data.

Return ONLY JSON with this exact shape:
{
  "isJobRelated": boolean,        // true only if about THIS person's job application/search
  "kind": one of [
    "application_confirmation",   // "Thanks for applying", application received
    "assessment",                 // take-home / coding test / online assessment invite
    "interview_invite",           // invitation to schedule or attend an interview
    "interview_update",           // reschedule, additional round, interview logistics
    "offer",                      // a job offer
    "rejection",                  // not moving forward / position filled
    "recruiter_outreach",         // inbound recruiter/sourcing about a role
    "other_job",                  // job-related but no status change
    "not_job"                     // newsletters, marketing, job ALERTS digests, personal mail
  ],
  "company": string,              // actual hiring company name (not the ATS platform name)
  "role": string,                 // job title applied for, "" if unknown
  "stage": 0|1|2|3,               // 0 Applied, 1 In review, 2 Interview, 3 Decision
  "outcome": "offer"|"rejected"|null,
  "needsAction": boolean,         // true if the user must respond/schedule/decide
  "actionSummary": string,        // one short line: what changed or is needed
  "eventDate": string,            // ISO date of interview/deadline if present, else ""
  "confidence": number            // 0..1 that this is a genuine application email
}

RULES:
- Job ALERT digests, marketing, and newsletters are "not_job" (isJobRelated=false).
- The company is the EMPLOYER. Ignore the ATS sender (Greenhouse, Lever, Ashby, Workday, iCIMS).
- Map kind→stage: application_confirmation=0; assessment/recruiter_outreach=1; interview_invite/interview_update=2; offer/rejection=3.
- outcome is "offer" only for kind "offer"; "rejected" only for kind "rejection"; else null.
- needsAction=true for interview_invite, assessment, and offer (the user must act).
- eventDate MUST be an absolute ISO date/time when the email mentions an interview time,
  assessment deadline, offer deadline, scheduling deadline, or response-by date. Use the email Date
  as reference for relative dates like "tomorrow" or "Friday". Leave "" only when no date/deadline is present.
- Be conservative: if unsure it's about this user's own application, set isJobRelated=false.`;

  const user = `From: ${email.from}
Subject: ${email.subject}
Date: ${email.receivedAt}

${email.body || email.snippet}`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/* ---------- heuristic fallback ---------- */

const ATS_SENDERS = /greenhouse|lever|ashby|workday|myworkday|icims|smartrecruiters|taleo|jobvite|no-?reply|notifications?|mailer/i;

/** Strip recruiting-team suffixes from a company display name. */
function cleanCompanyName(raw: string): string {
  return raw
    .replace(/\b(careers?|recruiting|recruitment|talent( acquisition)?|hiring|jobs|hr|people team|team)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/[-–|,].*$/, "")
    .trim();
}

function guessCompany(email: EmailMessage): string {
  // 1. "at {Company}" or "to/with {Company}" in the subject.
  const subj = email.subject;
  const atMatch = subj.match(/\b(?:at|to|with|from|join)\s+([A-Z][A-Za-z0-9&.\- ]{1,30})/);
  if (atMatch) {
    const cleaned = cleanCompanyName(atMatch[1]);
    if (cleaned) return cleaned;
  }
  // 2. The From display name, minus recruiting suffixes (even if it contains
  //    a word like "Talent" — we strip rather than reject).
  const display = email.from.match(/^"?([^"<]+?)"?\s*</);
  if (display) {
    const cleaned = cleanCompanyName(display[1]);
    if (cleaned && cleaned.length > 1) return cleaned;
  }
  // 3. The sending domain, unless it's a generic ATS host.
  const domain = email.from.match(/@([a-z0-9.-]+)\./i);
  if (domain && !ATS_SENDERS.test(domain[1])) {
    return domain[1].split(".")[0].replace(/^\w/, (c) => c.toUpperCase());
  }
  return "";
}

function guessRole(email: EmailMessage): string {
  const m = email.subject.match(
    /(senior|sr\.?|lead|staff|principal|junior|jr\.?)?\s*(software engineer|product designer|product manager|data scientist|design(?:\s+systems?)?\s+(?:engineer|lead)?|designer|engineer|developer|manager|analyst)[^.,\n|]*/i,
  );
  if (!m) return "";
  // Trim trailing connectors like "at Stripe" / "role" / "position".
  return m[0]
    .replace(/\b(at|with|for)\s+[A-Z].*$/i, "")
    .replace(/\b(role|position|opening|opportunity)\b.*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const MONTHS =
  "january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec";

function extractEventDate(email: EmailMessage): string {
  const text = `${email.subject}\n${email.snippet}\n${email.body}`;
  const year = new Date(email.receivedAt).getFullYear();
  const patterns = [
    /\b(?:by|before|on|due|deadline:?|scheduled for)?\s*(\d{4}-\d{2}-\d{2})/i,
    new RegExp(`\\b(?:by|before|on|due|deadline:?|scheduled for)?\\s*((?:${MONTHS})\\.?\\s+\\d{1,2}(?:,?\\s+\\d{4})?)`, "i"),
    new RegExp(`\\b(?:by|before|on|due|deadline:?|scheduled for)?\\s*(\\d{1,2}\\s+(?:${MONTHS})\\.?\\s*\\d{0,4})`, "i"),
  ];
  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (!m?.[1]) continue;
    const raw = /\d{4}/.test(m[1]) ? m[1] : `${m[1]} ${year}`;
    const t = Date.parse(raw);
    if (Number.isFinite(t)) return new Date(t).toISOString();
  }
  return "";
}

export function heuristicClassify(email: EmailMessage): EmailClassification {
  const text = `${email.subject} ${email.snippet} ${email.body}`.toLowerCase();
  const company = guessCompany(email);
  const role = guessRole(email);
  const eventDate = extractEventDate(email);

  const base = { company, role, eventDate };

  // Order matters: decisions/offers first, then interview, then confirmation.
  if (/\b(unfortunately|not (be )?moving forward|other candidates|position has been filled|won'?t be proceeding|regret to inform)\b/.test(text)) {
    return emailClassificationSchema.parse({ ...base, isJobRelated: true, kind: "rejection", stage: 3, outcome: "rejected", actionSummary: "Application not selected.", confidence: 0.8 });
  }
  if (/\b(pleased to offer|offer letter|extend(ing)? an offer|job offer|we'?d like to offer)\b/.test(text)) {
    return emailClassificationSchema.parse({ ...base, isJobRelated: true, kind: "offer", stage: 3, outcome: "offer", needsAction: true, actionSummary: "Offer received — review and respond.", confidence: 0.85 });
  }
  if (/\b(schedule|book).{0,20}(interview|call|chat)|invite you to interview|interview (invitation|request)|next round|phone screen\b/.test(text)) {
    return emailClassificationSchema.parse({ ...base, isJobRelated: true, kind: "interview_invite", stage: 2, needsAction: true, actionSummary: "Interview proposed — confirm a time.", confidence: 0.8 });
  }
  if (/\b(assessment|coding (test|challenge)|take-?home|online test|hackerrank|codility)\b/.test(text)) {
    return emailClassificationSchema.parse({ ...base, isJobRelated: true, kind: "assessment", stage: 1, needsAction: true, actionSummary: "Assessment requested.", confidence: 0.75 });
  }
  if (/\b(thank you for applying|application (has been )?received|we received your application|thanks for your interest|successfully applied|application confirmation)\b/.test(text)) {
    return emailClassificationSchema.parse({ ...base, isJobRelated: true, kind: "application_confirmation", stage: 0, actionSummary: "Application submitted.", confidence: 0.8 });
  }
  if (/\b(recruiter|sourcing|came across your profile|reaching out about|opportunity at)\b/.test(text) && company) {
    return emailClassificationSchema.parse({ ...base, isJobRelated: true, kind: "recruiter_outreach", stage: 1, actionSummary: "Recruiter outreach.", confidence: 0.6 });
  }
  // Job alert digests and everything else.
  return emailClassificationSchema.parse({ isJobRelated: false, kind: "not_job", confidence: 0.2 });
}

/* ---------- public API ---------- */

export async function classifyEmail(email: EmailMessage): Promise<EmailClassification> {
  if (isAzureConfigured) {
    try {
      const raw = await chatJSON<unknown>(buildClassifyMessages(email), { temperature: 0 });
      return emailClassificationSchema.parse(raw);
    } catch (err) {
      console.error("[tracker.classify] Azure failed, using heuristic:", err);
    }
  }
  return heuristicClassify(email);
}
