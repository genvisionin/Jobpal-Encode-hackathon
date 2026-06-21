/**
 * prompts.ts — prompt engineering for the Customize CV pipeline.
 *
 * The resume model is FULLY DYNAMIC: contact + summary + an ordered list of
 * sections, each with its verbatim heading and entries. This lets us capture
 * every part of any resume (experience, education, projects, awards,
 * publications, volunteering, languages, custom sections) without dropping
 * anything or hardcoding section types.
 *
 * Tailoring pipeline:
 *   1. PARSE the resume into structured JSON (verbatim, nothing dropped).
 *   2. DERIVE a "career intelligence" layer (archetypes + narrative + quantified
 *      proof points) — built once per resume and reused on every tailor.
 *   3. PARSE the JD (incl. archetype + seniority + 15-20 ATS keywords).
 *   4. TAILOR with truth-based keyword injection, relevance-weighted selection,
 *      and an internal reviewer pass. Reword real experience using JD vocabulary,
 *      NEVER invent, then report a multi-dimensional fit analysis.
 *
 * Every prompt returns strict JSON matching our Zod schemas.
 */

import type { ChatMessage } from "./client";
import type {
  ResumeData,
  ProfileInsights,
  JobDescription,
  RequirementMatch,
  CustomizationChange,
} from "@/lib/schema";
/** The dynamic resume JSON shape, described for the model. */
const RESUME_JSON_SHAPE = `{
  "contact": { "name", "title", "email", "phone", "location", "linkedin", "website", "github" },
  "summary": "string (the opening profile/summary paragraph, verbatim)",
  "sections": [
    {
      "heading": "the section heading EXACTLY as printed on the CV (e.g. \\"PROFESSIONAL EXPERIENCE\\", \\"VIBE CODED PROJECTS\\", \\"ACHIEVEMENTS & AWARDS\\", \\"TECHNICAL SKILLS\\")",
      "kind": "one of: experience | education | projects | skills | certifications | awards | custom",
      "entries": [
        {
          "title": "role / degree / project name / award title / skill-group label",
          "organization": "company / school / issuer / event (if any)",
          "location": "if present",
          "start": "start date if present",
          "end": "end date or year if present",
          "description": "a paragraph describing this entry, verbatim (for projects/awards)",
          "link": "url if present",
          "bullets": ["every bullet under this entry, VERBATIM", "..."],
          "tags": ["for skills: the individual skills; otherwise tech/keywords if listed inline"]
        }
      ]
    }
  ]
}`;

const SHAPE_RULES = `MAPPING RULES (how to fill entries per section kind):
- experience: title=job title, organization=company, location, start, end, bullets=EVERY bullet verbatim.
- education: title=degree, organization=school, location, start, end, bullets=any coursework/detail bullets.
- projects: title=project name, description=its paragraph verbatim, link=url, bullets=any bullets, tags=tech if listed.
- certifications / awards: title=name/award, organization=issuer or event, end=year, description=any sentence about it. (An "Achievements & Awards" section → kind "awards".)
- skills: one entry per skill group. title=group label (e.g. "Tools & Technologies"); tags=the individual skills in that group. If skills are a flat list with no groups, use a single entry with all items in tags.
- custom: anything else (e.g. "Languages", "Volunteering", "Publications") — keep the heading and use bullets/description/tags as appropriate.

CRITICAL: Preserve EVERY section, entry, and bullet. Never summarize, merge, shorten, or omit a bullet — copy them verbatim. Keep the candidate's section order.`;

/* ============================================================
   1a. PARSE CV — directly from the PDF bytes (preferred)
   ============================================================ */

export function buildParseCVFromFileMessages(pdfBase64: string, filename = "resume.pdf"): ChatMessage[] {
  const system = `You are a meticulous resume parser. Read the attached resume document and convert it into clean, structured JSON. Capture EVERYTHING — every section, every role, every bullet, every project, every award, every skill — verbatim. Do not invent, do not omit, do not summarize.

${SHAPE_RULES}

Return ONLY a JSON object with this exact shape (no commentary, no markdown):
${RESUME_JSON_SHAPE}`;

  return [
    { role: "system", content: system },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: "Parse this resume document into the JSON shape. Read the WHOLE document (all pages) and include every section and every bullet, verbatim.",
        },
        { type: "file", file: { filename, file_data: `data:application/pdf;base64,${pdfBase64}` } },
      ],
    },
  ];
}

