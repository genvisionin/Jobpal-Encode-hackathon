"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon, Spinner, Stagger, StaggerItem } from "@/components/ui";
import { Screen, PageHeader } from "@/components/layout";
import { searchJobs as searchJobsApi } from "@/lib/api-client";
import { DEFAULT_FILTERS } from "@/lib/jobs/types";
import type { JobListing, JobSearchFilters } from "@/lib/jobs/types";
import { JobRow } from "./JobRow";
import { FilterSheet } from "./FilterSheet";

/** ISO country code → label, for the active-filter chip. */
const COUNTRY_LABEL: Record<string, string> = {
  us: "United States",
  gb: "United Kingdom",
  in: "India",
  ca: "Canada",
  au: "Australia",
  de: "Germany",
  sg: "Singapore",
};

/** A compact summary of an active filter, shown as a chip in the bar. */
function activeFilterChips(f: JobSearchFilters): { label: string; value: string }[] {
  const chips: { label: string; value: string }[] = [];
  if (f.keywords) chips.push({ label: "Role", value: f.keywords });
  if (f.country) chips.push({ label: "Country", value: COUNTRY_LABEL[f.country] ?? f.country.toUpperCase() });
  if (f.location) chips.push({ label: "Location", value: f.location });
  if (f.arrangements.length) chips.push({ label: "Work", value: f.arrangements.join(", ") });
  if (f.jobTypes.length) chips.push({ label: "Type", value: f.jobTypes.map((t) => t.replace("_", " ")).join(", ") });
  if (f.experience.length) chips.push({ label: "Level", value: f.experience.join(", ") });
  if (f.salaryMin) chips.push({ label: "Pay", value: `$${Math.round(f.salaryMin / 1000)}k+` });
  return chips;
}

const SkeletonRow = () => (
  <div className="glass job-row" style={{ borderRadius: "var(--r-lg)", padding: "18px 22px" }}>
    <div className="skeleton" style={{ width: 46, height: 46, borderRadius: 12, flexShrink: 0 }} />
    <div style={{ flex: 1 }}>
      <div className="skeleton" style={{ height: 14, width: "40%" }} />
      <div className="skeleton" style={{ height: 11, width: "60%", marginTop: 10 }} />
      <div className="skeleton" style={{ height: 10, width: "30%", marginTop: 12 }} />
    </div>
    <div className="skeleton" style={{ width: 90, height: 30, borderRadius: 99 }} />
  </div>
);

