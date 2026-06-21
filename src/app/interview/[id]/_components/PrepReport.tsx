"use client";

import { useState } from "react";
import { Icon, MatchRing } from "@/components/ui";
import type {
  InterviewPrep,
  QuestionGroup,
  PrepQuestion,
  TalkingPoint,
  PrepTask,
  CandidateVoice,
  ReportedQuestion,
  PrepSource,
} from "@/lib/schema/interview-prep";
import type { IconName } from "@/lib/icon-paths";

/**
 * PrepReport — renders a generated interview prep pack as a warm, scannable
 * report: overview + readiness, company & role research, what other candidates
 * say (from real web research), the questions candidates were asked, the
 * resume-grounded question bank, talking points, questions to ask, a prep plan,
 * and watch-outs — all specific to this exact company and job description.
 */
export function PrepReport({ prep }: { prep: InterviewPrep }) {
  return (
    <div
      style={{
        position: "relative",
        zIndex: 1,
        maxWidth: 920,
        margin: "0 auto",
        padding: "32px 24px 80px",
        display: "flex",
        flexDirection: "column",
        gap: 18,
      }}
    >
      <Overview prep={prep} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 18 }}>
        <CompanyCard prep={prep} />
        <RoleCard prep={prep} />
      </div>

      {prep.candidateVoices.length > 0 && <CandidateVoicesCard voices={prep.candidateVoices} />}

      {prep.reportedQuestions.length > 0 && (
        <ReportedQuestionsCard questions={prep.reportedQuestions} />
      )}

      {prep.questionGroups.length > 0 && <QuestionBank groups={prep.questionGroups} />}

      {prep.talkingPoints.length > 0 && <TalkingPointsCard points={prep.talkingPoints} />}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 18 }}>
        {prep.questionsToAsk.length > 0 && <QuestionsToAskCard questions={prep.questionsToAsk} />}
        {prep.prepPlan.length > 0 && <PrepPlanCard plan={prep.prepPlan} />}
      </div>

      {prep.watchouts.length > 0 && <WatchoutsCard watchouts={prep.watchouts} />}
    </div>
  );
}

/* ---------- building blocks ---------- */

function Card({
  children,
  strong = false,
  style,
}: {
  children: React.ReactNode;
  strong?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={strong ? "glass-strong sheen" : "glass"}
      style={{ borderRadius: "var(--r-lg)", padding: 24, ...style }}
    >
      {children}
    </div>
  );
}

function SectionTitle({ icon, children }: { icon: IconName; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14 }}>
      <span
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          background: "var(--accent-soft)",
          color: "var(--accent-ink)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon name={icon} size={15} />
      </span>
      <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, letterSpacing: "-0.01em" }}>{children}</h2>
    </div>
  );
}

function Pills({ items, color }: { items: string[]; color?: string }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
      {items.map((t, i) => (
        <span key={i} className="chip" style={{ fontSize: 12.5, padding: "4px 11px", color }}>
          {t}
        </span>
      ))}
    </div>
  );
}

/* ---------- overview ---------- */

function Overview({ prep }: { prep: InterviewPrep }) {
  const r = prep.readiness;
  const band = r >= 80 ? "Strong footing" : r >= 65 ? "Solid, with prep" : "Stretch — prep hard";
  return (
    <Card strong>
      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
        <MatchRing pct={r} size={66} />
        <div style={{ flex: 1, minWidth: 240 }}>
          <div className="mono" style={{ fontSize: 10.5, color: "var(--accent-ink)", letterSpacing: ".08em", marginBottom: 6 }}>
            INTERVIEW PREP · {band.toUpperCase()}
          </div>
          <h1 style={{ fontWeight: 700, fontSize: 26, letterSpacing: "-0.025em", margin: "0 0 8px", lineHeight: 1.15 }}>
            {prep.role} <span style={{ color: "var(--ink-3)" }}>at</span> {prep.company}
          </h1>
          <p style={{ fontSize: 14.5, color: "var(--ink-1)", lineHeight: 1.55, margin: 0 }}>
            {prep.overview}
          </p>
        </div>
      </div>
    </Card>
  );
}