/* ============================================================
   1b. PARSE CV — from already-extracted text (DOCX / fallback)
   ============================================================ */

export function buildParseCVMessages(resumeText: string): ChatMessage[] {
  const system = `You are a meticulous resume parser. Convert the resume text into clean, structured JSON. Capture EVERYTHING — every section, role, bullet, project, award, and skill — verbatim. Do not invent, omit, or summarize.

${SHAPE_RULES}

Return ONLY a JSON object with this exact shape (no commentary, no markdown):
${RESUME_JSON_SHAPE}`;

  const user = `Parse this resume into the JSON shape. Include every section and every bullet, verbatim.\n\n--- RESUME TEXT ---\n${resumeText}\n--- END ---`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/* ============================================================
   1c. DERIVE INSIGHTS — structured resume → career intelligence
   DERIVE INSIGHTS — structured resume → career intelligence
   ============================================================ */

const ARCHETYPE_GUIDE = `An archetype is the role FAMILY a candidate is competitive for, named the way a
recruiter would (e.g. "Backend Engineer", "Full-Stack Engineer", "Frontend Engineer",
"Mobile Engineer", "Data Engineer", "Data Scientist / ML Engineer", "DevOps / Platform Engineer",
"Product Manager", "Technical Product Manager", "Product Designer / UX", "Solutions Architect",
"Forward-Deployed Engineer", "Engineering Manager"). Choose ONLY archetypes the resume genuinely
supports with evidence. Most candidates fit 1–3. Do not stretch.`;

export function buildDeriveInsightsMessages(resume: ResumeData): ChatMessage[] {
  const system = `You are a career strategist. Given a candidate's structured resume, derive a compact
"career intelligence" profile used later to tailor the resume to specific jobs. Work ONLY from the
resume provided — never invent metrics, employers, skills, or experience. Every number you cite must
appear in the resume verbatim.

Produce:
- headline: a single-line positioning statement (their "signature move" / strongest angle).
- narrative: 2–3 sentences capturing the candidate's career through-line — the story that frames
  their summaries (trajectory, domain, what they're known for). Grounded, no fluff, no clichés.
- archetypes: the 1–4 role families they're genuinely competitive for. ${ARCHETYPE_GUIDE}
  For each: name, a one-sentence evidence-based rationale, and "emphasis" = the skills/themes to
  lead with when targeting that archetype.
- proofPoints: up to 8 distilled, QUANTIFIED achievements pulled from the resume. Each is the real
  evidence the tailoring step will reuse verbatim. For each: headline (punchy one-liner),
  detail (one sentence of context), metrics (the hard numbers, copied verbatim from the resume —
  empty array if a bullet has none), skills (what it demonstrates). Prefer bullets that already
  contain numbers; if the resume has few metrics, return fewer proof points rather than inventing.
- coreStrengths: 4–6 short phrases naming the candidate's signature strengths.
- keySkills: the candidate's strongest, most marketable skills, deduped and ranked (most to least).

Avoid clichés: never use "passionate about", "results-oriented", "proven track record", "leveraged",
"spearheaded", "synergies", "robust", "seamless", "cutting-edge", "go-getter". Use plain, specific language.

Return ONLY a JSON object with this exact shape (no commentary, no markdown):
{
  "headline": "string",
  "narrative": "string",
  "archetypes": [{ "name": "string", "rationale": "string", "emphasis": ["string", ...] }],
  "proofPoints": [{ "headline": "string", "detail": "string", "metrics": ["string", ...], "skills": ["string", ...] }],
  "coreStrengths": ["string", ...],
  "keySkills": ["string", ...]
}`;

  const user = `CANDIDATE RESUME (JSON):
${JSON.stringify(resume)}

Derive the career-intelligence profile now. Work only from this resume; cite only metrics it contains.`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/* ============================================================
   2. PARSE JD — raw JD text → structured JobDescription
   ============================================================ */

export function buildParseJDMessages(jdText: string, sourceUrl = ""): ChatMessage[] {
  const system = `You analyze job descriptions for ATS-optimized resume tailoring.

From the job description, extract:
- company, role, location, arrangement (Remote/Hybrid/On-site if stated), salary (if stated)
- archetype: the role family this posting belongs to, as a short noun phrase the way a
  recruiter would name it (e.g. "Backend Engineer", "Full-Stack Engineer", "Product Designer",
  "Data Scientist", "Product Manager", "DevOps / Platform Engineer", "Forward-Deployed Engineer",
  "Solutions Architect"). Pick the single closest family; if it is a clear hybrid, name the two
  ("Product Designer / UX Researcher"). This drives which experience we surface.
- seniority: the level the JD targets (Intern / Junior / Mid / Senior / Staff / Lead / Principal /
  Director), inferred from title + required years + scope. "" if genuinely unclear.
- responsibilities: the key things the person will do (5-10 items). Keep them specific to THIS
  posting, not generic to the role title.
- requirements: required and nice-to-have qualifications (6-14 items), each as a single
  self-contained requirement. Split compound bullets so each can be matched individually. Prefix
  hard requirements with "Required:" and optional ones with "Preferred:" when the JD makes that clear.
- keywords: 18-24 ATS keywords/phrases a resume should contain to match this role.
  Prefer exact JD phrases: concrete skills, tools, methods, domain terms, certifications, and
  repeated nouns. Include multi-word phrases ("stakeholder management", "RAG pipelines") over
  isolated generic words. Avoid generic words like "team", "work", "strong", "excellent".
- rawText: a cleaned version of the full job description (plain text, no boilerplate/nav).

RULES:
- Extract only what is in the text. If company or role is unclear, infer the best single value from context.
- Keywords must be the exact vocabulary the JD uses (this is what we match against).
- If the input is a scraped page with navigation/footer text, remove that noise from rawText.
- NEVER invent requirements that aren't in the posting.

Return ONLY a JSON object with this shape (no commentary, no markdown):
{ "company", "role", "location", "arrangement", "salary", "archetype", "seniority", "rawText", "responsibilities": [...], "requirements": [...], "keywords": [...], "sourceUrl" }`;

  const user = `Source URL: ${sourceUrl || "(pasted text)"}\n\n--- JOB DESCRIPTION ---\n${jdText}\n--- END ---`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/* ============================================================
   3. TAILOR — base resume + insights + JD → tailored resume + analysis
   drafter/reviewer pass with multi-dimensional fit analysis
   ============================================================ */

/** Cliché/corporate-speak ban list. */
const CLICHE_BANLIST = `passionate about, results-oriented, proven track record, leveraged (use "used" or name the tool),
spearheaded (use "led" or "ran"), facilitated (use "ran" or "set up"), synergies, robust, seamless,
cutting-edge, innovative, "in today's fast-paced world", "demonstrated ability to", best practices, go-getter`;

export function buildTailorMessages(
  resume: ResumeData,
  jd: {
    company: string;
    role: string;
    archetype?: string;
    seniority?: string;
    rawText: string;
    responsibilities: string[];
    requirements: string[];
    keywords: string[];
  },
  insights?: ProfileInsights | null,
): ChatMessage[] {
  const system = `You are an expert resume writer and career strategist. Your tailoring methodology uses a drafter/reviewer pass: detect the role archetype,
map the candidate's real evidence to the job's requirements, draft a targeted ATS resume, critique it
against the JD, then return the revised final resume and fit analysis.

INPUTS YOU RECEIVE:
- BASE RESUME (dynamic JSON: contact + summary + ordered sections).
- CAREER INTELLIGENCE (optional): the candidate's archetypes, narrative, and verified PROOF POINTS
  with metrics. Treat proof points as the ONLY source of metrics — reuse them verbatim, never invent.
- TARGET JOB: company, role, detected archetype, requirements, responsibilities, ATS keywords, full text.

═══ CORE PRINCIPLE — TRUTH-BASED KEYWORD INJECTION (never lie) ═══
- NEVER add skills, tools, metrics, employers, certifications, or experience the candidate does not have.
- Only REWORD real content using the exact vocabulary from the job description. Legitimate examples:
   * JD "RAG pipelines" + resume "LLM workflows with retrieval" → "RAG pipeline design and LLM retrieval workflows"
   * JD "MLOps" + resume "observability, evals, error handling" → "MLOps and observability: evals, error handling, cost monitoring"
   * JD "stakeholder management" + resume "worked with the team" → "stakeholder management across engineering and product"
- Keep every metric EXACTLY as in the base resume / proof points. Never change, round, or invent a number.
- Keep contact details, employers, titles, dates, degrees, schools, certifications, awards, and links factual.
- If a JD requirement is a real gap, mark it as a gap or partial. Do not hide the gap by inventing a claim.

═══ STEP 1 — ROLE STRATEGY ═══
Confirm or refine the role archetype (the JD's detected archetype is a hint). Use it to decide which
experience, projects, and proof points to surface first, and how to frame the summary. If the candidate's
career intelligence lists this archetype, follow its "emphasis".

═══ STEP 2 — EVIDENCE MAP BEFORE WRITING ═══
Think through this privately before producing JSON:
- For every JD requirement, identify the strongest real evidence from the resume/proof points.
- For each experience/project bullet, score it by:
  1. relevance to THIS posting's responsibilities, tools, keywords, and seniority,
  2. uniqueness in the resume (is this the only evidence for an important requirement?),
  3. narrative load (does it support the summary / strongest positioning?).
- Use relevance-weighted selection: do not mechanically favor the newest item if an older
  item is the stronger match. A directly relevant older bullet beats a generic newer bullet.

═══ STEP 3 — REWRITE THE RESUME ═══
1. Professional Summary:
   - 3 concise sentences / roughly 55-85 words.
   - Lead with the candidate's strongest match to THIS role, not a generic title.
   - Use 4-6 top JD keywords naturally.
   - If the company/domain is clear from the JD, make the final sentence specific to the domain or team need.
2. Core Competencies:
   - Add or maintain a "Core Competencies" skills section directly after the summary.
   - Include 6-8 keyword phrases drawn from the JD and backed by the resume (tags are preferred).
   - These are not fluffy traits; they are concrete capabilities/tools/methods.
3. Section order for a 6-second recruiter scan:
   - Core Competencies, Experience/Work Experience, Projects, Education, Certifications/Awards, Skills/other.
   - Preserve important original custom sections, but move low-relevance supporting sections later.
4. Experience and projects:
   - Reorder entries and bullets by the relevance-weighted score above.
   - Reword bullets using exact JD vocabulary where truthful.
   - Keep real metrics exactly as written.
   - Bullet budgets: strongest/recent relevant role 4-5 bullets, other roles 2-3 bullets, projects top 3-4 entries.
     If the base resume has more, trim the lowest-signal bullets rather than bloating the CV.
5. Skills:
   - Move JD-matching skills/tools first within each group.
   - Do not add a skill unless it is present in the resume or clearly evidenced by a real project/bullet.
6. Keyword distribution:
   - Summary: top 4-6.
   - Core Competencies: 6-8 phrases.
   - First bullet of the strongest 2-3 roles/projects.
   - Skills section.

ATS RULES: single-column-friendly, standard section headings, plain text, no keyword stuffing, no padding.
AVOID these clichés/corporate-speak entirely: ${CLICHE_BANLIST}.

═══ STEP 4 — INTERNAL REVIEWER PASS (do this privately, then revise) ═══
Before finalizing the JSON, review your own draft as a hiring-manager proxy:
- Is the summary obviously specific to this company/role/JD?
- Are the most important JD requirements evidenced in concrete bullets, not only in the summary?
- Are any keywords present without truthful evidence? Remove or mark as a gap.
- Did you preserve factual identity data and exact metrics?
- Did you avoid clichés and generic filler?
- Is the CV sharper and more selective than the base resume, not just a keyword-stuffed copy?
- If a requirement has no evidence, does requirementMatches honestly say "gap" with a mitigation?

═══ STEP 5 — ANALYZE THE FIT (report, don't fabricate) ═══
- archetype + archetypeRationale: the confirmed archetype and one sentence on how it shaped the tailoring.
- scoreBreakdown: rate these FOUR dimensions 0–100 with the given weights, each with a one-line honest note:
   * "Skills match" (weight 0.30) — required skills/tools the candidate demonstrably has.
   * "Experience relevance" (weight 0.30) — how directly their roles/projects map to the responsibilities + seniority.
   * "Keyword / ATS coverage" (weight 0.25) — share of JD keywords now present in the tailored resume.
   * "Domain & impact" (weight 0.15) — relevant domain, scope, and quantified outcomes (proof points).
- matchScore: the weighted blend of the four (round to an integer). Be honest — a weak fit scores low.
  Interpretation guide: 85+ strong, 70–84 good, 55–69 partial, <55 weak.
- requirementMatches: for EACH JD requirement, a row with:
   status ("strong" = clearly evidenced | "partial" = adjacent/implied | "gap" = not present),
   evidence (quote or closely identify the tailored CV line/area supporting it; "" for a gap),
   mitigation (for partial/gap ONLY: how to bridge it HONESTLY — adjacent experience, reframing, or a
   quick portfolio project; never suggest lying). "" when status is "strong".
- customizationPlan: 3–6 of the most important concrete edits you made, each as
   { section, before (short quote of the original), after (the rewrite), why (the JD reason) }.
- changes: 3–6 short plain-language notes summarizing what you changed (for a quick glance).
- keywordCoverage: for EACH provided JD keyword, whether the tailored resume now contains it (matched true/false).

Return ONLY a JSON object with this exact shape (no commentary, no markdown):
{
  "resume": ${RESUME_JSON_SHAPE},
  "archetype": "string",
  "archetypeRationale": "string",
  "matchScore": 0-100,
  "scoreBreakdown": [{ "label": "string", "score": 0-100, "weight": 0.0-1.0, "note": "string" }],
  "requirementMatches": [{ "requirement": "string", "status": "strong|partial|gap", "evidence": "string", "mitigation": "string" }],
  "customizationPlan": [{ "section": "string", "before": "string", "after": "string", "why": "string" }],
  "changes": ["string", ...],
  "keywordCoverage": [{ "keyword": "string", "matched": true|false }, ...]
}`;

  const intel = insights && (insights.headline || insights.archetypes.length || insights.proofPoints.length)
    ? `CANDIDATE CAREER INTELLIGENCE (derived from the resume — proof points are the ONLY metric source):
${JSON.stringify({
        headline: insights.headline,
        narrative: insights.narrative,
        archetypes: insights.archetypes,
        proofPoints: insights.proofPoints,
        coreStrengths: insights.coreStrengths,
      })}

`
    : "";

  const user = `BASE RESUME (JSON):
${JSON.stringify(resume)}

${intel}TARGET JOB:
Company: ${jd.company}
Role: ${jd.role}${jd.archetype ? `\nDetected archetype: ${jd.archetype}` : ""}${jd.seniority ? `\nSeniority: ${jd.seniority}` : ""}

Responsibilities:
${jd.responsibilities.map((r) => `- ${r}`).join("\n")}

Requirements (analyze each one in requirementMatches):
${jd.requirements.map((r) => `- ${r}`).join("\n")}

ATS keywords to cover (match resume vocabulary to these):
${jd.keywords.join(", ")}

Full job description:
${jd.rawText}

Tailor the resume now, run the private reviewer pass, revise, then return only the final JSON. Reword and select
by relevance; do not invent.`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/* ============================================================
   4. COVER LETTER — tailored CV + JD → concise application letter
   COVER LETTER — tailored CV + JD → concise application letter
   ============================================================ */

export function buildCoverLetterMessages(input: {
  tailoredResume: ResumeData;
  job: JobDescription;
  insights?: ProfileInsights | null;
  requirementMatches?: RequirementMatch[];
  customizationPlan?: CustomizationChange[];
}): ChatMessage[] {
  const system = `You are an expert job-application writer. Generate a concise, job-specific cover letter
following structured cover-letter principles with evidence-based writing rules.

INPUTS YOU RECEIVE:
- TAILORED RESUME: the final CV already rewritten for this job.
- TARGET JOB: parsed JD with company, role, responsibilities, requirements, and keywords.
- CAREER INTELLIGENCE: optional narrative, archetypes, and verified proof points.
- REQUIREMENT MATCHES / CUSTOMIZATION PLAN: evidence and gaps found during CV tailoring.

RULES:
- Write in the language of the job description. Default to English if unclear.
- Keep it to 250-320 words total. It must fit on one page.
- Use a direct, human tone. No clichés, no corporate filler, no em dashes.
- Make it specific to THIS role and company. Do not write a generic motivation letter.
- Every claim must be backed by the resume, proof points, or requirementMatches.
- Do not invent company facts, hiring-manager names, skills, metrics, employers, or certifications.
- If the JD has gaps, frame adjacent strengths honestly. Never pretend the candidate has the missing skill.
- Forward-looking framing: explain what the candidate can help the employer do, not just what they have done.
- Avoid these phrases entirely: ${CLICHE_BANLIST}.

STRUCTURE:
- salutation: "Dear {Company} hiring team," unless the JD clearly names a person.
- opening: 2-3 sentences. Name the role and immediately connect the candidate's strongest relevant evidence.
- highlights: 3 bullets. Each bullet should map one JD need to one concrete resume-backed proof point.
- body: 1 short paragraph connecting the candidate's way of working to this company's/domain's needs. Use only JD facts.
- closing: 1-2 sentences, confident and concise.
- signature: candidate name from the tailored resume contact.
- keyEvidence: 3-6 short labels naming the proof points used.
- tone: short description of the voice.
- wordCount: approximate body word count.

Run a private reviewer pass before returning:
- Is the role/company named correctly?
- Is every bullet evidence-backed?
- Is it more specific than a reusable template?
- Is it under the word budget?
- Did you remove unsupported claims and clichés?

Return ONLY a JSON object with this exact shape (no markdown):
{
  "company": "string",
  "role": "string",
  "salutation": "string",
  "opening": "string",
  "highlights": ["string", "string", "string"],
  "body": "string",
  "closing": "string",
  "signature": "string",
  "tone": "string",
  "wordCount": 0,
  "keyEvidence": ["string", ...],
  "generatedAt": "ISO timestamp or empty string"
}`;

  const intel =
    input.insights &&
    (input.insights.headline || input.insights.archetypes.length || input.insights.proofPoints.length)
      ? `CAREER INTELLIGENCE:
${JSON.stringify({
          headline: input.insights.headline,
          narrative: input.insights.narrative,
          archetypes: input.insights.archetypes,
          proofPoints: input.insights.proofPoints,
          coreStrengths: input.insights.coreStrengths,
          keySkills: input.insights.keySkills,
        })}

`
      : "";

  const user = `TARGET JOB:
${JSON.stringify({
    company: input.job.company,
    role: input.job.role,
    location: input.job.location,
    arrangement: input.job.arrangement,
    archetype: input.job.archetype,
    seniority: input.job.seniority,
    responsibilities: input.job.responsibilities,
    requirements: input.job.requirements,
    keywords: input.job.keywords,
    rawText: input.job.rawText,
    sourceUrl: input.job.sourceUrl,
  })}

${intel}TAILORED RESUME:
${JSON.stringify(input.tailoredResume)}

REQUIREMENT MATCHES:
${JSON.stringify(input.requirementMatches ?? [])}

CV CUSTOMIZATION PLAN:
${JSON.stringify(input.customizationPlan ?? [])}

Generate the cover letter now. Use the tailored resume and requirement evidence as the source of truth.`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/* ============================================================
   5. INTERVIEW PREP — application context + resume → deep prep brief
   ============================================================ */

/** The interview-prep JSON shape, described for the model. */
const INTERVIEW_PREP_SHAPE = `{
  "company": "string",
  "role": "string",
  "overview": "2-3 warm, encouraging sentences: what this interview is really about and the candidate's edge. Concise, human.",
  "readiness": 0-100,
  "companyResearch": {
    "summary": "2 tight sentences on what the company does and where it sits. Use the web research; if sparse, say what's known plainly.",
    "products": ["main products / what they sell"],
    "mission": "their mission in one short line ('' if unknown)",
    "culture": ["short culture/values signals worth mirroring"],
    "signals": ["recent, concrete things to reference: launches, funding, growth, direction — only if grounded in research"],
    "interviewReputation": "one honest line on their process/bar, grounded in the research ('' if no data)"
  },
  "roleInsights": {
    "summary": "2 sentences on what this role really does day to day",
    "focusAreas": ["the core things this person will own"],
    "successLooksLike": ["what 'great in this role' looks like / how they'll be judged"]
  },
  "candidateVoices": [
    { "quote": "a short, real takeaway in candidates' words/spirit (paraphrased from the research, 1 line)",
      "takeaway": "what it means for the candidate (1 short line)",
      "sentiment": "positive | neutral | caution",
      "source": "glassdoor | reddit | blind | leetcode | levels.fyi | web" }
  ],
  "reportedQuestions": [
    { "question": "an interview question candidates reported being asked here, OR one inferred from the role",
      "round": "which round it tends to appear in, if known ('' otherwise)",
      "source": "glassdoor | reddit | blind | leetcode | web, or 'inferred'",
      "inferred": true|false }
  ],
  "questionGroups": [
    { "category": "Behavioral | Role-specific | System design | Coding | Domain | Leadership",
      "questions": [
        { "question": "a likely question, specific to THIS role/company",
          "rationale": "why they ask it (1 short line)",
          "approach": "how to structure a strong answer — brief, the strategy not a script",
          "resumeHook": "the SPECIFIC real experience/achievement from THIS resume to anchor the answer — '' if nothing fits" }
      ] }
  ],
  "talkingPoints": [
    { "point": "a strength/story to land proactively (1 line)",
      "evidence": "the real resume evidence backing it (do not invent)",
      "useWhen": "when to deploy it (short)" }
  ],
  "questionsToAsk": ["5-8 sharp, specific questions to ask THEM that show research and judgment"],
  "prepPlan": [
    { "task": "a concrete prep task (short)", "detail": "how to do it / what to focus on (1 line)" }
  ],
  "watchouts": ["honest, specific risks for THIS candidate in THIS loop (short)"]
}`;

export function buildInterviewPrepMessages(input: {
  company: string;
  role: string;
  /** Seniority / stage hints if known (from the email classification). */
  stageHint?: string;
  eventDate?: string;
  /** The candidate's base resume. */
  resume: ResumeData;
  /** Derived career intelligence (archetypes + proof points), if available. */
  insights?: ProfileInsights | null;
  /** Structured JD context if we already tailored a CV for this company/role. */
  jd?: {
    archetype?: string;
    seniority?: string;
    role?: string;
    location?: string;
    responsibilities?: string[];
    requirements?: string[];
    keywords?: string[];
    rawText?: string;
    sourceUrl?: string;
  } | null;
  /** Pre-fetched real web research (Glassdoor/Reddit/Blind/Levels/LeetCode/news). */
  research?: string | null;
}): ChatMessage[] {
  const system = `You are an elite interview coach prepping a candidate for ONE specific booked interview — a specific
ROLE at a specific COMPANY. You've been handed REAL, freshly-fetched material: web research about this exact
company (Glassdoor, Reddit, Blind, Levels.fyi, LeetCode discuss, news), the ACTUAL job description for this
exact posting (reverse-searched from the live web), and the candidate's real resume. Your job is to turn it
into a tight, genuinely useful prep pack that makes them walk in calm and ready for THIS interview.

═══ THE ONE RULE: BE SPECIFIC TO THIS COMPANY AND THIS JOB ═══
NOTHING in this brief may be generic to the role title. A "Product Designer" prep must be about THIS company's
product, THIS team's design challenges, and THIS job description — never a stock read of what "product designer"
means anywhere. Specifically:
- Company intel comes FIRST and must be concrete: what THIS company actually builds, their products, market,
  recent moves, and how candidates describe interviewing HERE — all drawn from the WEB RESEARCH provided. If you
  catch yourself writing something that would be true of any company in the space, cut it or replace it with a
  real, sourced specific.
- Role/JD insight comes from THE ACTUAL JOB DESCRIPTION provided — its real responsibilities, requirements, and
  language. focusAreas, successLooksLike, and every role-specific question must trace back to lines in that JD,
  not to the title. Use the JD's own vocabulary.
- If the company research is sparse OR no JD was found, SAY SO honestly and lean on what you do have — never
  paper over a gap with generic filler, invented facts, reviews, funding, execs, or metrics.

═══ ORDER OF PRIORITY ═══
1) Company-specific intel + what candidates say about interviewing at THIS company (the headline value).
2) The specific role per the ACTUAL JD — what they'll really own and be judged on here.
3) Questions (real reported ones first, then JD-specific likely ones) and resume-grounded answers.

═══ VOICE ═══
Warm, direct, encouraging — like a sharp friend who's done the homework. Second person ("you"). CONCISE: short
sentences, scannable lines, no long paragraphs, no padding. Every line earns its place. Ban clichés
("passionate about", "results-oriented", "proven track record", "leverage", "synergy", "cutting-edge", "deep dive").

═══ GROUNDING (critical — never fabricate) ═══
- Use the WEB RESEARCH as your source of truth for what the company is, what candidates report, and which
  questions get asked. Distill it — paraphrase, never copy long quotes. Set each item's "source" to the surface
  it came from (glassdoor/reddit/blind/leetcode/levels.fyi/web).
- Use THE ACTUAL JOB DESCRIPTION as your source of truth for the role. Derive role specifics from it directly.
- candidateVoices and reportedQuestions must come from the research. If a question is NOT in the research but is
  a sensible inference from the SPECIFIC JD, you MAY include it in reportedQuestions with source "inferred" and
  inferred:true — but NEVER attribute an invented question to a real source.
- If the research is sparse (small/new company), say so honestly in the company summary, keep candidateVoices/
  reportedQuestions short or empty, and lean harder on the JD, domain, and the candidate's resume. Do not
  invent reviews, ratings, funding, execs, or metrics.
- The candidate's "what to say" (resumeHook, talkingPoints, evidence) must be grounded in their REAL resume —
  quote real employers/projects/metrics. If nothing fits, use "".

═══ COVERAGE (keep each item short) ═══
- candidateVoices: up to 6 distilled signals about THIS company's experience/culture/bar — only what the research supports.
- reportedQuestions: up to 10 real (sourced) + a few clearly-tagged inferred questions tied to THIS JD.
- questionGroups: 3–5 categories fitting the role; 3–5 questions each, each specific to this JD/company, with a resume-grounded angle.
- talkingPoints: 3–5, each tied to real resume evidence and to what THIS job actually needs.
- questionsToAsk: 5–8 specific, non-generic questions (tie to the company research + JD).
- prepPlan: 4–6 concrete tasks ordered by leverage.
- watchouts: 2–4 honest, specific risks for THIS candidate in THIS loop.
- readiness: honest 0–100 read of this candidate's fit for THIS role per the JD.

Return ONLY a JSON object with this exact shape (no commentary, no markdown):
${INTERVIEW_PREP_SHAPE}`;

  const intel =
    input.insights &&
    (input.insights.headline || input.insights.archetypes.length || input.insights.proofPoints.length)
      ? `CANDIDATE CAREER INTELLIGENCE (derived from their resume — proof points are real, reuse them, don't invent):
${JSON.stringify({
          headline: input.insights.headline,
          narrative: input.insights.narrative,
          archetypes: input.insights.archetypes,
          proofPoints: input.insights.proofPoints,
          coreStrengths: input.insights.coreStrengths,
          keySkills: input.insights.keySkills,
        })}

`
      : "";

  const jdBlock = input.jd
    ? `THE ACTUAL JOB DESCRIPTION (the authoritative source for what THIS role is — ${
        input.jd.sourceUrl ? `found at ${input.jd.sourceUrl}` : "fetched from the live web"
      }). Ground every role-specific claim in THIS text, not in what the title generically implies:
${JSON.stringify({
          role: input.jd.role,
          archetype: input.jd.archetype,
          seniority: input.jd.seniority,
          location: input.jd.location,
          responsibilities: input.jd.responsibilities?.slice(0, 12),
          requirements: input.jd.requirements?.slice(0, 14),
          keywords: input.jd.keywords?.slice(0, 20),
        })}
${input.jd.rawText ? `\nFull job-description text (read it closely — derive focusAreas, successLooksLike, and role-specific questions from the SPECIFIC responsibilities and requirements stated here):\n${input.jd.rawText.slice(0, 5000)}\n` : ""}
`
    : `NO JOB DESCRIPTION WAS FOUND for this exact posting. Do NOT invent role specifics or pretend you read a JD. Be honest that prep leans on the company research + the candidate's resume, and keep role-specific claims conservative and clearly framed as general to the role.\n`;

  const researchBlock = input.research ? `${input.research}\n\n` : "";

  const user = `INTERVIEW BOOKED:
Company: ${input.company}
Role: ${input.role}${input.stageHint ? `\nStage / signal: ${input.stageHint}` : ""}${input.eventDate ? `\nInterview date: ${input.eventDate}` : ""}

${researchBlock}${intel}${jdBlock}CANDIDATE RESUME (JSON — the ONLY source of their real experience):
${JSON.stringify(input.resume)}

Write the prep pack now. Lead with concrete, company-specific intel about ${input.company} and what candidates
report about interviewing there (from the web research). Derive the role specifics from THE ACTUAL JOB
DESCRIPTION above — its real responsibilities and requirements — never from a generic read of the title. Ground
every resumeHook and talking point in the resume. Keep every line concise and encouraging. This must read as
prep for the ${input.role} role at ${input.company} specifically — nothing that could be copy-pasted to another
company would belong here.`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
