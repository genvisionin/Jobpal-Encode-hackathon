import type { TrackedApplication } from "@/lib/db/types";
import Link from "next/link";
import { Icon } from "@/components/ui";
import { relativeTime } from "@/lib/jobs/utils";

function StatusPill({ app }: { app: TrackedApplication }) {
  if (app.outcome === "offer")
    return (
      <span className="badge" style={{ background: "var(--green)", color: "#fff", whiteSpace: "nowrap" }}>
        <Icon name="trophy" size={11} /> Offer
      </span>
    );
  if (app.outcome === "rejected")
    return (
      <span className="chip" style={{ fontSize: 12, padding: "3px 10px", color: "var(--ink-3)", whiteSpace: "nowrap" }}>
        Not selected
      </span>
    );
  if (app.stage >= 2)
    return (
      <span className="chip chip-accent" style={{ fontSize: 12, padding: "3px 10px", whiteSpace: "nowrap" }}>
        <Icon name="phone" size={11} /> Interview
      </span>
    );
  if (app.stage === 0)
    return (
      <span className="chip" style={{ fontSize: 12, padding: "3px 10px", color: "var(--accent-ink)", whiteSpace: "nowrap" }}>
        <Icon name="check" size={11} /> Applied
      </span>
    );
  return (
    <span className="chip" style={{ fontSize: 12, padding: "3px 10px", color: "var(--amber)", whiteSpace: "nowrap" }}>
      <Icon name="hourglass" size={11} /> In review
    </span>
  );
}

/** A compact accent flag shown when an application is waiting on the user. */
function AwaitingPill() {
  return (
    <span
      className="badge"
      style={{ background: "var(--accent)", color: "#fff", whiteSpace: "nowrap" }}
    >
      <span className="dot" style={{ background: "#fff" }} /> Needs attention
    </span>
  );
}

function daysSince(iso: string): number {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return 0;
  return Math.floor((Date.now() - then) / (24 * 60 * 60 * 1000));
}

const MONTH_DATE_PATTERN =
  "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\.?\\s+\\d{1,2}(?:,?\\s+\\d{4})?";
const ISO_DATE_PATTERN = "\\d{4}-\\d{2}-\\d{2}";

function parseDate(value?: string): Date | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? new Date(t) : null;
}

function extractDeadline(summary?: string): Date | null {
  if (!summary) return null;
  const match = summary.match(new RegExp(`\\b(?:by|before|due(?: by)?|deadline:?|until)\\s+(${ISO_DATE_PATTERN}|${MONTH_DATE_PATTERN})`, "i"));
  if (!match?.[1]) return null;
  const raw = /\d{4}/.test(match[1]) ? match[1] : `${match[1]} ${new Date().getFullYear()}`;
  return parseDate(raw);
}