/* ---------- company / role ---------- */

function CompanyCard({ prep }: { prep: InterviewPrep }) {
  const c = prep.companyResearch;
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: "var(--accent-soft)",
              color: "var(--accent-ink)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Icon name="building" size={15} />
          </span>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, letterSpacing: "-0.01em" }}>
            About {prep.company}
          </h2>
        </div>
        {prep.researchFound && (
          <span
            className="chip"
            style={{ fontSize: 11, padding: "3px 9px", color: "var(--green)", gap: 5 }}
          >
            <span className="dot" style={{ background: "var(--green)" }} /> Web-researched
          </span>
        )}
      </div>
      {c.summary && <p style={{ fontSize: 13.5, color: "var(--ink-1)", lineHeight: 1.55, margin: "0 0 12px" }}>{c.summary}</p>}
      {c.mission && (
        <p style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5, margin: "0 0 12px", fontStyle: "italic" }}>
          “{c.mission}”
        </p>
      )}
      {c.products.length > 0 && (
        <Field label="Products">
          <Pills items={c.products} />
        </Field>
      )}
      {c.culture.length > 0 && (
        <Field label="Culture signals">
          <Pills items={c.culture} color="var(--accent-ink)" />
        </Field>
      )}
      {c.signals.length > 0 && (
        <Field label="Worth referencing">
          <ul style={listStyle}>
            {c.signals.map((s, i) => (
              <li key={i} style={liStyle}>{s}</li>
            ))}
          </ul>
        </Field>
      )}
      {c.interviewReputation && (
        <Field label="Their process">
          <p style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5, margin: 0 }}>{c.interviewReputation}</p>
        </Field>
      )}
    </Card>
  );
}

function RoleCard({ prep }: { prep: InterviewPrep }) {
  const r = prep.roleInsights;
  return (
    <Card>
      <SectionTitle icon="briefcase">The role</SectionTitle>
      {r.summary && <p style={{ fontSize: 13.5, color: "var(--ink-1)", lineHeight: 1.55, margin: "0 0 12px" }}>{r.summary}</p>}
      {r.focusAreas.length > 0 && (
        <Field label="You'll own">
          <ul style={listStyle}>
            {r.focusAreas.map((f, i) => (
              <li key={i} style={liStyle}>{f}</li>
            ))}
          </ul>
        </Field>
      )}
      {r.successLooksLike.length > 0 && (
        <Field label="Success looks like">
          <ul style={listStyle}>
            {r.successLooksLike.map((s, i) => (
              <li key={i} style={liStyle}>{s}</li>
            ))}
          </ul>
        </Field>
      )}
    </Card>
  );
}

/* ---------- process ---------- */

