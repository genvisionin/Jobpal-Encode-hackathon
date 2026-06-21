import Link from "next/link";
import { Icon, MatchRing } from "@/components/ui";
import type {
  KeywordCoverage,
  FitDimension,
  RequirementMatch,
  CustomizationChange,
} from "@/lib/schema";

/**
 * InsightsPanel — the career-ops-style fit analysis shown beside the tailored
 * resume. Surfaces, top to bottom: the global match + verdict, the detected
 * archetype, the weighted score breakdown (A–F dimensions), the
 * requirement-by-requirement match analysis (Block B), the section-level
 * customization plan (Block E), and JD keyword coverage.
 *
 * When `locked` (the user's plan doesn't include match ranking), the detailed
 * analysis is replaced by a tasteful upgrade teaser — the resume itself is
 * always fully available; only the scoring/insight layer is gated.
 */
export function InsightsPanel({
  matchScore,
  company,
  archetype,
  archetypeRationale,
  scoreBreakdown = [],
  requirementMatches = [],
  customizationPlan = [],
  changes,
  keywordCoverage,
  sourceUrl,
  locked = false,
}: {
  matchScore: number;
  company: string;
  archetype?: string;
  archetypeRationale?: string;
  scoreBreakdown?: FitDimension[];
  requirementMatches?: RequirementMatch[];
  customizationPlan?: CustomizationChange[];
  changes: string[];
  keywordCoverage: KeywordCoverage[];
  sourceUrl?: string;
  locked?: boolean;
}) {
  if (locked) {
    return <LockedInsights company={company} sourceUrl={sourceUrl} />;
  }
  const matched = keywordCoverage.filter((k) => k.matched);
  const missing = keywordCoverage.filter((k) => !k.matched);
  // career-ops interpretation bands.
  const verdict =
    matchScore >= 85
      ? "Strong match"
      : matchScore >= 70
        ? "Good match"
        : matchScore >= 55
          ? "Partial match"
          : "Stretch role";

  const strong = requirementMatches.filter((r) => r.status === "strong");
  const partial = requirementMatches.filter((r) => r.status === "partial");
  const gaps = requirementMatches.filter((r) => r.status === "gap");

  return (
    <div
      className="glass sheen"
      style={{ borderRadius: "var(--r-lg)", padding: 24, display: "flex", flexDirection: "column", gap: 4 }}
    >
      {/* ---- header: ring + verdict + archetype ---- */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 6 }}>
        <MatchRing pct={matchScore} size={58} />
        <div>
          <div style={{ fontSize: 17, fontWeight: 600 }}>{verdict}</div>
          {archetype ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
              <Icon name="layers" size={13} style={{ color: "var(--accent-ink)" }} />
              <span style={{ fontSize: 12.5, color: "var(--ink-2)", fontWeight: 500 }}>{archetype}</span>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: "var(--ink-2)" }}>Tuned for this role</div>
          )}
        </div>
      </div>
      {archetypeRationale && (
        <p style={{ fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.5, margin: "0 0 6px" }}>
          {archetypeRationale}
        </p>
      )}

      {/* ---- score breakdown (A–F dimensions) ---- */}
      {scoreBreakdown.length > 0 && (
        <Section>
          <Label>Fit breakdown</Label>
          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            {scoreBreakdown.map((d) => (
              <ScoreBar key={d.label} dim={d} />
            ))}
          </div>
        </Section>
      )}

      {/* ---- requirement match analysis (Block B) ---- */}
      {requirementMatches.length > 0 && (
        <Section>
          <Label>
            Requirement match · {strong.length} strong
            {partial.length ? ` · ${partial.length} partial` : ""}
            {gaps.length ? ` · ${gaps.length} gap${gaps.length > 1 ? "s" : ""}` : ""}
          </Label>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {requirementMatches.map((r, i) => (
              <RequirementRow key={i} req={r} />
            ))}
          </div>
        </Section>
      )}

      {/* ---- customization plan (Block E) ---- */}
      {customizationPlan.length > 0 && (
        <Section>
          <Label>Customization plan</Label>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {customizationPlan.map((c, i) => (
              <PlanRow key={i} change={c} />
            ))}
          </div>
        </Section>
      )}

      {/* ---- plain-language change list ---- */}
      {changes.length > 0 && (
        <Section>
          <Label>What we changed</Label>
          {changes.map((text, i) => (
            <div key={i} style={{ display: "flex", gap: 11, alignItems: "flex-start", padding: "6px 0" }}>
              <Badge>
                <Icon name="sparkle" size={14} />
              </Badge>
              <span style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.45 }}>{text}</span>
            </div>
          ))}
        </Section>
      )}

      {/* ---- keyword coverage ---- */}
      {keywordCoverage.length > 0 && (
        <Section>
          <Label>
            Keywords matched · {matched.length}/{keywordCoverage.length}
          </Label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {matched.slice(0, 12).map((k) => (
              <span
                key={k.keyword}
                className="chip"
                style={{ fontSize: 12, padding: "4px 10px", color: "var(--green)" }}
              >
                <Icon name="check" size={12} /> {k.keyword}
              </span>
            ))}
            {missing.slice(0, 6).map((k) => (
              <span
                key={k.keyword}
                className="chip"
                style={{ fontSize: 12, padding: "4px 10px", color: "var(--amber)" }}
              >
                + {k.keyword}
              </span>
            ))}
          </div>
        </Section>
      )}

      {sourceUrl && (
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-primary"
          style={{ width: "100%", justifyContent: "center", marginTop: 18 }}
        >
          Apply on {company} <Icon name="arrow" size={15} style={{ transform: "rotate(-45deg)" }} />
        </a>
      )}
    </div>
  );
}

