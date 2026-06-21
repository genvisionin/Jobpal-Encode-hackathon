"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Icon, motion, AnimatePresence, EASE, Portal } from "@/components/ui";
import type {
  JobSearchFilters,
  WorkArrangement,
  JobType,
  ExperienceLevel,
} from "@/lib/jobs/types";

function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ paddingBottom: 20, marginBottom: 20, borderBottom: "1px solid var(--hairline-2)" }}>
      <div className="label" style={{ marginBottom: 12 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  icon?: Parameters<typeof Icon>[0]["name"];
}) {
  return (
    <button className={"chip" + (active ? " chip-accent" : "")} onClick={onClick} type="button">
      {icon && <Icon name={icon} size={13} />} {children}
    </button>
  );
}

const ARRANGEMENTS: [WorkArrangement, string, Parameters<typeof Icon>[0]["name"]][] = [
  ["remote", "Remote", "remote"],
  ["hybrid", "Hybrid", "building"],
  ["onsite", "On-site", "map"],
];
const JOB_TYPES: [JobType, string][] = [
  ["full_time", "Full-time"],
  ["part_time", "Part-time"],
  ["contract", "Contract"],
  ["permanent", "Permanent"],
];
const LEVELS: [ExperienceLevel, string][] = [
  ["intern", "Intern"],
  ["entry", "Entry"],
  ["mid", "Mid"],
  ["senior", "Senior"],
  ["lead", "Lead"],
  ["director", "Director"],
];
const COUNTRIES: [string, string][] = [
  ["us", "United States"],
  ["gb", "United Kingdom"],
  ["in", "India"],
  ["ca", "Canada"],
  ["au", "Australia"],
  ["de", "Germany"],
  ["sg", "Singapore"],
];

/**
 * FilterSheet — a glass slide-over bound to the live filter state. Edits are
 * staged locally and committed on "Show matches".
 */
export function FilterSheet({
  open,
  initial,
  onClose,
  onApply,
}: {
  open: boolean;
  initial: JobSearchFilters;
  onClose: () => void;
  onApply: (filters: JobSearchFilters) => void;
}) {
  const [draft, setDraft] = useState<JobSearchFilters>(initial);

  // Re-seed the draft from live filters whenever the sheet is (re)opened, so it
  // always reflects the current state rather than a stale earlier edit.
  useEffect(() => {
    if (open) setDraft(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggle = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              onClick={onClose}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(26,26,42,.18)",
                backdropFilter: "blur(2px)",
                zIndex: 40,
              }}
            />
            <motion.div
              className="glass-strong sheen"
              role="dialog"
              aria-label="Refine your alerts"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: 0.36, ease: EASE }}
              style={{
                position: "fixed",
                right: 0,
                top: 0,
                bottom: 0,
                width: "min(440px, 100vw)",
                borderRadius: "var(--r-xl) 0 0 var(--r-xl)",
                padding: "28px 30px",
                display: "flex",
                flexDirection: "column",
                zIndex: 41,
              }}
            >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
          <h2 style={{ fontSize: 22, fontWeight: 600 }}>Refine your alerts</h2>
          <button className="btn btn-ghost" style={{ padding: 8, borderRadius: "50%" }} onClick={onClose} aria-label="Close">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", paddingRight: 4 }}>
          <FilterGroup title="Role / keywords">
            <input
              className="field"
              placeholder="e.g. Product Designer, React, Data"
              value={draft.keywords}
              onChange={(e) => setDraft({ ...draft, keywords: e.target.value })}
            />
          </FilterGroup>

          <FilterGroup title="Location & country">
            <input
              className="field"
              placeholder="City or region (e.g. New York)"
              value={draft.location}
              onChange={(e) => setDraft({ ...draft, location: e.target.value })}
              style={{ marginBottom: 10 }}
            />
            <select
              className="field"
              value={draft.country}
              onChange={(e) => setDraft({ ...draft, country: e.target.value })}
            >
              {COUNTRIES.map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </FilterGroup>

          <FilterGroup title="Arrangement">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {ARRANGEMENTS.map(([value, label, icon]) => (
                <Chip
                  key={value}
                  icon={icon}
                  active={draft.arrangements.includes(value)}
                  onClick={() => setDraft({ ...draft, arrangements: toggle(draft.arrangements, value) })}
                >
                  {label}
                </Chip>
              ))}
            </div>
          </FilterGroup>

          <FilterGroup title="Job type">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {JOB_TYPES.map(([value, label]) => (
                <Chip
                  key={value}
                  active={draft.jobTypes.includes(value)}
                  onClick={() => setDraft({ ...draft, jobTypes: toggle(draft.jobTypes, value) })}
                >
                  {label}
                </Chip>
              ))}
            </div>
          </FilterGroup>

          <FilterGroup title="Minimum salary">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input
                className="field"
                type="number"
                min={0}
                step={5000}
                placeholder="Any"
                value={draft.salaryMin ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, salaryMin: e.target.value ? Number(e.target.value) : undefined })
                }
              />
              <span style={{ fontSize: 13, color: "var(--ink-3)", whiteSpace: "nowrap" }}>per year</span>
            </div>
          </FilterGroup>

          <FilterGroup title="Experience level">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {LEVELS.map(([value, label]) => (
                <Chip
                  key={value}
                  active={draft.experience.includes(value)}
                  onClick={() => setDraft({ ...draft, experience: toggle(draft.experience, value) })}
                >
                  {label}
                </Chip>
              ))}
            </div>
          </FilterGroup>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 14.5, fontWeight: 600 }}>Visa sponsorship</span>
            <button
              type="button"
              onClick={() => setDraft({ ...draft, visaSponsorship: !draft.visaSponsorship })}
              aria-pressed={draft.visaSponsorship}
              style={{
                width: 46,
                height: 27,
                borderRadius: 99,
                border: "none",
                cursor: "pointer",
                padding: 0,
                position: "relative",
                background: draft.visaSponsorship ? "var(--accent)" : "rgba(26,26,42,.18)",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 3,
                  left: draft.visaSponsorship ? 22 : 3,
                  width: 21,
                  height: 21,
                  borderRadius: "50%",
                  background: "#fff",
                  boxShadow: "var(--shadow-sm)",
                  transition: "0.2s",
                }}
              />
            </button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, paddingTop: 20, borderTop: "1px solid var(--hairline)" }}>
          <button
            className="btn btn-glass"
            style={{ flex: 1, justifyContent: "center" }}
            onClick={() =>
              setDraft({
                ...draft,
                keywords: "",
                location: "",
                arrangements: [],
                jobTypes: [],
                experience: [],
                salaryMin: undefined,
                visaSponsorship: false,
              })
            }
          >
            Reset
          </button>
          <button
            className="btn btn-primary"
            style={{ flex: 2, justifyContent: "center" }}
            onClick={() => onApply(draft)}
          >
            <Icon name="check" size={16} /> Show matches
          </button>
        </div>
          </motion.div>
        </>
      )}
      </AnimatePresence>
    </Portal>
  );
}