function QuestionBank({ groups }: { groups: QuestionGroup[] }) {
  const total = groups.reduce((n, g) => n + g.questions.length, 0);
  return (
    <Card>
      <SectionTitle icon="mic">Likely questions · {total}</SectionTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        {groups.map((g, i) => (
          <div key={i}>
            <div className="label" style={{ marginBottom: 10 }}>{g.category}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {g.questions.map((q, j) => (
                <QuestionItem key={j} q={q} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function QuestionItem({ q }: { q: PrepQuestion }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="glass-quiet"
      style={{ borderRadius: "var(--r-md)", overflow: "hidden", border: "1px solid var(--hairline)" }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 11,
          padding: "12px 14px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          fontFamily: "var(--sans)",
        }}
      >
        <Icon
          name="chevron"
          size={15}
          style={{ color: "var(--ink-3)", flexShrink: 0, transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}
        />
        <span style={{ fontSize: 14, fontWeight: 500, color: "var(--ink-1)", lineHeight: 1.4 }}>{q.question}</span>
      </button>
      {open && (
        <div style={{ padding: "0 14px 14px 40px", display: "flex", flexDirection: "column", gap: 10 }}>
          {q.rationale && (
            <Detail label="Why they ask">{q.rationale}</Detail>
          )}
          {q.approach && (
            <Detail label="How to answer">{q.approach}</Detail>
          )}
          {q.resumeHook && (
            <div
              style={{
                background: "var(--accent-soft)",
                borderRadius: "var(--r-sm)",
                padding: "9px 11px",
                display: "flex",
                gap: 9,
                alignItems: "flex-start",
              }}
            >
              <Icon name="user" size={13} style={{ color: "var(--accent-ink)", flexShrink: 0, marginTop: 2 }} />
              <div>
                <div className="mono" style={{ fontSize: 9.5, color: "var(--accent-ink)", letterSpacing: ".06em", marginBottom: 2 }}>
                  YOUR ANGLE
                </div>
                <span style={{ fontSize: 13, color: "var(--ink-1)", lineHeight: 1.45 }}>{q.resumeHook}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mono" style={{ fontSize: 9.5, color: "var(--ink-3)", letterSpacing: ".06em", marginBottom: 2 }}>
        {label.toUpperCase()}
      </div>
      <span style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5 }}>{children}</span>
    </div>
  );
}

/* ---------- talking points ---------- */

function TalkingPointsCard({ points }: { points: TalkingPoint[] }) {
  return (
    <Card>
      <SectionTitle icon="star">Points to land</SectionTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {points.map((p, i) => (
          <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: 8,
                background: "var(--accent-soft)",
                color: "var(--accent-ink)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                fontSize: 12.5,
                fontWeight: 700,
              }}
            >
              {i + 1}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-1)", lineHeight: 1.4 }}>{p.point}</div>
              {p.evidence && (
                <div style={{ fontSize: 12.8, color: "var(--ink-2)", lineHeight: 1.5, marginTop: 3 }}>{p.evidence}</div>
              )}
              {p.useWhen && (
                <div style={{ fontSize: 11.8, color: "var(--ink-3)", lineHeight: 1.4, marginTop: 4, fontStyle: "italic" }}>
                  When: {p.useWhen}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ---------- questions to ask / prep plan / watchouts ---------- */

function QuestionsToAskCard({ questions }: { questions: string[] }) {
  return (
    <Card>
      <SectionTitle icon="bell">Questions to ask them</SectionTitle>
      <ul style={listStyle}>
        {questions.map((q, i) => (
          <li key={i} style={liStyle}>{q}</li>
        ))}
      </ul>
    </Card>
  );
}

function PrepPlanCard({ plan }: { plan: PrepTask[] }) {
  return (
    <Card>
      <SectionTitle icon="check">Your prep plan</SectionTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {plan.map((t, i) => (
          <div key={i} style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
            <Icon name="check" size={15} style={{ color: "var(--green)", flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink-1)" }}>{t.task}</div>
              {t.detail && (
                <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.5, marginTop: 2 }}>{t.detail}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function WatchoutsCard({ watchouts }: { watchouts: string[] }) {
  return (
    <Card style={{ borderLeft: "3px solid var(--amber)" }}>
      <SectionTitle icon="bolt">Watch-outs</SectionTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {watchouts.map((w, i) => (
          <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <Icon name="bolt" size={14} style={{ color: "var(--amber)", flexShrink: 0, marginTop: 2 }} />
            <span style={{ fontSize: 13.3, color: "var(--ink-1)", lineHeight: 1.5 }}>{w}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ---------- candidate voices (real web research) ---------- */

const SOURCE_META: Record<string, { label: string; color: string }> = {
  glassdoor: { label: "Glassdoor", color: "#0caa41" },
  reddit: { label: "Reddit", color: "#ff4500" },
  blind: { label: "Blind", color: "#1f6feb" },
  leetcode: { label: "LeetCode", color: "#ffa116" },
  "levels.fyi": { label: "Levels.fyi", color: "#16a34a" },
  web: { label: "Web", color: "var(--ink-3)" },
  inferred: { label: "Inferred", color: "var(--ink-3)" },
};

function sourceMeta(source: string) {
  const key = source.trim().toLowerCase();
  return SOURCE_META[key] ?? { label: source || "Web", color: "var(--ink-3)" };
}

function SourceTag({ source }: { source: string }) {
  const m = sourceMeta(source);
  return (
    <span
      className="mono"
      style={{
        fontSize: 9.5,
        letterSpacing: ".04em",
        color: m.color,
        background: "color-mix(in srgb, currentColor 12%, transparent)",
        padding: "2px 6px",
        borderRadius: 5,
        whiteSpace: "nowrap",
      }}
    >
      {m.label.toUpperCase()}
    </span>
  );
}

const SENTIMENT_META = {
  positive: { color: "var(--green)", icon: "check" as IconName },
  neutral: { color: "var(--ink-3)", icon: "user" as IconName },
  caution: { color: "var(--amber)", icon: "bolt" as IconName },
} as const;

function CandidateVoicesCard({ voices }: { voices: CandidateVoice[] }) {
  return (
    <Card>
      <SectionTitle icon="user">What candidates say</SectionTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {voices.map((v, i) => {
          const s = SENTIMENT_META[v.sentiment] ?? SENTIMENT_META.neutral;
          return (
            <div
              key={i}
              className="glass-quiet"
              style={{
                borderRadius: "var(--r-md)",
                padding: "12px 14px",
                borderLeft: `3px solid ${s.color}`,
                display: "flex",
                gap: 11,
                alignItems: "flex-start",
              }}
            >
              <Icon name={s.icon} size={15} style={{ color: s.color, flexShrink: 0, marginTop: 2 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13.8, color: "var(--ink-1)", lineHeight: 1.45, fontWeight: 500 }}>
                  “{v.quote}”
                </div>
                {v.takeaway && (
                  <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.45, marginTop: 4 }}>
                    {v.takeaway}
                  </div>
                )}
              </div>
              <SourceTag source={v.source} />
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ---------- reported questions (sourced + inferred) ---------- */

function ReportedQuestionsCard({ questions }: { questions: ReportedQuestion[] }) {
  const sourced = questions.filter((q) => !q.inferred);
  return (
    <Card>
      <SectionTitle icon="search">
        Questions candidates were asked · {questions.length}
      </SectionTitle>
      <p style={{ fontSize: 12.5, color: "var(--ink-3)", margin: "-6px 0 14px", lineHeight: 1.45 }}>
        {sourced.length > 0
          ? `Pulled from real candidate reports. Inferred ones are tagged.`
          : `Inferred from the role — verify against live reports where you can.`}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {questions.map((q, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              gap: 11,
              alignItems: "flex-start",
              padding: "10px 0",
              borderBottom: i < questions.length - 1 ? "1px solid var(--hairline)" : "none",
            }}
          >
            <Icon
              name="mic"
              size={14}
              style={{ color: "var(--accent-ink)", flexShrink: 0, marginTop: 3, opacity: 0.7 }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.8, color: "var(--ink-1)", lineHeight: 1.45 }}>{q.question}</div>
              {q.round && (
                <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>{q.round}</div>
              )}
            </div>
            <SourceTag source={q.inferred ? "inferred" : q.source} />
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ---------- shared bits ---------- */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="label" style={{ marginBottom: 7 }}>{label}</div>
      {children}
    </div>
  );
}

const listStyle: React.CSSProperties = {
  margin: 0,
  paddingLeft: 18,
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const liStyle: React.CSSProperties = {
  fontSize: 13.3,
  color: "var(--ink-1)",
  lineHeight: 1.5,
};
