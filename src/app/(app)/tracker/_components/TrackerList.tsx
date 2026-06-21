"use client";

import type React from "react";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Icon, GoogleMark, Spinner, Stagger, StaggerItem, AnimatePresence, motion } from "@/components/ui";
import { Screen, PageHeader } from "@/components/layout";
import { relativeTime } from "@/lib/jobs/utils";
import type { EmailEvent, TrackedApplication } from "@/lib/db/types";
import {
  addTrackerApplication,
  getTrackerApplicationDetails,
  updateTrackerApplication,
  type TrackerApplicationInput,
  type TrackerSnapshot,
} from "@/lib/api-client";
import type { TrackerStats } from "@/lib/tracker";
import { ApplicationRow } from "./ApplicationRow";

type FilterKey = "all" | "needs" | "applied" | "review" | "interview" | "offer" | "rejected";
type ViewMode = "list" | "board";
type BoardKey = Exclude<FilterKey, "all">;

const BOARD_COLUMNS: { key: BoardKey; title: string }[] = [
  { key: "needs", title: "Needs attention" },
  { key: "applied", title: "Applied" },
  { key: "review", title: "In review" },
  { key: "interview", title: "Interview" },
  { key: "offer", title: "Offer" },
  { key: "rejected", title: "Not selected" },
];
const BOARD_ORDER_KEY = "jobpal.tracker.boardOrder";
const LEGACY_BOARD_ORDER_KEYS = ["reframe.tracker.boardOrder"] as const;

const PRO_FEATURES = [
  "Auto-detect from confirmation emails",
  "Smart follow-up alerts",
  "Interview prep from job posts",
];

