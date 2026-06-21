"use client";

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Icon } from "@/components/ui";
import { saveProfileEnrichment, type ProfileEnrichmentPayload } from "@/lib/api-client";
import type {
  ProfileEnrichmentFact,
  ProfileEnrichmentSensitivity,
  StoredProfileEnrichment,
} from "@/lib/db/types";
import { ProfileSection } from "./ProfileSection";

type EditableFact = ProfileEnrichmentFact;

const sensitivityLabels: Record<ProfileEnrichmentSensitivity, string> = {
  standard: "Standard",
  preference: "Preference",
  protected_demographic: "Demographic",
  legal: "Legal / visa",
  consent: "Consent",
};

const sensitivityOptions: ProfileEnrichmentSensitivity[] = [
  "standard",
  "preference",
  "protected_demographic",
  "legal",
  "consent",
];

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function emptyDraft(): ProfileEnrichmentPayload {
  return {
    facts: [],
    sensitiveFacts: [],
  };
}

function toDraft(enrichment: StoredProfileEnrichment | null): ProfileEnrichmentPayload {
  if (!enrichment) return emptyDraft();
  return {
    facts: enrichment.facts,
    sensitiveFacts: enrichment.sensitiveFacts,
  };
}

function nextFact(sensitivity: ProfileEnrichmentSensitivity): EditableFact {
  const now = new Date().toISOString();
  return {
    key: `custom_${sensitivity}_${Date.now()}`,
    label: "",
    value: "",
    sensitivity,
    source: "user_edited",
    sourceMemoryIds: [],
    confidence: 1,
    updatedAt: now,
  };
}

function FactRows({
  title,
  facts,
  onChange,
  onAdd,
}: {
  title: string;
  facts: EditableFact[];
  onChange: (facts: EditableFact[]) => void;
  onAdd: () => void;
}) {
  function patch(index: number, update: Partial<EditableFact>) {
    onChange(
      facts.map((fact, i) => {
        if (i !== index) return fact;
        const next = { ...fact, ...update };
        const nextLabel = update.label ?? fact.label;
        return {
          ...next,
          key: fact.key.startsWith("custom_") && nextLabel ? `custom_${slug(nextLabel)}` : fact.key,
          source: "user_edited",
        };
      }),
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-3)" }}>{title}</div>
        <button className="btn btn-glass btn-sm" type="button" onClick={onAdd}>
          <Icon name="plus" size={14} /> Add
        </button>
      </div>
      {facts.length === 0 && (
        <p style={{ fontSize: 12.5, color: "var(--ink-4)", lineHeight: 1.45 }}>
          Nothing saved here yet.
        </p>
      )}
      {facts.map((fact, index) => (
        <div
          className="application-memory-fact-row"
          key={`${fact.key}-${index}`}
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(130px, 0.8fr) minmax(180px, 1.2fr) 128px 34px",
            gap: 8,
            alignItems: "center",
          }}
        >
          <input
            value={fact.label}
            onChange={(event) => patch(index, { label: event.currentTarget.value })}
            placeholder="Question / fact"
            style={inputStyle}
          />
          <input
            value={fact.value}
            onChange={(event) => patch(index, { value: event.currentTarget.value })}
            placeholder="Answer"
            style={inputStyle}
          />
          <select
            value={fact.sensitivity}
            onChange={(event) => patch(index, { sensitivity: event.currentTarget.value as ProfileEnrichmentSensitivity })}
            style={inputStyle}
          >
            {sensitivityOptions.map((option) => (
              <option key={option} value={option}>
                {sensitivityLabels[option]}
              </option>
            ))}
          </select>
          <button
            type="button"
            aria-label={`Remove ${fact.label || "fact"}`}
            onClick={() => onChange(facts.filter((_, i) => i !== index))}
            style={iconButtonStyle}
          >
            <Icon name="trash" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

const inputStyle = {
  width: "100%",
  minHeight: 38,
  border: "1px solid var(--hairline)",
  borderRadius: "var(--r-sm)",
  background: "rgba(255,255,255,.68)",
  color: "var(--ink)",
  font: "inherit",
  fontSize: 13,
  padding: "9px 10px",
  outline: "none",
} satisfies CSSProperties;

const iconButtonStyle = {
  width: 34,
  height: 34,
  display: "grid",
  placeItems: "center",
  border: "1px solid var(--hairline)",
  borderRadius: "var(--r-sm)",
  background: "rgba(255,255,255,.58)",
  color: "var(--ink-3)",
  cursor: "pointer",
} satisfies CSSProperties;

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 3 }}>{label}</div>
    </div>
  );
}