/* ---------- small presentational helpers ---------- */

function Section({ children }: { children: React.ReactNode }) {  return (
    <>
      <div style={{ height: 1, background: "var(--hairline)", margin: "14px 0" }} />
      <div>{children}</div>
    </>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="label" style={{ marginBottom: 12 }}>
      {children}
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <div
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
      {children}
    </div>
  );
}

function ScoreBar({ dim }: { dim: FitDimension }) {
  const pct = Math.max(0, Math.min(100, Math.round(dim.score)));
  const color = pct >= 80 ? "var(--green)" : pct >= 60 ? "var(--accent)" : "var(--amber)";
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
        <span style={{ fontSize: 13, color: "var(--ink-1)", fontWeight: 500 }}>{dim.label}</span>
        <span style={{ fontSize: 12.5, color: "var(--ink-2)", fontVariantNumeric: "tabular-nums" }}>
          {pct}
          <span style={{ color: "var(--ink-4)" }}> · {Math.round(dim.weight * 100)}%</span>
        </span>
      </div>
      <div style={{ height: 6, borderRadius: 99, background: "rgba(26,26,42,.08)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 99 }} />
      </div>
      {dim.note && (
        <p style={{ fontSize: 11.5, color: "var(--ink-3)", lineHeight: 1.4, margin: "5px 0 0" }}>{dim.note}</p>
      )}
    </div>
  );
}

const REQ_META = {
  strong: { icon: "check", color: "var(--green)", bg: "rgba(52,199,89,.12)" },
  partial: { icon: "bolt", color: "var(--amber)", bg: "rgba(255,159,10,.12)" },
  gap: { icon: "xcircle", color: "var(--ink-3)", bg: "rgba(26,26,42,.06)" },
} as const;

function RequirementRow({ req }: { req: RequirementMatch }) {
  const meta = REQ_META[req.status] ?? REQ_META.partial;
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          background: meta.bg,
          color: meta.color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          marginTop: 1,
        }}
      >
        <Icon name={meta.icon} size={13} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.8, color: "var(--ink-1)", lineHeight: 1.4 }}>{req.requirement}</div>
        {req.status !== "strong" && req.mitigation && (
          <div style={{ fontSize: 11.5, color: "var(--ink-3)", lineHeight: 1.4, marginTop: 2 }}>
            {req.mitigation}
          </div>
        )}
      </div>
    </div>
  );
}

function PlanRow({ change }: { change: CustomizationChange }) {
  return (
    <div>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-1)", marginBottom: 4 }}>
        {change.section}
      </div>
      {change.before && (
        <div style={{ fontSize: 11.8, color: "var(--ink-3)", lineHeight: 1.45, marginBottom: 2 }}>
          <span style={{ color: "var(--ink-4)", textDecoration: "line-through" }}>{change.before}</span>
        </div>
      )}
      {change.after && (
        <div style={{ fontSize: 12.3, color: "var(--ink-1)", lineHeight: 1.45 }}>
          <Icon name="arrow" size={11} style={{ color: "var(--accent-ink)", marginRight: 4 }} />
          {change.after}
        </div>
      )}
      {change.why && (
        <div style={{ fontSize: 11.3, color: "var(--ink-3)", lineHeight: 1.4, marginTop: 3, fontStyle: "italic" }}>
          {change.why}
        </div>
      )}
    </div>
  );
}

/**
 * LockedInsights — shown when match ranking isn't included in the user's plan.
 * Teases what the analysis offers and routes to billing, while keeping the
 * primary Apply action available so the resume stays fully usable.
 */
function LockedInsights({ company, sourceUrl }: { company: string; sourceUrl?: string }) {
  const teasers: [string, string][] = [
    ["star", "Match score & fit breakdown"],
    ["layers", "Role archetype detection"],
    ["check", "Requirement-by-requirement analysis"],
    ["sparkle", "Keyword & ATS coverage"],
  ];
  return (
    <div
      className="glass sheen"
      style={{ borderRadius: "var(--r-lg)", padding: 24, display: "flex", flexDirection: "column", gap: 4 }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 8 }}>
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: "50%",
            background: "var(--accent-soft)",
            color: "var(--accent-ink)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon name="bolt" size={24} />
        </div>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600 }}>Unlock match ranking</div>
          <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 2 }}>
            See exactly how this resume scores against the role.
          </div>
        </div>
      </div>

      <div style={{ height: 1, background: "var(--hairline)", margin: "12px 0" }} />

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {teasers.map(([icon, label]) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: 7,
                background: "var(--accent-soft)",
                color: "var(--accent-ink)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Icon name={icon as Parameters<typeof Icon>[0]["name"]} size={14} />
            </div>
            <span style={{ fontSize: 13.5, color: "var(--ink-2)" }}>{label}</span>
          </div>
        ))}
      </div>

      <Link
        href="/settings/billing"
        className="btn btn-primary"
        style={{ width: "100%", justifyContent: "center", marginTop: 20 }}
      >
        <Icon name="arrowUp" size={15} /> Upgrade to unlock
      </Link>

      {sourceUrl && (
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-glass"
          style={{ width: "100%", justifyContent: "center", marginTop: 10 }}
        >
          Apply on {company} <Icon name="arrow" size={15} style={{ transform: "rotate(-45deg)" }} />
        </a>
      )}
    </div>
  );
}