function Stat({ n, label, color }: { n: number; label: string; color?: string }) {
  return (
    <div className="glass stat-tile" style={color ? ({ "--stat-accent": color } as React.CSSProperties) : undefined}>
      <div className="stat-n" style={{ color: color || "var(--ink)" }}>{n}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function AutoTrackBanner({
  locked,
  gmailConfigured,
  connecting,
  connectError,
  requiredPlanName,
  onConnect,
}: {
  locked: boolean;
  gmailConfigured: boolean;
  connecting: boolean;
  connectError: string | null;
  requiredPlanName: string;
  onConnect: () => void;
}) {
  if (locked) {
    return (
      <div className="glass tracker-upgrade-banner">
        <div className="tracker-upgrade-icon">
          <Icon name="sparkle" size={20} />
        </div>
        <div className="tracker-upgrade-title">Automatic tracking</div>
        <p className="tracker-upgrade-sub">
          Upgrade to {requiredPlanName} and link your inbox — Jobpal automatically detects
          application confirmations, interview invites, and decisions.
        </p>
        <ul className="tracker-upgrade-list">
          {PRO_FEATURES.map((f) => (
            <li key={f}>
              <Icon name="check" size={12} />
              {f}
            </li>
          ))}
        </ul>
        <Link
          href="/settings/billing"
          className="btn btn-primary"
          style={{ justifyContent: "center" }}
        >
          <Icon name="arrowUp" size={14} /> Upgrade to {requiredPlanName}
        </Link>
      </div>
    );
  }

  if (!gmailConfigured) {
    return (
      <div className="glass tracker-upgrade-banner">
        <div className="tracker-upgrade-icon tracker-upgrade-icon--soft">
          <Icon name="mail" size={20} />
        </div>
        <div className="tracker-upgrade-title">Gmail coming soon</div>
        <p className="tracker-upgrade-sub">
          We&apos;re finishing Google&apos;s security review before enabling automatic inbox
          tracking for everyone.
        </p>
        <div
          className="glass"
          style={{ borderRadius: "var(--r-md)", padding: "10px 13px", display: "flex", alignItems: "center", gap: 9, fontSize: 13, color: "var(--ink-3)" }}
        >
          <Icon name="clock" size={14} style={{ flexShrink: 0 }} /> Coming soon — check back shortly.
        </div>
      </div>
    );
  }

  return (
    <div className="glass tracker-upgrade-banner">
      <div className="tracker-upgrade-icon tracker-upgrade-icon--soft">
        <Icon name="mail" size={20} />
      </div>
      <div className="tracker-upgrade-title">Connect your inbox</div>
      <p className="tracker-upgrade-sub">
        Link Gmail and Jobpal will automatically track applications from confirmation
        emails — no manual updates needed.
      </p>
      <button
        className="btn"
        onClick={onConnect}
        disabled={connecting}
        style={{
          justifyContent: "center",
          background: "#fff",
          color: "var(--ink)",
          border: "1px solid var(--hairline)",
          boxShadow: "var(--shadow-md)",
        }}
      >
        <GoogleMark size={16} /> {connecting ? "Connecting…" : "Connect Gmail"}
      </button>
      {connectError && (
        <p style={{ fontSize: 12.5, color: "#d6447a", margin: 0 }}>{connectError}</p>
      )}
    </div>
  );
}

function ApplicationFormModal({
  app,
  saving,
  error,
  onClose,
  onSave,
}: {
  app?: TrackedApplication | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (input: TrackerApplicationInput) => void;
}) {
  const [form, setForm] = useState<TrackerApplicationInput>(() => defaultForm(app));
  const set = <K extends keyof TrackerApplicationInput>(key: K, value: TrackerApplicationInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const payload: TrackerApplicationInput = {
    ...form,
    actionDueAt: fromDateInput(form.actionDueAt) ?? "",
    appliedAt: fromDateInput(form.appliedAt) ?? undefined,
    stage: form.outcome ? 3 : form.stage,
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="glass-strong tracker-modal">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div className="label">{app ? "Edit application" : "Add application"}</div>
            <h2 style={{ fontSize: 22, marginTop: 4 }}>{app ? "Update tracker details" : "Track a job manually"}</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="tracker-form-grid">
          <label>
            <span className="label">Role</span>
            <input className="field" value={form.role} onChange={(e) => set("role", e.target.value)} />
          </label>
          <label>
            <span className="label">Company</span>
            <input className="field" value={form.company} onChange={(e) => set("company", e.target.value)} />
          </label>
          <label>
            <span className="label">Stage</span>
            <select className="field" value={form.stage} onChange={(e) => set("stage", Number(e.target.value) as TrackerApplicationInput["stage"])}>
              <option value={0}>Applied</option>
              <option value={1}>In review</option>
              <option value={2}>Interview</option>
              <option value={3}>Decision</option>
            </select>
          </label>
          <label>
            <span className="label">Outcome</span>
            <select
              className="field"
              value={form.outcome ?? ""}
              onChange={(e) => set("outcome", (e.target.value || null) as TrackerApplicationInput["outcome"])}
            >
              <option value="">No decision</option>
              <option value="offer">Offer</option>
              <option value="rejected">Not selected</option>
            </select>
          </label>
          <label>
            <span className="label">Deadline / interview date</span>
            <input className="field" type="datetime-local" value={form.actionDueAt} onChange={(e) => set("actionDueAt", e.target.value)} />
          </label>
          <label>
            <span className="label">Applied date</span>
            <input className="field" type="datetime-local" value={form.appliedAt} onChange={(e) => set("appliedAt", e.target.value)} />
          </label>
          <label>
            <span className="label">Contact name</span>
            <input className="field" value={form.contactName} onChange={(e) => set("contactName", e.target.value)} />
          </label>
          <label>
            <span className="label">Contact email</span>
            <input className="field" type="email" value={form.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} />
          </label>
          <label className="tracker-form-wide">
            <span className="label">Job link</span>
            <input className="field" value={form.jobUrl} onChange={(e) => set("jobUrl", e.target.value)} placeholder="https://..." />
          </label>
          <label className="tracker-form-wide">
            <span className="label">What needs attention?</span>
            <input className="field" value={form.actionSummary} onChange={(e) => set("actionSummary", e.target.value)} placeholder="Assessment due, reply to recruiter, schedule interview..." />
          </label>
          <label className="tracker-check tracker-form-wide">
            <input type="checkbox" checked={form.needsAction} onChange={(e) => set("needsAction", e.target.checked)} />
            <span>Mark as needs attention</span>
          </label>
          <label className="tracker-form-wide">
            <span className="label">Notes</span>
            <textarea className="field" value={form.notes} onChange={(e) => set("notes", e.target.value)} style={{ minHeight: 92 }} />
          </label>
        </div>

        {error && <div style={{ color: "#d6447a", fontSize: 13 }}>{error}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <button className="btn btn-glass" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={() => onSave(payload)} disabled={saving}>
            {saving ? <Spinner size={16} color="#fff" /> : <Icon name="check" size={16} />}
            {saving ? "Saving..." : "Save application"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ApplicationDrawer({
  app,
  events,
  loading,
  onClose,
  onEdit,
}: {
  app: TrackedApplication;
  events: EmailEvent[];
  loading: boolean;
  onClose: () => void;
  onEdit: (app: TrackedApplication) => void;
}) {
  const latestUrl = gmailUrl(app);
  const draft = replyDraft(app);
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="glass-strong tracker-drawer" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div className="label">{stageLabel(app)}</div>
            <h2 style={{ fontSize: 23, lineHeight: 1.15, marginTop: 5 }}>{app.role}</h2>
            <div style={{ color: "var(--ink-2)", marginTop: 5 }}>{app.company}</div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close details">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="tracker-detail-actions">
          <button className="btn btn-glass btn-sm" onClick={() => onEdit(app)}>
            <Icon name="edit" size={14} /> Edit
          </button>
          {latestUrl && (
            <a className="btn btn-primary btn-sm" href={latestUrl} target="_blank" rel="noreferrer">
              <Icon name="mail" size={14} /> Open Gmail
            </a>
          )}
          {app.jobUrl && (
            <a className="btn btn-glass btn-sm" href={app.jobUrl} target="_blank" rel="noreferrer">
              <Icon name="link" size={14} /> Job post
            </a>
          )}
        </div>

        <div className="tracker-detail-grid">
          <div><span className="label">Applied</span><strong>{relativeTime(app.appliedAt)}</strong></div>
          <div><span className="label">Updated</span><strong>{relativeTime(app.updatedAt)}</strong></div>
          {app.actionDueAt && <div><span className="label">Deadline</span><strong>{new Date(app.actionDueAt).toLocaleString()}</strong></div>}
          {(app.contactName || app.contactEmail) && (
            <div><span className="label">Contact</span><strong>{[app.contactName, app.contactEmail].filter(Boolean).join(" · ")}</strong></div>
          )}
        </div>

        {app.actionSummary && (
          <section>
            <div className="label">What needs attention</div>
            <p className="tracker-detail-note">{app.actionSummary}</p>
          </section>
        )}

        {app.notes && (
          <section>
            <div className="label">Notes</div>
            <p className="tracker-detail-note">{app.notes}</p>
          </section>
        )}

        <section>
          <div className="label">Reply draft</div>
          <textarea className="field" value={draft} readOnly style={{ minHeight: 150, marginTop: 8 }} />
          <button className="btn btn-glass btn-sm" style={{ marginTop: 10 }} onClick={() => void navigator.clipboard?.writeText(draft)}>
            <Icon name="copy" size={14} /> Copy reply
          </button>
        </section>

        <section>
          <div className="label">Email history</div>
          {loading ? (
            <div style={{ marginTop: 12 }}><Spinner size={18} /></div>
          ) : events.length ? (
            <div className="tracker-events">
              {events.map((event) => {
                const url = eventGmailUrl(event);
                return (
                  <div key={event.id} className="tracker-event">
                    <div>
                      <strong>{event.summary || event.kind}</strong>
                      <span>{relativeTime(event.receivedAt)} · {event.kind.replaceAll("_", " ")}</span>
                    </div>
                    {url && <a className="icon-btn" href={url} target="_blank" rel="noreferrer" aria-label="Open email"><Icon name="mail" size={15} /></a>}
                  </div>
                );
              })}
            </div>
          ) : (
            <p style={{ color: "var(--ink-3)", fontSize: 13.5, marginTop: 8 }}>No linked emails yet. Manual applications can still be tracked here.</p>
          )}
        </section>
      </aside>
    </div>
  );
}

function matchesFilter(app: TrackedApplication, f: FilterKey): boolean {
  switch (f) {
    case "all": return true;
    case "needs": return app.needsAction;
    case "applied": return app.stage === 0 && !app.outcome;
    case "review": return app.stage === 1 && !app.outcome;
    case "interview": return app.stage >= 2 && !app.outcome;
    case "offer": return app.outcome === "offer";
    case "rejected": return app.outcome === "rejected";
  }
}

function attentionRank(app: TrackedApplication): number {
  if (app.needsAction) return 0;
  if (app.stage >= 2 && !app.outcome) return 1;
  if (app.outcome === "offer") return 2;
  if (app.stage === 1 && !app.outcome) return 3;
  if (app.stage === 0 && !app.outcome) return 4;
  return 5;
}

function sortByAttention(a: TrackedApplication, b: TrackedApplication): number {
  const rank = attentionRank(a) - attentionRank(b);
  if (rank !== 0) return rank;
  return new Date(b.updatedAt || b.appliedAt).getTime() - new Date(a.updatedAt || a.appliedAt).getTime();
}

function trackerStats(apps: TrackedApplication[]): TrackerStats {
  return apps.reduce<TrackerStats>(
    (acc, app) => {
      acc.total++;
      if (app.needsAction) acc.needsAction++;
      if (app.outcome === "offer") acc.offers++;
      else if (app.outcome === "rejected") acc.notSelected++;
      else if (app.stage >= 2) acc.interviews++;
      else if (app.stage === 1) acc.inReview++;
      else acc.applied++;
      return acc;
    },
    { applied: 0, inReview: 0, interviews: 0, offers: 0, notSelected: 0, needsAction: 0, total: 0 },
  );
}

function stageLabel(app: Pick<TrackedApplication, "stage" | "outcome" | "needsAction">): string {
  if (app.needsAction) return "Needs attention";
  if (app.outcome === "offer") return "Offer";
  if (app.outcome === "rejected") return "Not selected";
  if (app.stage >= 2) return "Interview";
  if (app.stage === 1) return "In review";
  return "Applied";
}

function boardKeyFor(app: TrackedApplication): BoardKey {
  if (app.needsAction) return "needs";
  if (app.outcome === "offer") return "offer";
  if (app.outcome === "rejected") return "rejected";
  if (app.stage >= 2) return "interview";
  if (app.stage === 1) return "review";
  return "applied";
}

function patchForBoardKey(key: BoardKey, app: TrackedApplication): Partial<TrackerApplicationInput> {
  switch (key) {
    case "needs":
      return {
        stage: app.stage,
        outcome: app.outcome,
        needsAction: true,
        actionSummary: app.actionSummary || "Needs attention",
      };
    case "applied":
      return { stage: 0, outcome: null, needsAction: false };
    case "review":
      return { stage: 1, outcome: null, needsAction: false };
    case "interview":
      return { stage: 2, outcome: null, needsAction: false };
    case "offer":
      return { stage: 3, outcome: "offer", needsAction: true, actionSummary: app.actionSummary || "Offer received" };
    case "rejected":
      return { stage: 3, outcome: "rejected", needsAction: false };
  }
}

function gmailUrl(app?: Pick<TrackedApplication, "latestThreadId" | "latestEmailId"> | null): string | null {
  const id = app?.latestThreadId || app?.latestEmailId;
  return id ? `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(id)}` : null;
}

function eventGmailUrl(event: EmailEvent): string | null {
  const id = event.threadId || event.id;
  return id ? `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(id)}` : null;
}

function toDateInput(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function fromDateInput(value?: string): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function defaultForm(app?: TrackedApplication | null): TrackerApplicationInput {
  return {
    company: app?.company ?? "",
    role: app?.role ?? "",
    stage: app?.stage ?? 0,
    outcome: app?.outcome ?? null,
    needsAction: app?.needsAction ?? false,
    actionSummary: app?.actionSummary ?? "",
    actionDueAt: toDateInput(app?.actionDueAt),
    notes: app?.notes ?? "",
    jobUrl: app?.jobUrl ?? "",
    contactName: app?.contactName ?? "",
    contactEmail: app?.contactEmail ?? "",
    appliedAt: toDateInput(app?.appliedAt),
  };
}

function replyDraft(app: TrackedApplication): string {
  const name = app.contactName ? ` ${app.contactName}` : "";
  if (app.needsAction && app.stage >= 2) {
    return `Hi${name},\n\nThank you for reaching out. I would be happy to move forward with the interview process. Please let me know which time slots work best, or feel free to send over the scheduling link.\n\nBest,\n${""}`;
  }
  if (app.needsAction && app.actionDueAt) {
    return `Hi${name},\n\nThank you for sharing the next step. I have noted the deadline and will complete it before ${new Date(app.actionDueAt).toLocaleDateString()}.\n\nBest,\n${""}`;
  }
  if (app.outcome === "offer") {
    return `Hi${name},\n\nThank you for the offer. I appreciate the opportunity and will review the details carefully. I will come back to you shortly with my response.\n\nBest,\n${""}`;
  }
  return `Hi${name},\n\nI hope you are doing well. I wanted to follow up on my application for the ${app.role} role at ${app.company}. I remain very interested in the opportunity and would appreciate any update you can share.\n\nBest,\n${""}`;
}

/** TrackerList — the application tracker feed, open to all users. */
export function TrackerList({
  snapshot,
  connected,
  locked,
  gmailConfigured,
  connecting,
  connectError,
  syncing,
  syncNote,
  requiredPlanName = "Pro",
  onConnect,
  onSync,
  onDisconnect,
  onApplicationsChange,
}: {
  snapshot: TrackerSnapshot;
  connected: boolean;
  locked: boolean;
  gmailConfigured: boolean;
  connecting: boolean;
  connectError: string | null;
  syncing: boolean;
  syncNote?: string | null;
  requiredPlanName?: string;
  onConnect: () => void;
  onSync: () => void;
  onDisconnect: () => void;
  onApplicationsChange: (applications: TrackedApplication[], stats: TrackerStats) => void;
}) {
  const { status, applications, stats } = snapshot;
  const [filter, setFilter] = useState<FilterKey>("all");
  const [view, setView] = useState<ViewMode>("list");
  const [editMode, setEditMode] = useState(false);
  const [boardOrder, setBoardOrder] = useState<BoardKey[]>(() => {
    if (typeof window === "undefined") return BOARD_COLUMNS.map((c) => c.key);
    try {
      const stored =
        window.localStorage.getItem(BOARD_ORDER_KEY) ??
        LEGACY_BOARD_ORDER_KEYS.map((key) => window.localStorage.getItem(key)).find(Boolean);
      const parsed = JSON.parse(stored || "[]") as BoardKey[];
      const valid = parsed.filter((key) => BOARD_COLUMNS.some((c) => c.key === key));
      const missing = BOARD_COLUMNS.map((c) => c.key).filter((key) => !valid.includes(key));
      if (stored) window.localStorage.setItem(BOARD_ORDER_KEY, JSON.stringify(valid));
      return [...valid, ...missing];
    } catch {
      return BOARD_COLUMNS.map((c) => c.key);
    }
  });
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const [draggedColumn, setDraggedColumn] = useState<BoardKey | null>(null);
  const [dropColumn, setDropColumn] = useState<BoardKey | null>(null);
  const [editing, setEditing] = useState<TrackedApplication | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [selected, setSelected] = useState<TrackedApplication | null>(null);
  const [events, setEvents] = useState<EmailEvent[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const visible = useMemo(
    () => [...applications.filter((a) => matchesFilter(a, filter))].sort(sortByAttention),
    [applications, filter],
  );

  const filterChips: { key: FilterKey; label: string; count: number; accent?: boolean }[] = [
    { key: "all", label: "All", count: applications.length },
    { key: "needs", label: "Needs attention", count: stats?.needsAction ?? 0, accent: true },
    { key: "applied", label: "Applied", count: stats?.applied ?? 0 },
    { key: "review", label: "In review", count: stats?.inReview ?? 0 },
    { key: "interview", label: "Interview", count: stats?.interviews ?? 0 },
    { key: "offer", label: "Offer", count: stats?.offers ?? 0 },
    { key: "rejected", label: "Not selected", count: stats?.notSelected ?? 0 },
  ];

  async function openDetails(app: TrackedApplication) {
    setSelected(app);
    setEvents([]);
    setDetailsLoading(true);
    try {
      const details = await getTrackerApplicationDetails(app.id);
      setSelected(details.application);
      setEvents(details.events);
    } catch {
      setEvents([]);
    } finally {
      setDetailsLoading(false);
    }
  }

  async function saveApplication(input: TrackerApplicationInput) {
    setSaving(true);
    setFormError(null);
    try {
      const result = editing
        ? await updateTrackerApplication(editing.id, input)
        : await addTrackerApplication(input);
      onApplicationsChange(result.applications, result.stats);
      setSelected((current) => (current?.id === result.application.id ? result.application : current));
      setEditing(undefined);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save application.");
    } finally {
      setSaving(false);
    }
  }

  const allBoardGroups: { key: BoardKey; title: string; apps: TrackedApplication[] }[] = [
    ...boardOrder.map((key) => ({
      key,
      title: BOARD_COLUMNS.find((c) => c.key === key)?.title ?? key,
      apps: visible.filter((a) => boardKeyFor(a) === key),
    })),
  ];
  const boardGroups = allBoardGroups.filter((g) =>
    editMode ? filter === "all" || g.key === filter : g.apps.length > 0,
  );

  function persistBoardOrder(next: BoardKey[]) {
    setBoardOrder(next);
    try {
      window.localStorage.setItem(BOARD_ORDER_KEY, JSON.stringify(next));
    } catch {
      // ignore storage failures
    }
  }

  async function moveCardToColumn(app: TrackedApplication, column: BoardKey) {
    if (!editMode) return;
    const current = boardKeyFor(app);
    if (current === column) return;
    const optimistic = applications.map((a) =>
      a.id === app.id ? ({ ...a, ...patchForBoardKey(column, app), updatedAt: new Date().toISOString() } as TrackedApplication) : a,
    );
    onApplicationsChange(optimistic, trackerStats(optimistic));
    try {
      const result = await updateTrackerApplication(app.id, patchForBoardKey(column, app));
      onApplicationsChange(result.applications, result.stats);
    } catch {
      onApplicationsChange(applications, stats ?? trackerStats(applications));
    }
  }

  function moveColumn(target: BoardKey) {
    if (!editMode || !draggedColumn || draggedColumn === target) return;
    const next = boardOrder.filter((key) => key !== draggedColumn);
    const targetIndex = next.indexOf(target);
    next.splice(targetIndex, 0, draggedColumn);
    persistBoardOrder(next);
  }

  const pageSubtitle = connected ? (
    <span style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
      <GoogleMark size={14} /> {status.email ?? "your inbox"}
      <span style={{ color: "var(--ink-4)" }}>·</span>
      <span style={{ color: "var(--green)", display: "inline-flex", alignItems: "center", gap: 4 }}>
        <Icon name="sync" size={13} /> {status.lastSyncedAt ? `Synced ${relativeTime(status.lastSyncedAt)}` : "Synced"}
      </span>
      <span style={{ color: "var(--ink-4)" }}>·</span>
      <span style={{ color: "var(--accent-ink)", display: "inline-flex", alignItems: "center", gap: 4 }}>
        <Icon name="sparkle" size={13} /> Updates itself from your inbox
      </span>
    </span>
  ) : (
    "Track every application in one place — add them manually or upgrade to auto-track from your inbox."
  );

  const pageActions = connected ? (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      <button className="btn btn-ghost btn-sm" onClick={onDisconnect} style={{ color: "#d6447a" }}>
        <Icon name="logout" size={15} /> Disconnect
      </button>
      <button className="btn btn-glass btn-sm" onClick={onSync} disabled={syncing}>
        {syncing ? <Spinner size={15} /> : <Icon name="sync" size={15} />} {syncing ? "Syncing…" : "Sync now"}
      </button>
    </div>
  ) : undefined;

  return (
    <Screen max={connected ? 960 : 1080}>
      <PageHeader
        title="Application tracker"
        subtitle={pageSubtitle}
        actions={pageActions}
      />

      <div className={!connected ? "tracker-sidebar-grid" : undefined}>
        {/* Main tracker content */}
        <div style={{ minWidth: 0 }}>
          <AnimatePresence>
            {syncNote && (
              <motion.div
                initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                animate={{ opacity: 1, height: "auto", marginBottom: 14 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                transition={{ duration: 0.3 }}
                style={{ overflow: "hidden" }}
              >
                <div
                  className="glass"
                  style={{
                    borderRadius: "var(--r-md)",
                    padding: "10px 14px",
                    fontSize: 13.5,
                    color: "var(--ink-2)",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Icon name="sparkle" size={14} style={{ color: "var(--accent-ink)", flexShrink: 0 }} /> {syncNote}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="tracker-stats">
            <Stat n={stats?.applied ?? 0} label="Applied" />
            <Stat n={stats?.inReview ?? 0} label="In review" color="var(--amber)" />
            <Stat n={stats?.interviews ?? 0} label="Interviews" color="var(--accent-ink)" />
            <Stat n={stats?.offers ?? 0} label="Offer" color="var(--green)" />
            <Stat n={stats?.notSelected ?? 0} label="Not selected" color="var(--ink-3)" />
          </div>

          <div className="chip-scroller">
            {filterChips.map((c) => {
              const on = filter === c.key;
              return (
                <button
                  key={c.key}
                  className={"chip" + (on ? " chip-active" : c.accent ? " chip-accent" : "")}
                  onClick={() => setFilter(c.key)}
                  style={c.accent && !on ? { borderColor: "var(--accent-line)" } : undefined}
                >
                  {c.accent && !on && <span className="dot" style={{ background: "var(--accent)" }} />}
                  {c.label} · {c.count}
                </button>
              );
            })}
          </div>

          <div className="tracker-viewbar">
            <button className="btn btn-primary btn-sm" onClick={() => setEditing(null)}>
              <Icon name="plus" size={15} /> Add application
            </button>
            <div style={{ flex: 1 }} />
            <div className="seg">
              <button className={view === "list" ? "on" : ""} onClick={() => setView("list")}>
                <Icon name="list" size={14} /> List
              </button>
              <button className={view === "board" ? "on" : ""} onClick={() => setView("board")}>
                <Icon name="grid" size={14} /> Board
              </button>
            </div>
            <button
              className={"btn btn-sm " + (editMode ? "btn-primary" : "btn-glass")}
              onClick={() => setEditMode((on) => !on)}
              title={editMode ? "Turn off manual board editing" : "Turn on manual board editing"}
            >
              <Icon name="edit" size={14} /> {editMode ? "Done" : "Edit"}
            </button>
          </div>

          {applications.length === 0 ? (
            <div className="glass" style={{ borderRadius: "var(--r-lg)", padding: "48px 24px", textAlign: "center", color: "var(--ink-2)" }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: "var(--ink)" }}>No applications yet</div>
              <p style={{ fontSize: 14, marginTop: 6 }}>
                {connected
                  ? "We’ll add them automatically as confirmation emails arrive. Try a sync to check now."
                  : "Add your first application manually to start tracking your job search."}
              </p>
              {connected ? (
                <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={onSync} disabled={syncing}>
                  {syncing ? <Spinner size={15} color="#fff" /> : <Icon name="sync" size={15} />} {syncing ? "Syncing…" : "Sync now"}
                </button>
              ) : (
                <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setEditing(null)}>
                  <Icon name="plus" size={15} /> Add application
                </button>
              )}
            </div>
          ) : view === "board" ? (
            <div className={"tracker-board" + (editMode ? " editing" : "")}>
              {boardGroups.length === 0 && (
                <div className="glass" style={{ borderRadius: "var(--r-md)", padding: "28px", textAlign: "center", color: "var(--ink-3)", fontSize: 14 }}>
                  Nothing in this view.
                </div>
              )}
              {boardGroups.map((group) => (
                <div
                  className={"glass tracker-board-col" + (dropColumn === group.key ? " dropping" : "")}
                  key={group.key}
                  draggable={editMode}
                  onDragStart={(e) => {
                    if (!editMode) return;
                    setDraggedColumn(group.key as BoardKey);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", `column:${group.key}`);
                  }}
                  onDragOver={(e) => {
                    if (!editMode) return;
                    e.preventDefault();
                    setDropColumn(group.key as BoardKey);
                  }}
                  onDragLeave={() => setDropColumn(null)}
                  onDrop={(e) => {
                    if (!editMode) return;
                    e.preventDefault();
                    const data = e.dataTransfer.getData("text/plain");
                    setDropColumn(null);
                    if (data.startsWith("card:")) {
                      const app = applications.find((a) => a.id === data.slice(5));
                      if (app) void moveCardToColumn(app, group.key as BoardKey);
                      return;
                    }
                    moveColumn(group.key as BoardKey);
                  }}
                  onDragEnd={() => {
                    setDraggedColumn(null);
                    setDropColumn(null);
                  }}
                >
                  <div className="tracker-board-head">
                    <span>{group.title}</span>
                    <span>{group.apps.length}</span>
                  </div>
                  <div className="tracker-board-list">
                    {group.apps.map((app) => (
                      <button
                        className={"tracker-board-card" + (draggedCardId === app.id ? " dragging" : "")}
                        key={app.id}
                        draggable={editMode}
                        onDragStart={(e) => {
                          if (!editMode) return;
                          e.stopPropagation();
                          setDraggedCardId(app.id);
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", `card:${app.id}`);
                        }}
                        onDragEnd={() => setDraggedCardId(null)}
                        onClick={() => {
                          if (!editMode) void openDetails(app);
                        }}
                        title={editMode ? "Drag this card to update its tracker stage" : "Open details"}
                      >
                        <strong>{app.role}</strong>
                        <span>{app.company}</span>
                        {app.actionDueAt && <em>Due {relativeTime(app.actionDueAt)}</em>}
                      </button>
                    ))}
                    {editMode && group.apps.length === 0 && (
                      <div className="tracker-board-empty">Drop cards here</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="tracker-head">
                <span className="label">Role / Company</span>
                <span className="label">Next step</span>
                <span className="label" style={{ textAlign: "right" }}>Applied</span>
                <span className="label" style={{ textAlign: "right" }}>Status</span>
                <span />
              </div>

              <Stagger style={{ display: "flex", flexDirection: "column", gap: 8 }} gap={0.04} delay={0}>
                {visible.map((app) => (
                  <StaggerItem key={app.id}>
                    <ApplicationRow app={app} onOpen={(a) => void openDetails(a)} />
                  </StaggerItem>
                ))}
                {visible.length === 0 && (
                  <div className="glass" style={{ borderRadius: "var(--r-md)", padding: "28px", textAlign: "center", color: "var(--ink-3)", fontSize: 14 }}>
                    Nothing in this view.
                  </div>
                )}
              </Stagger>
            </>
          )}
        </div>

        {/* Right sidebar — upgrade/connect banner (free & disconnected users only) */}
        {!connected && (
          <aside>
            <AutoTrackBanner
              locked={locked}
              gmailConfigured={gmailConfigured}
              connecting={connecting}
              connectError={connectError}
              requiredPlanName={requiredPlanName}
              onConnect={onConnect}
            />
          </aside>
        )}
      </div>

      {editing !== undefined && (
        <ApplicationFormModal
          app={editing}
          saving={saving}
          error={formError}
          onClose={() => setEditing(undefined)}
          onSave={saveApplication}
        />
      )}
      {selected && (
        <ApplicationDrawer
          app={selected}
          events={events}
          loading={detailsLoading}
          onClose={() => setSelected(null)}
          onEdit={(app) => setEditing(app)}
        />
      )}
    </Screen>
  );
}
