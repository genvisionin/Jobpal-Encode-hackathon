import { Screen, PageHeader } from "@/components/layout";

/**
 * TrackerSkeleton — the loading placeholder for the tracker feed. Mirrors the
 * real layout (stat tiles + rows) with shimmering blocks so the page doesn't
 * jump when data arrives.
 */
export function TrackerSkeleton() {
  return (
    <Screen max={960}>
      <PageHeader title="Application tracker" subtitle="Loading your applications…" />

      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="glass"
            style={{ borderRadius: "var(--r-md)", padding: "14px 16px", flex: 1, minWidth: 120 }}
          >
            <div className="skeleton" style={{ height: 22, width: "40%", marginBottom: 8 }} />
            <div className="skeleton" style={{ height: 11, width: "70%" }} />
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 9, marginBottom: 18, flexWrap: "wrap" }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 32, width: 90, borderRadius: 99 }} />
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="glass"
            style={{ borderRadius: "var(--r-md)", padding: "16px 18px", display: "flex", alignItems: "center", gap: 18 }}
          >
            <div style={{ flex: 1 }}>
              <div className="skeleton" style={{ height: 14, width: "45%", marginBottom: 9 }} />
              <div className="skeleton" style={{ height: 11, width: "25%" }} />
            </div>
            <div className="skeleton" style={{ height: 11, width: 92, borderRadius: 99 }} />
            <div className="skeleton" style={{ height: 26, width: 96, borderRadius: 99 }} />
          </div>
        ))}
      </div>
    </Screen>
  );
}