/** AlertsView — the live, filter-driven job alerts feed. */
export function AlertsView({ initialKeywords = "" }: { initialKeywords?: string }) {
  const router = useRouter();
  const [filters, setFilters] = useState<JobSearchFilters>({
    ...DEFAULT_FILTERS,
    keywords: initialKeywords,
  });
  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [total, setTotal] = useState(0);
  const [source, setSource] = useState<string>("live");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const reqId = useRef(0);

  const runSearch = useCallback(async (f: JobSearchFilters) => {
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    try {
      const result = await searchJobsApi(f);
      if (id !== reqId.current) return; // a newer search superseded this one
      setJobs(result.jobs);
      setTotal(result.total);
      setSource(result.source);
    } catch {
      if (id !== reqId.current) return;
      setError("Couldn't load jobs. Please try again.");
      setJobs([]);
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, []);

  // Initial load.
  useEffect(() => {
    void runSearch(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyFilters(next: JobSearchFilters) {
    setFilters(next);
    setSheetOpen(false);
    void runSearch(next);
  }

  function tailorFor(job: JobListing) {
    // Hand the JD snippet to Customize CV via query (best-effort prefill).
    const jd = `${job.title} at ${job.company}. ${job.snippet}`;
    router.push(`/customize?jd=${encodeURIComponent(jd)}`);
  }

  const chips = activeFilterChips(filters);

  return (
    <Screen max={960}>
      <PageHeader
        title="Job alerts"
        subtitle="Live roles matched to your profile, pulled straight from company career pages."
      />

      {/* filter bar */}
      <div
        className="glass alerts-filterbar"
        style={{
          borderRadius: "var(--r-lg)",
          padding: "14px 18px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          marginBottom: 20,
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13.5, fontWeight: 600, color: "var(--ink-2)", marginRight: 4 }}>
          <Icon name="filter" size={16} /> Filters
        </span>
        {chips.length === 0 && <span style={{ fontSize: 13.5, color: "var(--ink-4)" }}>None set — searching everything</span>}
        {chips.map((c) => (
          <button key={c.label} className="chip chip-accent" style={{ fontSize: 13.5, padding: "8px 13px" }} onClick={() => setSheetOpen(true)}>
            <span style={{ color: "var(--accent-ink)" }}>{c.label}:</span>
            <strong style={{ fontWeight: 600 }}>{c.value}</strong>
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button className="btn btn-primary btn-sm" onClick={() => setSheetOpen(true)}>
          <Icon name="filter" size={15} /> Edit filters
        </button>
      </div>

      {/* result header */}
      <div className="alerts-resulthead" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <span style={{ fontSize: 13.5, color: "var(--ink-3)", display: "inline-flex", alignItems: "center", gap: 7 }}>
          {loading ? (
            <>
              <Spinner size={14} /> Searching live boards…
            </>
          ) : (
            <>
              Showing <strong style={{ color: "var(--ink)" }}>{jobs.length}</strong> of{" "}
              {total.toLocaleString()} matches
            </>
          )}
        </span>
        <div className="seg">
          <button className={(filters.sortBy ?? "relevance") === "relevance" ? "on" : ""} onClick={() => applyFilters({ ...filters, sortBy: "relevance" })}>
            Best match
          </button>
          <button className={filters.sortBy === "date" ? "on" : ""} onClick={() => applyFilters({ ...filters, sortBy: "date" })}>
            Newest
          </button>
        </div>
      </div>

      {/* fallback notice — the live scan came back empty, so we're showing a
          representative set so the feed isn't a dead end. Honest about it. */}
      {!loading && !error && source === "mock" && jobs.length > 0 && (
        <div
          className="glass"
          style={{
            borderRadius: "var(--r-lg)",
            padding: "12px 16px",
            marginBottom: 14,
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontSize: 13,
            color: "var(--ink-2)",
          }}
        >
          <Icon name="globe" size={15} style={{ color: "var(--accent)", flexShrink: 0 }} />
          <span>
            Live job boards couldn&apos;t be reached right now, so these are{" "}
            <strong style={{ fontWeight: 600 }}>representative listings</strong> matched to your
            filters. Retry shortly for live roles.
          </span>
        </div>
      )}

      {/* list */}
      {error ? (
        <div className="glass" style={{ borderRadius: "var(--r-lg)", padding: "40px 24px", textAlign: "center", color: "var(--ink-2)" }}>
          <Icon name="xcircle" size={22} style={{ color: "#d6447a" }} />
          <div style={{ marginTop: 8 }}>{error}</div>
          <button className="btn btn-glass" style={{ marginTop: 14 }} onClick={() => runSearch(filters)}>
            <Icon name="sync" size={15} /> Retry
          </button>
        </div>
      ) : loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="glass" style={{ borderRadius: "var(--r-lg)", padding: "48px 24px", textAlign: "center", color: "var(--ink-2)" }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--ink)" }}>No matches found</div>
          <p style={{ fontSize: 14, marginTop: 6 }}>
            Try widening your filters, changing the country, or using broader keywords.
          </p>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setSheetOpen(true)}>
            <Icon name="filter" size={15} /> Adjust filters
          </button>
        </div>
      ) : (
        <Stagger style={{ display: "flex", flexDirection: "column", gap: 14 }} gap={0.05} delay={0}>
          {jobs.map((job) => (
            <StaggerItem key={job.id}>
              <JobRow job={job} onTailor={tailorFor} />
            </StaggerItem>
          ))}
        </Stagger>
      )}

      <FilterSheet open={sheetOpen} initial={filters} onClose={() => setSheetOpen(false)} onApply={applyFilters} />
    </Screen>
  );
}
