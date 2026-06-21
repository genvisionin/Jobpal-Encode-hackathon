# Jobpal

> Your story, tailored for every role.

A liquid-glass web app where students and job-seekers keep one master profile, instantly
tailor a resume to any job, discover fresh job alerts, and track every application
automatically from their inbox.

**Beta status:** all three core features are built end-to-end and run on real services —
Azure for parsing/tailoring, Supabase for auth + storage, and live ATS job boards for
alerts. The job feed and the Gmail tracker show real data only; when there's nothing to
show they fall back to an honest empty state, never fabricated content. Optional keys
(R2, Google OAuth) light up the remaining capabilities.

## Tech stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript** (strict)
- **next/font** for the three typefaces (Instrument Serif, Hanken Grotesk, JetBrains Mono)
- Plain CSS design system (`globals.css`) — the "Liquid Glass" language
- **Supabase** (Postgres) · **Cloudflare R2** (files) · **Azure AI Foundry** (LLM) ·
  **Google OAuth + Gmail** (tracker)
- Deploys to **Vercel** (includes a daily cron for tracker sync)

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000  (works with zero config)
```

Other scripts: `npm run build` · `npm run start` · `npm run lint` · `npm run typecheck`.

To enable real services, copy `.env.example` to `.env.local` and fill in what you have.
Everything is independently optional.

## CodePlain / ***plain product plan

This repository includes a prompt for generating the Jobpal CodePlain product
spec through the installed plain-forge workflow.

- `codeplain/JOBPAL_CODEPLAIN_GENERATION_PROMPT.md` — the detailed product brief.
- `.claude/` and `.codex/` — plain-forge skills and rules installed for local agent workflows.

Generate the `.plain` files with Claude Code and plain-forge:

```bash
claude -p --permission-mode acceptEdits "$(cat codeplain/JOBPAL_CODEPLAIN_GENERATION_PROMPT.md)"
```

Then validate the generated spec with CodePlain:

```bash
codeplain jobpal.plain --full-plain --no-log-to-file --headless
codeplain jobpal.plain --dry-run --no-log-to-file --headless
```

## Features

### 1. Customize CV
Upload a résumé (PDF/DOCX) → text extracted (`unpdf`/`mammoth`) → LLM structures it into the
base profile. Paste a job description or a job link (ATS APIs + scraper) → LLM tailors the
résumé with ATS-optimized keyword injection → pick from 6 ATS-friendly HTML templates → live
preview + print-to-PDF. Every place a résumé appears renders the real template.

### 2. Job Alerts
Set filters (role, location, country, arrangement, type, salary, level) → Jobpal scans
live public ATS job boards directly (Greenhouse / Lever / Ashby / Workable / SmartRecruiters
/ The Muse — no paid aggregator). Each job is scored against the user's profile; "New · 24h"
toggle; Apply opens the source posting; "Tailor CV" deep-links into Customize. No matches
returns an empty state, not filler.

### 3. Application Tracker (Gmail)
Connect Gmail (read-only OAuth) → from that day forward a daily 6am cron + manual sync ingest
new mail → the LLM classifies each email (filtering out noise) and a deterministic linker
de-duplicates into applications with a moving status (Applied → In review → Interview →
Decision). Idempotent on message id; a later rejection/offer updates the right row.

## Project structure

```
src/
├─ app/
│  ├─ globals.css            # Liquid Glass design system
│  ├─ (app)/                 # sidebar-framed screens: customize, alerts, tracker,
│  │                         #   profile, resumes, settings
│  ├─ onboarding/ intake/ builder/ cv/[id]/   # full-bleed flows
│  └─ api/                   # profile, customize, cv, jobs, tracker, cron
├─ components/
│  ├─ ui/                    # Icon, Aurora, Logo, Avatar, MatchRing, Toggle, StepDots…
│  ├─ layout/                # AppShell, Sidebar, Screen, PageHeader
│  └─ resume/                # MiniResume, ResumeThumbnail, CompanyMark, editor/
├─ lib/
│  ├─ schema/                # Zod data contracts (resume, job, tracker)
│  ├─ llm/                   # Azure client + prompts + deterministic mock
│  ├─ parsing/               # PDF/DOCX text extraction + JD scraping
│  ├─ templates/             # 3 base HTML renderers → 6 templates
│  ├─ jobs/                  # live ATS providers + aggregator + match scoring
│  ├─ tracker/               # Gmail OAuth, classify, linker, sync
│  ├─ db/                    # JobpalStore → Supabase or local JSON store
│  ├─ services/              # orchestration (profile, tailor)
│  └─ storage/               # Cloudflare R2
├─ data/                     # static UI data only (nav items, stage labels)
└─ types/                    # small cross-cutting UI types
```

### Conventions

- Screen-specific pieces are co-located in a route's `_components/`. Reusable pieces live in
  `src/components/*` with barrel `index.ts` exports. Import via the `@/` alias.
- **All user data flows through `src/lib/db` (the store) and `src/lib/schema` (Zod).** Server
  code imports feature barrels (`@/lib/jobs`, `@/lib/tracker`); client code imports their
  `…/types` modules only (the barrels pull in server-only deps like `fs`).
- The design system is CSS-class driven (`.glass`, `.btn`, `.chip`, `.field`, …). Use the
  `:root` CSS variables for color/radius; reach for classes before inline styles.
- Server Components by default; `"use client"` only where state/browser APIs are needed.

## Configuration

Copy `.env.example` → `.env.local`. All groups are optional:

| Group | Enables | Fallback when absent |
|-------|---------|----------------------|
| `AZURE_FOUNDRY_*` | Real CV/JD parsing, tailoring, email classification | Deterministic mock |
| `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY` | Persistent Postgres | Local `.data/` JSON |
| `R2_*` | Archiving original uploaded files | Skipped |
| `GOOGLE_CLIENT_ID/SECRET` | Real Gmail tracker | Tracker shown as "coming soon" |
| `CRON_SECRET` | Guards the daily sync cron | Open in local dev |

Supabase schema: `supabase/schema.sql`. Vercel cron: `vercel.json` (daily 6am tracker sync).

## Prompt engineering

Résumé tailoring rewrites real experience using exact JD vocabulary — never invents skills or metrics.
Email classification identifies the actual hiring company, not the ATS platform. See
`src/lib/llm/prompts.ts` and `src/lib/tracker/classify.ts`.

## Not in this beta

- Authentication (everything hangs off a single demo user; Supabase Auth is the next step).
- Server-side PDF rendering (download uses the browser's print-to-PDF).
- The conversational "just talk" résumé builder (UI only).