function formatDeadline(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function cleanActionSummary(summary?: string): string {
  return (summary || "")
    .replace(new RegExp(`\\s+\\b(?:by|before|due(?: by)?|deadline:?|until)\\s+(?:${ISO_DATE_PATTERN}|${MONTH_DATE_PATTERN})`, "i"), "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,])/g, "$1")
    .replace(/[.\s]+$/, "")
    .trim();
}

function actionLabel(app: TrackedApplication): string {
  const summary = (app.actionSummary || "").toLowerCase();
  if (app.outcome === "offer") return "Review offer";
  if (summary.includes("identity") || summary.includes("verification")) return "Complete verification";
  if (summary.includes("assessment") || summary.includes("solve") || summary.includes("coding")) return "Complete assessment";
  if (summary.includes("transcription") || summary.includes("speaking")) return "Complete screening task";
  if (summary.includes("schedule") && summary.includes("interview")) return "Schedule interview";
  if (summary.includes("interview")) return "Confirm interview";
  if (summary.includes("reply") || summary.includes("respond")) return "Reply to recruiter";
  return "Complete next step";
}

function NextStep({ app }: { app: TrackedApplication }) {
  let label = "Waiting";
  let detail = "Application submitted";
  let icon: "calendar" | "bell" | "send" | "clock" | "sparkle" | "check" | "trophy" = "clock";
  const deadline = parseDate(app.actionDueAt) || extractDeadline(app.actionSummary);

  if (app.needsAction) {
    const summary = cleanActionSummary(app.actionSummary);
    label = actionLabel(app);
    detail = deadline
      ? `Due ${formatDeadline(deadline)}${summary ? ` · ${summary}` : ""}`
      : summary || "Review the latest email and respond";
    icon = deadline ? "calendar" : "bell";
  } else if (app.outcome === "offer") {
    label = "Review offer";
    detail = "Decision stage";
    icon = "trophy";
  } else if (app.outcome === "rejected") {
    label = "Closed";
    detail = "No further action";
    icon = "check";
  } else if (app.stage >= 2) {
    label = "Prepare now";
    detail = "Interview stage";
    icon = "sparkle";
  } else if (app.stage === 1) {
    label = "Waiting for update";
    detail = deadline ? `Expected ${formatDeadline(deadline)}` : "Company review";
    icon = "clock";
  } else if (daysSince(app.appliedAt) >= 10) {
    label = "Follow up";
    detail = "Applied over 10 days ago";
    icon = "send";
  }

  return (
    <div className="tracker-next-step">
      <Icon name={icon} size={14} />
      <span>
        <strong>{label}</strong>
        <em>{detail}</em>
      </span>
    </div>
  );
}

/** ApplicationRow — one auto-updating tracker row. */
export function ApplicationRow({
  app,
  onOpen,
}: {
  app: TrackedApplication;
  onOpen?: (app: TrackedApplication) => void;
}) {
  const hot = Boolean(app.needsAction);
  // The ONLY real detail action is the interview prep pack, surfaced once an
  // application reaches the interview stage (and isn't yet decided).
  const interviewStage = app.stage >= 2 && !app.outcome;
  // When a row needs attention but has no prep button, the attention flag fills
  // the (otherwise empty) action column on the right — sitting
  // beside its status pill, mirroring exactly where "Prepare now" appears.
  const awaitingInAction = hot && !interviewStage;
  const hasAction = interviewStage || awaitingInAction;

  return (
    <div
      className={"glass row-hover tracker-row" + (hasAction ? "" : " no-action")}
      role="button"
      tabIndex={0}
      onClick={() => onOpen?.(app)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen?.(app);
        }
      }}
      style={{
        borderRadius: "var(--r-md)",
        padding: "13px 18px",
        background: hot ? "var(--accent-soft)" : undefined,
        cursor: onOpen ? "pointer" : undefined,
      }}
    >
      <div className="tracker-col-title">
        <span className="tracker-company-badge" aria-hidden="true">
          {(app.company?.[0] ?? "?").toUpperCase()}
        </span>
        <div className="tracker-col-title-text">
          <div className="tracker-title-line">
            <span className="tracker-role">{app.role}</span>
          </div>
          <div className="tracker-company">{app.company}</div>
        </div>
      </div>

      <div className="tracker-col-next">
        <NextStep app={app} />
        <span className="tracker-meta-date">{relativeTime(app.appliedAt)}</span>
      </div>
      <div className="tracker-col-date">{relativeTime(app.appliedAt)}</div>
      <div className="tracker-col-status">
        <StatusPill app={app} />
      </div>
      {interviewStage ? (
        <div className="tracker-col-action">
          <Link href={`/interview/${app.id}`} className="btn btn-primary btn-sm" onClick={(e) => e.stopPropagation()}>
            <Icon name="sparkle" size={13} /> Prepare now
          </Link>
        </div>
      ) : awaitingInAction ? (
        <div className="tracker-col-action">
          <AwaitingPill />
        </div>
      ) : null}
    </div>
  );
}
