/**
 * mock.ts — deterministic, no-network fallbacks for the LLM pipeline.
 *
 * These let the full Customize CV flow run for testing before Azure AI
 * Foundry is configured. They use simple heuristics (regex, keyword
 * frequency) that approximate the real prompts: structuring text, deriving
 * career intelligence, pulling JD keywords, and reordering/rewording the
 * resume by relevance — plus a career-ops-style fit analysis.
 *
 * The shapes returned here are identical to the real LLM path, so swapping
 * in Azure changes nothing downstream.
 */

import { emptyResume, resumeSchema, withSectionIds, resumeToPlainText, type ResumeData } from "@/lib/schema";
import type {
  JobDescription,
  TailorResult,
  ResumeEntry,
  SectionKind,
  ProfileInsights,
  FitDimension,
  RequirementMatch,
  CustomizationChange,
  InterviewPrep,
  CoverLetter,
} from "@/lib/schema";
import { profileInsightsSchema, interviewPrepSchema, coverLetterSchema } from "@/lib/schema";

/* ---------- shared helpers ---------- */

const STOPWORDS = new Set([
  "the", "and", "for", "with", "you", "our", "are", "will", "have", "has", "this", "that",
  "your", "from", "their", "they", "who", "what", "when", "where", "how", "all", "can", "a",
  "an", "to", "of", "in", "on", "at", "be", "is", "as", "or", "we", "us", "by", "it", "its",
  "role", "team", "work", "working", "job", "company", "looking", "experience", "years",
  "ability", "strong", "including", "etc", "plus", "across", "within", "into", "about",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

function blankEntry(partial: Partial<ResumeEntry> = {}): ResumeEntry {
  return {
    title: "",
    organization: "",
    location: "",
    start: "",
    end: "",
    description: "",
    link: "",
    bullets: [],
    tags: [],
    ...partial,
  };
}

/** Classify a heading into a section kind. */
function kindFor(heading: string): SectionKind {
  const h = heading.toLowerCase();
  if (/experience|employment|work history/.test(h)) return "experience";
  if (/education|academic/.test(h)) return "education";
  if (/project/.test(h)) return "projects";
  if (/skill|tools|technolog|competenc/.test(h)) return "skills";
  if (/certificat|licen[sc]e/.test(h)) return "certifications";
  if (/award|achievement|honor|honour/.test(h)) return "awards";
  return "custom";
}

/* ---------- 1. parse CV (heuristic, dynamic sections) ---------- */

export function mockParseCV(text: string): ResumeData {
  const resume = emptyResume();
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const nonEmpty = lines.filter(Boolean);

  // Contact: name = first meaningful line; scan for email/phone/links.
  resume.contact.name = (nonEmpty[0] ?? "").replace(/^#+\s*/, "").replace(/^cv\s*[-—:]\s*/i, "");
  const emailMatch = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  if (emailMatch) resume.contact.email = emailMatch[0];
  const phoneMatch = text.match(/(\+?\d[\d\s().-]{7,}\d)/);
  if (phoneMatch) resume.contact.phone = phoneMatch[1].trim();
  const linkedin = text.match(/linkedin\.com\/[^\s)]+/i);
  if (linkedin) resume.contact.linkedin = linkedin[0];
  const github = text.match(/github\.com\/[^\s)]+/i);
  if (github) resume.contact.github = github[0];

  // Heading detection: ALL-CAPS lines or known headings.
  const headingRe =
    /^(#+\s*)?(professional summary|summary|profile|about|work experience|professional experience|experience|employment|education|skills|technical skills|projects|certifications?|awards?|achievements?[\w &]*|publications?|volunteer\w*|languages?|interests?)\b/i;
  const isAllCapsHeading = (l: string) =>
    l.length >= 3 && l.length <= 48 && /^[A-Z0-9][A-Z0-9 &/'\-+().]+$/.test(l) && /[A-Z]/.test(l);

  // Segment into blocks by heading.
  const blocks: { heading: string; body: string[] }[] = [];
  let current: { heading: string; body: string[] } | null = null;
  for (const raw of lines) {
    if (!raw) continue;
    const m = raw.match(headingRe);
    if (m || isAllCapsHeading(raw)) {
      current = { heading: raw.replace(/^#+\s*/, "").trim(), body: [] };
      blocks.push(current);
    } else if (current) {
      current.body.push(raw);
    }
  }

  for (const block of blocks) {
    const kind = kindFor(block.heading);
    if (/summary|profile|about/i.test(block.heading)) {
      resume.summary = block.body.filter(Boolean).join(" ").trim();
      continue;
    }

    const entries: ResumeEntry[] = [];
    if (kind === "skills") {
      for (const raw of block.body.filter(Boolean)) {
        const cat = raw.replace(/^[-*•●]\s*/, "").match(/^([\w/ &]+?)\s*[:\-]\s*(.+)$/);
        if (cat) {
          entries.push(blankEntry({
            title: cat[1].trim(),
            tags: cat[2].split(/[,;·|]/).map((s) => s.trim()).filter(Boolean),
          }));
        } else {
          const items = raw.replace(/^[-*•●]\s*/, "").split(/[,;·|]/).map((s) => s.trim()).filter(Boolean);
          if (items.length) entries.push(blankEntry({ tags: items }));
        }
      }
    } else {
      // Generic: header line starts an entry; bullets attach to it.
      let entry: ResumeEntry | null = null;
      for (const raw of block.body) {
        if (!raw) continue;
        const isBullet = /^[-*•●]/.test(raw);
        if (isBullet) {
          if (!entry) {
            entry = blankEntry();
            entries.push(entry);
          }
          entry.bullets.push(raw.replace(/^[-*•●]\s*/, "").trim());
        } else {
          const dm = raw.match(/(\w{3,9}\.?\s*)?(\d{4})\s*[-–—to]+\s*(present|current|(?:\w{3,9}\.?\s*)?\d{4})/i);
          entry = blankEntry({
            title: raw.replace(/^#+\s*/, "").replace(/\*\*/g, "").trim(),
            start: dm ? dm[2] : "",
            end: dm ? dm[3] : "",
          });
          entries.push(entry);
        }
      }
    }

    if (entries.length || block.heading) {
      resume.sections.push({ id: "", heading: block.heading, kind, entries });
    }
  }

  return withSectionIds(resumeSchema.parse(resume));
}

/* ---------- 1c. derive career intelligence (heuristic) ---------- */

/** Pull bullets/descriptions that contain hard numbers — likely proof points. */
function quantifiedLines(resume: ResumeData): { text: string; org: string }[] {
  const out: { text: string; org: string }[] = [];
  const numRe = /(\d[\d,.]*\s*(%|x|k|m|bn|hrs?|hours?|days?|weeks?|months?|users?|customers?|\$)|\$\s?\d|\d{2,})/i;
  for (const section of resume.sections) {
    if (section.kind === "skills") continue;
    for (const entry of section.entries) {
      const org = entry.organization || entry.title || section.heading;
      const candidates = [entry.description, ...entry.bullets].filter(Boolean);
      for (const c of candidates) if (numRe.test(c)) out.push({ text: c.trim(), org });
    }
  }
  return out;
}

/** Extract the metric tokens from a sentence (verbatim). */
function metricsIn(text: string): string[] {
  const matches = text.match(/(\$\s?\d[\d,.]*\s?[kKmMbB]?|\d[\d,.]*\s?(?:%|x|k|m|bn|hrs?|hours?|days?|weeks?|months?|users?|customers?))/gi);
  return matches ? Array.from(new Set(matches.map((m) => m.trim()))).slice(0, 4) : [];
}

export function mockDeriveInsights(resume: ResumeData): ProfileInsights {
  const corpus = resumeToPlainText(resume).toLowerCase();
  const title = resume.contact.title || "";

  // Archetype guesses from the resume corpus (reuse the JD detector heuristics).
  const archetypeName = detectArchetype(title, corpus);
  const archetypes = [
    {
      name: archetypeName,
      rationale: `Resume shows hands-on work aligned with ${archetypeName.toLowerCase()} responsibilities.`,
      emphasis: topSkills(resume).slice(0, 5),
    },
  ];

  // Proof points from quantified bullets.
  const proofPoints = quantifiedLines(resume)
    .slice(0, 8)
    .map(({ text, org }) => ({
      headline: text.length > 90 ? `${text.slice(0, 87)}…` : text,
      detail: org ? `From ${org}.` : "",
      metrics: metricsIn(text),
      skills: [],
    }));

  const keySkills = topSkills(resume).slice(0, 12);
  const headline = title
    ? `${title} with ${proofPoints.length ? "a track record of measurable impact" : "broad hands-on experience"}.`
    : "Experienced professional with broad hands-on experience.";
  const narrative = resume.summary
    ? resume.summary.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ")
    : `${headline} Strengths span ${keySkills.slice(0, 4).join(", ") || "multiple areas"}.`;

  return profileInsightsSchema.parse({
    headline,
    narrative,
    archetypes,
    proofPoints,
    coreStrengths: keySkills.slice(0, 6),
    keySkills,
    derivedAt: new Date().toISOString(),
  });
}

/** Rank a resume's skills by frequency of mention (skills sections first). */
function topSkills(resume: ResumeData): string[] {
  const counts = new Map<string, number>();
  const bump = (s: string, n = 1) => {
    const k = s.trim();
    if (k.length < 2) return;
    counts.set(k, (counts.get(k) ?? 0) + n);
  };
  for (const section of resume.sections) {
    if (section.kind === "skills") {
      for (const e of section.entries) for (const t of e.tags.length ? e.tags : e.bullets) bump(t, 3);
    }
  }
  // Light de-dupe by lowercase key, keep the first casing seen.
  const seen = new Map<string, string>();
  for (const k of counts.keys()) {
    const lk = k.toLowerCase();
    if (!seen.has(lk)) seen.set(lk, k);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => seen.get(k.toLowerCase()) ?? k)
    .filter((v, i, arr) => arr.findIndex((x) => x.toLowerCase() === v.toLowerCase()) === i);
}

/* ---------- 2. parse JD ---------- */

/** Heuristic archetype detection from a role title + JD text (mock only). */
function detectArchetype(role: string, text: string): string {
  const rules: [RegExp, string][] = [
    [/\b(product manager|product owner|\bpm\b|roadmap|prd)\b/, "Product Manager"],
    [/\b(ux|ui|product design|interaction design|figma)\b/, "Product Designer / UX"],
    [/\b(data scientist|machine learning|ml engineer|\bml\b|nlp)\b/, "Data Scientist / ML Engineer"],
    [/\b(data engineer|etl|warehouse|spark|airflow)\b/, "Data Engineer"],
    [/\b(devops|sre|site reliability|platform engineer)\b/, "DevOps / Platform Engineer"],
    [/\b(frontend|front-end)\b/, "Frontend Engineer"],
    [/\b(backend|back-end|server-side)\b/, "Backend Engineer"],
    [/\b(full[-\s]?stack)\b/, "Full-Stack Engineer"],
    [/\b(mobile|ios|android|react native|flutter)\b/, "Mobile Engineer"],
    [/\b(solutions architect|sales engineer|forward[-\s]?deployed)\b/, "Solutions Architect"],
    [/\b(engineering manager|eng manager|team lead)\b/, "Engineering Manager"],
  ];
  // The role title is the strongest signal — match it first, then fall back
  // to the JD body (which may mention adjacent tools like "Kubernetes").
  const roleLower = role.toLowerCase();
  for (const [re, label] of rules) if (re.test(roleLower)) return label;
  const bodyLower = `${role} ${text}`.toLowerCase();
  const bodyRules: [RegExp, string][] = [
    ...rules,
    [/\b(kubernetes|terraform|infrastructure)\b/, "DevOps / Platform Engineer"],
    [/\b(api|microservice)\b/, "Backend Engineer"],
    [/\b(react|vue|angular)\b/, "Frontend Engineer"],
    [/\b(model|deep learning)\b/, "Data Scientist / ML Engineer"],
  ];
  for (const [re, label] of bodyRules) if (re.test(bodyLower)) return label;
  return "Software Engineer";
}

/** Heuristic seniority detection (mock only). */
function detectSeniority(role: string, text: string): string {
  const t = `${role} ${text}`.toLowerCase();
  if (/\bprincipal\b/.test(t)) return "Principal";
  if (/\bstaff\b/.test(t)) return "Staff";
  if (/\b(lead|head of)\b/.test(t)) return "Lead";
  if (/\b(senior|sr\.?|\b8\+|\b7\+|\b6\+)\b/.test(t)) return "Senior";
  if (/\b(junior|jr\.?|entry|graduate|0-2 years|1-2 years)\b/.test(t)) return "Junior";
  if (/\bintern(ship)?\b/.test(t)) return "Intern";
  if (/\b(director|vp|vice president)\b/.test(t)) return "Director";
  return "Mid";
}

export function mockParseJD(text: string, sourceUrl = ""): JobDescription {
  const clean = text.replace(/\s+/g, " ").trim();
  const roleMatch = text.match(
    /(senior|sr\.?|lead|staff|principal|junior|jr\.?)?\s*(product designer|software engineer|product manager|designer|engineer|developer|manager|analyst|scientist)/i,
  );
  const companyMatch =
    text.match(/(?:\bat|@|join)\s+([A-Z][A-Za-z0-9&.]+(?:\s[A-Z][A-Za-z0-9&.]+)?)/) ||
    text.match(/—\s*([A-Z][A-Za-z0-9&.]+(?:\s[A-Z][A-Za-z0-9&.]+)?)/);
  // Trim a trailing sentence fragment (stop at first period/comma).
  const company = companyMatch ? companyMatch[1].split(/[.,]/)[0].trim() : "the company";

  // Top keywords by frequency.
  const freq = new Map<string, number>();
  for (const tok of tokenize(clean)) freq.set(tok, (freq.get(tok) ?? 0) + 1);
  const keywords = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 18)
    .map(([w]) => w);

  // Sentences mentioning responsibility/requirement cues.
  const sentences = clean.split(/(?<=[.!?])\s+/).filter((s) => s.length > 20);
  const responsibilities = sentences
    .filter((s) => /\b(own|lead|build|ship|partner|design|drive|deliver|collaborat)/i.test(s))
    .slice(0, 8);
  const requirements = sentences
    .filter((s) => /\b(\d+\+?\s*years|experience in|proficient|required|must have|familiar|degree)/i.test(s))
    .slice(0, 8);

  const roleStr = roleMatch ? roleMatch[0] : "";
  return {
    company,
    role: roleMatch ? roleMatch[0].trim() : "the role",
    location: /\bremote\b/i.test(text) ? "Remote" : "",
    arrangement: /\bremote\b/i.test(text)
      ? "Remote"
      : /\bhybrid\b/i.test(text)
        ? "Hybrid"
        : /\bon-?site\b/i.test(text)
          ? "On-site"
          : "",
    salary: text.match(/\$\s?\d[\d,]*\s?[kK]?(?:\s?[-–]\s?\$?\d[\d,]*\s?[kK]?)?/)?.[0] ?? "",
    archetype: detectArchetype(roleStr, clean),
    seniority: detectSeniority(roleStr, clean),
    rawText: clean,
    responsibilities,
    requirements,
    keywords,
    sourceUrl,
  };
}

/* ---------- 3. tailor ---------- */

/** Score how relevant a string is to the JD keyword set. */
function relevance(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  return keywords.reduce((n, kw) => (lower.includes(kw.toLowerCase()) ? n + 1 : n), 0);
}

/** Sum the JD relevance of an entry across its text fields. */
function entryRelevance(entry: ResumeEntry, keywords: string[]): number {
  const text = [entry.title, entry.organization, entry.description, ...entry.bullets, ...entry.tags].join(" ");
  return relevance(text, keywords);
}

export function mockTailor(
  resume: ResumeData,
  jd: JobDescription,
  insights?: ProfileInsights | null,
): TailorResult {
  const keywords = jd.keywords;
  const tailored: ResumeData = withSectionIds(
    resumeSchema.parse(JSON.parse(JSON.stringify(resume))),
  );

  // Walk every section dynamically; reorder/reword by JD relevance,
  // truth-preserving (no invented content, just reordering + light surfacing).
  let reorderedBulletSections = 0;
  for (const section of tailored.sections) {
    if (section.kind === "skills") {
      // Reorder skills so JD-relevant ones come first within each group.
      for (const entry of section.entries) {
        entry.tags = [...entry.tags].sort(
          (a, b) => relevance(b, keywords) - relevance(a, keywords),
        );
      }
      continue;
    }

    // For entry-based sections (experience/projects/education/custom):
    // reorder bullets within each entry, then reorder entries by relevance.
    let touched = false;
    for (const entry of section.entries) {
      if (entry.bullets.length > 1) {
        entry.bullets = [...entry.bullets].sort(
          (a, b) => relevance(b, keywords) - relevance(a, keywords),
        );
        touched = true;
      }
    }
    if (section.entries.length > 1) {
      section.entries = [...section.entries].sort(
        (a, b) => entryRelevance(b, keywords) - entryRelevance(a, keywords),
      );
      touched = true;
    }
    if (touched && (section.kind === "experience" || section.kind === "projects")) {
      reorderedBulletSections++;
    }
  }

  // Summary: prepend a role-targeted line, keep the candidate's real summary.
  const roleLabel = jd.role && jd.role !== "the role" ? jd.role : "this role";
  const atCompany =
    jd.company && jd.company !== "the company" && !/\bat\b/i.test(roleLabel)
      ? ` at ${jd.company}`
      : "";
  const beforeSummary = resume.summary;
  const lead = `${resume.contact.title || "Professional"} targeting ${roleLabel}${atCompany}.`;
  tailored.summary = resume.summary ? `${lead} ${resume.summary}` : lead;

  // Coverage over the whole tailored resume.
  const finalCorpus = resumeToPlainText(tailored).toLowerCase();
  const keywordCoverage = keywords.map((keyword) => ({
    keyword,
    matched: finalCorpus.includes(keyword.toLowerCase()),
  }));
  const matchedCount = keywordCoverage.filter((k) => k.matched).length;
  const coveragePct = keywords.length ? Math.round((matchedCount / keywords.length) * 100) : 70;

  // --- career-ops-style multi-dimensional score breakdown ---
  const skillCorpus = tailored.sections
    .filter((s) => s.kind === "skills")
    .flatMap((s) => s.entries.flatMap((e) => (e.tags.length ? e.tags : e.bullets)))
    .join(" ")
    .toLowerCase();
  const skillsScore = keywords.length
    ? Math.min(100, 45 + Math.round((keywords.filter((k) => skillCorpus.includes(k.toLowerCase())).length / keywords.length) * 55))
    : 65;
  const expCorpus = tailored.sections
    .filter((s) => s.kind === "experience" || s.kind === "projects")
    .map((s) => s.entries.map((e) => [e.title, e.description, ...e.bullets].join(" ")).join(" "))
    .join(" ");
  const expScore = keywords.length
    ? Math.min(100, 40 + Math.round((relevance(expCorpus, keywords) / Math.max(keywords.length, 1)) * 22))
    : 60;
  const proofCount = insights?.proofPoints.length ?? quantifiedLines(tailored).length;
  const domainScore = Math.min(100, 50 + proofCount * 8);

  const scoreBreakdown: FitDimension[] = [
    { label: "Skills match", score: skillsScore, weight: 0.3, note: `${keywords.filter((k) => skillCorpus.includes(k.toLowerCase())).length}/${keywords.length} target skills present in the skills section.` },
    { label: "Experience relevance", score: expScore, weight: 0.3, note: `Experience reordered so the most ${roleLabel}-relevant impact leads.` },
    { label: "Keyword / ATS coverage", score: coveragePct, weight: 0.25, note: `${matchedCount}/${keywords.length} JD keywords present after tailoring.` },
    { label: "Domain & impact", score: domainScore, weight: 0.15, note: proofCount ? `${proofCount} quantified proof points support the fit.` : "Few quantified outcomes detected." },
  ];
  const matchScore = Math.round(
    scoreBreakdown.reduce((sum, d) => sum + d.score * d.weight, 0) /
      scoreBreakdown.reduce((sum, d) => sum + d.weight, 0),
  );

  // --- requirement match analysis (Block B) ---
  const requirementMatches: RequirementMatch[] = jd.requirements.slice(0, 10).map((req) => {
    const hits = relevance(req, keywords) + (finalCorpus.includes(req.toLowerCase().slice(0, 24)) ? 1 : 0);
    const reqTokens = tokenize(req);
    const overlap = reqTokens.filter((tok) => finalCorpus.includes(tok)).length;
    const ratio = reqTokens.length ? overlap / reqTokens.length : 0;
    const status: RequirementMatch["status"] = ratio >= 0.5 || hits >= 2 ? "strong" : ratio >= 0.25 ? "partial" : "gap";
    return {
      requirement: req,
      status,
      evidence: status === "gap" ? "" : "Supported by your experience and skills (reordered to surface it).",
      mitigation:
        status === "strong"
          ? ""
          : status === "partial"
            ? "Lead with the closest adjacent experience and mirror the JD's exact wording."
            : "Not evidenced in the resume — add a relevant project or reframe adjacent work honestly.",
    };
  });

  // --- customization plan (Block E) ---
  const customizationPlan: CustomizationChange[] = [
    {
      section: "Professional Summary",
      before: beforeSummary ? (beforeSummary.length > 110 ? `${beforeSummary.slice(0, 107)}…` : beforeSummary) : "(no summary)",
      after: tailored.summary.length > 110 ? `${tailored.summary.slice(0, 107)}…` : tailored.summary,
      why: `Leads with ${roleLabel}-relevant strengths and the JD's vocabulary.`,
    },
    {
      section: "Skills",
      before: "Listed in original order.",
      after: "Reordered so JD-relevant skills appear first.",
      why: "Improves ATS keyword proximity and recruiter scan.",
    },
  ];
  if (reorderedBulletSections) {
    customizationPlan.push({
      section: "Experience & Projects",
      before: "Bullets in original order.",
      after: "Most JD-relevant impact reordered to lead each entry.",
      why: "Surfaces the strongest, most relevant evidence first.",
    });
  }

  const changes = [
    `Rewrote the summary to target ${roleLabel}${atCompany}.`,
    "Reordered skills so the job-relevant ones lead.",
    reorderedBulletSections
      ? "Reordered experience and project bullets so the most relevant impact leads."
      : "Kept the resume's structure and content intact.",
    `Preserved all ${tailored.sections.length} sections and every bullet verbatim.`,
  ];

  return {
    resume: tailored,
    archetype: jd.archetype || detectArchetype(jd.role, jd.rawText),
    archetypeRationale: `Tailored for a ${jd.archetype || "software"} role; surfaced the most relevant experience and skills.`,
    matchScore,
    scoreBreakdown,
    requirementMatches,
    customizationPlan,
    changes,
    keywordCoverage,
  };
}

/* ---------- 3b. cover letter ---------- */

export function mockCoverLetter(input: {
  tailoredResume: ResumeData;
  job: JobDescription;
  insights?: ProfileInsights | null;
  requirementMatches?: RequirementMatch[];
}): CoverLetter {
  const { tailoredResume, job, insights } = input;
  const name = tailoredResume.contact.name || "Candidate";
  const role = job.role || "the role";
  const company = job.company || "your team";
  const skills = (insights?.keySkills?.length ? insights.keySkills : topSkills(tailoredResume)).slice(0, 4);
  const proof = insights?.proofPoints?.slice(0, 3) ?? quantifiedLines(tailoredResume).slice(0, 3).map((p) => ({
    headline: p.text,
    detail: p.org,
    metrics: metricsIn(p.text),
    skills: [],
  }));
  const matchedReqs = input.requirementMatches?.filter((r) => r.status !== "gap").slice(0, 3) ?? [];

  const highlights =
    proof.length > 0
      ? proof.map((p) => p.headline).slice(0, 3)
      : matchedReqs.map((r) => `${r.requirement}: ${r.evidence}`).slice(0, 3);
  while (highlights.length < 3) {
    highlights.push(
      skills.length
        ? `Brings hands-on experience across ${skills.slice(0, 3).join(", ")}.`
        : "Brings relevant experience from the tailored CV.",
    );
  }

  const opening = `I am applying for the ${role} role at ${company} because the work maps closely to the experience highlighted in my tailored CV. My background combines ${skills.slice(0, 3).join(", ") || "relevant delivery experience"} with practical evidence against the role requirements.`;
  const body = `What stands out in the posting is the need for someone who can turn requirements into clear execution. I would bring a direct, evidence-led approach, using the strengths in my CV to contribute quickly while being transparent about any areas that need ramp-up.`;
  const closing = `I would welcome the chance to discuss how this experience can support ${company}'s priorities for the ${role} role. Thank you for your time and consideration.`;

  return coverLetterSchema.parse({
    company,
    role,
    salutation: `Dear ${company} hiring team,`,
    opening,
    highlights,
    body,
    closing,
    signature: name,
    tone: "Direct, concise, and evidence-led.",
    wordCount: [opening, ...highlights, body, closing].join(" ").split(/\s+/).filter(Boolean).length,
    keyEvidence: highlights,
    generatedAt: new Date().toISOString(),
  });
}

/* ---------- 4. interview prep (heuristic, resume-grounded) ---------- */

/**
 * Deterministic interview-prep fallback. No network/knowledge — it builds a
 * sensible, resume-grounded brief from the candidate's own data + the role
 * archetype so the feature is fully usable before Azure is configured (or if a
 * model call fails). Mirrors the real `InterviewPrep` shape exactly.
 */
export function mockInterviewPrep(input: {
  company: string;
  role: string;
  resume: ResumeData;
  insights?: ProfileInsights | null;
  jd?: { requirements?: string[]; responsibilities?: string[]; keywords?: string[] } | null;
}): InterviewPrep {
  const { company, role, resume, insights, jd } = input;
  const corpus = resumeToPlainText(resume);
  const archetype = insights?.archetypes[0]?.name || detectArchetype(role, corpus);
  const isEng = /engineer|developer|backend|frontend|full|data|devops|platform|mobile/i.test(archetype + role);
  const isPM = /product manager|product owner/i.test(archetype + role);

  const proof = insights?.proofPoints ?? [];
  const skills = (insights?.keySkills?.length ? insights.keySkills : topSkills(resume)).slice(0, 12);
  const firstProof = proof[0]?.headline || quantifiedLines(resume)[0]?.text || "";

  // --- talking points from real proof points / strongest skills ---
  const talkingPoints = (proof.length ? proof.slice(0, 4) : skills.slice(0, 3).map((s) => ({ headline: s, detail: "", metrics: [] as string[] })))
    .map((p, i) => ({
      point: p.headline,
      evidence: p.detail || (p.metrics?.length ? p.metrics.join(", ") : "From your resume."),
      useWhen: i === 0 ? "Your opening / 'walk me through your background'." : "When the conversation reaches relevant scope.",
    }));

  // --- question groups, role-aware, grounded with resume hooks ---
  const behavioral = {
    category: "Behavioral",
    questions: [
      {
        question: "Walk me through your background and what brought you here.",
        rationale: "Sets the frame; they're checking your narrative is coherent and relevant to this role.",
        approach: "Give a 90-second arc: where you started, the through-line, and why this role is the logical next step.",
        resumeHook: firstProof || (resume.contact.title ? `Lead with your work as ${resume.contact.title}.` : ""),
      },
      {
        question: "Tell me about a time you faced a hard problem and how you handled it.",
        rationale: "Probes ownership, judgment, and how you operate under pressure.",
        approach: "Use STAR (Situation, Task, Action, Result). Keep it tight and end on the measurable result.",
        resumeHook: proof[1]?.headline || firstProof || "",
      },
      {
        question: `Why ${company}, and why this role?`,
        rationale: "Checks genuine interest and that you've done your homework.",
        approach: `Connect their product/mission to something specific in your own work and goals.`,
        resumeHook: "",
      },
    ],
  };

  const roleSpecific = {
    category: isEng ? "Technical / role-specific" : isPM ? "Product sense" : "Role-specific",
    questions: (jd?.requirements?.length ? jd.requirements.slice(0, 4) : skills.slice(0, 4)).map((r) => ({
      question: isEng
        ? `How have you applied ${r} in your work?`
        : `Tell me about your experience with ${r}.`,
      rationale: "Maps a specific requirement to your real experience.",
      approach: "Name the concrete project, what you did, the tools, and the outcome.",
      resumeHook: corpus.toLowerCase().includes(String(r).toLowerCase().split(/\s+/)[0]) ? `You reference ${r}-related work in your resume — use that example.` : "",
    })),
  };

  const designOrSystem = isEng
    ? {
        category: "System design",
        questions: [
          {
            question: `Design a system relevant to ${company}'s product at scale.`,
            rationale: "Tests architecture thinking, tradeoffs, and how you reason about scale.",
            approach: "Clarify requirements first, sketch the high-level design, then go deep where they push. Talk tradeoffs out loud.",
            resumeHook: proof.find((p) => /scale|latency|throughput|system|infra|api/i.test(p.headline))?.headline || "",
          },
          {
            question: "How would you debug a production incident affecting users right now?",
            rationale: "Checks calm, methodical debugging and prioritization under pressure.",
            approach: "Triage impact, stabilize first, find root cause, then prevent recurrence. Mention observability.",
            resumeHook: "",
          },
        ],
      }
    : {
        category: isPM ? "Execution & analytics" : "Craft & collaboration",
        questions: [
          {
            question: isPM ? "How do you decide what to build and measure success?" : "How do you partner with engineers and stakeholders?",
            rationale: "Checks how you prioritize and work cross-functionally.",
            approach: "Show a framework, then a real example where you applied it.",
            resumeHook: proof[0]?.headline || "",
          },
        ],
      };

  const questionGroups = [behavioral, roleSpecific, designOrSystem].filter((g) => g.questions.length);

  const questionsToAsk = [
    `What does success look like in this role in the first 6 months?`,
    `What are the biggest challenges the team is facing right now?`,
    `How is the team structured, and who would I work with most closely?`,
    `How does ${company} make product/technical decisions?`,
    `What's the path for growth from this role?`,
    `What's one thing that would make someone exceptional here versus just good?`,
  ];

  const prepPlan = [
    { task: `Research ${company} deeply`, detail: "Read their product pages, recent blog/news, and how they describe their mission. Try the product if you can." },
    { task: "Prepare 3–4 STAR stories", detail: "Map your strongest proof points to likely behavioral prompts so you're not improvising." },
    { task: isEng ? "Drill fundamentals + practice problems" : "Practice a case out loud", detail: isEng ? "Refresh data structures/algorithms and one system-design template." : "Run through a mock prompt end to end, talking through your reasoning." },
    { task: "Prepare your questions", detail: "Pick 4–5 of the suggested questions that you genuinely care about." },
    { task: "Logistics check", detail: "Confirm time zone, tools (video/coding platform), and have your resume + notes handy." },
  ];

  const watchouts = [
    proof.length ? "Lead with metrics — you have quantified wins, make sure they hear them." : "Quantify your impact where you can; add numbers to your stories.",
    "Don't ramble — keep behavioral answers under ~2 minutes and end on the result.",
    `Tie answers back to ${company}'s context rather than generic statements.`,
  ];

  const readiness = Math.min(92, 58 + Math.min(20, proof.length * 4) + Math.min(14, skills.length));

  return interviewPrepSchema.parse({
    company,
    role,
    overview: `You've got an interview for ${role} at ${company}. Expect a focused loop that tests ${isEng ? "your fundamentals and how you work" : isPM ? "product sense, execution, and collaboration" : "your craft and how you partner with others"}. Lead with your strongest, most relevant evidence and connect everything back to ${company}.`,
    readiness,
    companyResearch: {
      summary: `${company} operates in the ${archetype.toLowerCase()} space. Read up on their product and mission so you can connect your answers to what they actually do.`,
      products: [],
      mission: "",
      culture: insights?.coreStrengths?.slice(0, 3) ?? [],
      signals: [],
      interviewReputation: "Expect a structured loop. Be ready to go deep on real examples from your experience.",
    },
    roleInsights: {
      summary: `As a ${role}, you'll be judged on ${isEng ? "technical depth, problem-solving, and collaboration" : isPM ? "judgment, prioritization, and outcomes" : "craft, process, and impact"}.`,
      focusAreas: jd?.responsibilities?.slice(0, 5) ?? skills.slice(0, 5),
      successLooksLike: ["Ship work that matters early", "Communicate clearly with the team", "Show measurable impact"],
    },
    candidateVoices: [],
    reportedQuestions: behavioral.questions.slice(0, 3).map((q) => ({
      question: q.question,
      round: "",
      source: "inferred",
      inferred: true,
    })),
    questionGroups,
    talkingPoints,
    questionsToAsk,
    prepPlan,
    watchouts,
    sources: [],
    researchFound: false,
    generatedAt: new Date().toISOString(),
  });
}