function FactList({ title, facts }: { title: string; facts: ProfileEnrichmentFact[] }) {
  if (!facts.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-3)" }}>{title}</div>
      {facts.map((fact) => (
        <div
          className="application-memory-fact-display"
          key={`${fact.key}-${fact.value}`}
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(130px, .8fr) minmax(180px, 1.2fr)",
            gap: 12,
            padding: "7px 0",
            borderTop: "1px solid var(--hairline-2)",
            fontSize: 13,
          }}
        >
          <span style={{ color: "var(--ink-3)" }}>{fact.label}</span>
          <span style={{ color: "var(--ink-1)", fontWeight: 600 }}>{fact.value}</span>
        </div>
      ))}
    </div>
  );
}

export function ApplicationMemorySection({
  enrichment,
  capturedCount,
  onChange,
}: {
  enrichment: StoredProfileEnrichment | null;
  capturedCount: number;
  onChange: (enrichment: StoredProfileEnrichment, capturedCount?: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ProfileEnrichmentPayload>(() => toDraft(enrichment));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const factCount = (enrichment?.facts.length ?? 0) + (enrichment?.sensitiveFacts.length ?? 0);
  const updatedAt = useMemo(() => {
    if (!enrichment?.updatedAt) return null;
    return new Date(enrichment.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }, [enrichment?.updatedAt]);

  function reset(next: StoredProfileEnrichment | null = enrichment) {
    const nextDraft = toDraft(next);
    setDraft(nextDraft);
  }

  async function save() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const result = await saveProfileEnrichment(draft);
      onChange(result.enrichment, result.capturedCount);
      reset(result.enrichment);
      setEditing(false);
      setNotice("Application memory saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save application memory.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProfileSection
      icon="sparkle"
      title="Application memory"
      count={capturedCount ? `${capturedCount} captures` : undefined}
      onEdit={() => {
        reset();
        setEditing(true);
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 16,
            paddingBottom: 12,
            borderBottom: "1px solid var(--hairline-2)",
          }}
        >
          <Stat label="Captured answers" value={capturedCount} />
          <Stat label="Reusable facts" value={factCount} />
          <Stat label="Updated" value={updatedAt ?? "Never"} />
        </div>

        {error && <p style={{ fontSize: 12.5, color: "#a22", lineHeight: 1.45 }}>{error}</p>}
        {notice && <p style={{ fontSize: 12.5, color: "var(--accent-ink)", lineHeight: 1.45 }}>{notice}</p>}

        {!editing ? (
          <>
            {factCount === 0 && (
              <p style={{ fontSize: 13.5, color: "var(--ink-4)", lineHeight: 1.55 }}>
                No application memory yet. Captured answers from the browser extension will appear here.
              </p>
            )}

            <FactList title="Captured profile facts" facts={enrichment?.facts ?? []} />
            <FactList title="Sensitive application facts" facts={enrichment?.sensitiveFacts ?? []} />

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", paddingTop: 2 }}>
              <button
                className="btn btn-primary btn-sm"
                type="button"
                onClick={() => {
                  reset();
                  setEditing(true);
                }}
              >
                <Icon name="edit" size={14} /> Edit memory
              </button>
            </div>
          </>
        ) : (
          <>
            <FactRows
              title="Captured facts"
              facts={draft.facts}
              onChange={(facts) => setDraft((current) => ({ ...current, facts }))}
              onAdd={() => setDraft((current) => ({ ...current, facts: [...current.facts, nextFact("standard")] }))}
            />
            <FactRows
              title="Sensitive application facts"
              facts={draft.sensitiveFacts}
              onChange={(sensitiveFacts) => setDraft((current) => ({ ...current, sensitiveFacts }))}
              onAdd={() =>
                setDraft((current) => ({
                  ...current,
                  sensitiveFacts: [...current.sensitiveFacts, nextFact("protected_demographic")],
                }))
              }
            />

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap", paddingTop: 2 }}>
              <button
                className="btn btn-glass btn-sm"
                type="button"
                onClick={() => {
                  reset();
                  setEditing(false);
                }}
                disabled={saving}
              >
                Cancel
              </button>
              <button className="btn btn-primary btn-sm" type="button" onClick={save} disabled={saving}>
                <Icon name="check" size={14} /> {saving ? "Saving" : "Save memory"}
              </button>
            </div>
          </>
        )}
      </div>
    </ProfileSection>
  );
}
