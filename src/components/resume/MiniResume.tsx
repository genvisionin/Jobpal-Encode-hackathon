import type { ResumeLayout } from "@/types";

/**
 * MiniResume — a tiny resume thumbnail rendered inside a white sheet.
 * Three layouts mirror the template families: modern, classic, sidebar.
 */
export function MiniResume({
  accent = "var(--accent)",
  layout = "classic",
  scale = 1,
}: {
  accent?: string;
  layout?: ResumeLayout;
  scale?: number;
}) {
  const line = (w: number, k: string | number, o = 0.1) => (
    <div
      key={k}
      style={{
        height: 3.5 * scale,
        width: w + "%",
        background: `rgba(26,26,42,${o})`,
        borderRadius: 2,
        marginBottom: 5 * scale,
      }}
    />
  );

  if (layout === "sidebar") {
    return (
      <div style={{ display: "flex", height: "100%", gap: 0 }}>
        <div style={{ width: "34%", background: accent, padding: 10 * scale }}>
          <div
            style={{
              width: 22 * scale,
              height: 22 * scale,
              borderRadius: "50%",
              background: "rgba(255,255,255,.85)",
              marginBottom: 8 * scale,
            }}
          />
          {[70, 90, 60, 80].map((w, i) => (
            <div
              key={i}
              style={{
                height: 3 * scale,
                width: w + "%",
                background: "rgba(255,255,255,.55)",
                borderRadius: 2,
                marginBottom: 5 * scale,
              }}
            />
          ))}
        </div>
        <div style={{ flex: 1, padding: 11 * scale }}>
          <div style={{ fontFamily: "var(--serif)", fontSize: 12 * scale, color: "var(--ink)" }}>
            Aanya Mehta
          </div>
          <div style={{ height: 1, background: "var(--hairline)", margin: `${7 * scale}px 0` }} />
          {[95, 80, 88, 70, 90, 60].map((w, i) => line(w, i))}
        </div>
      </div>
    );
  }

  if (layout === "modern") {
    return (
      <div style={{ padding: 13 * scale }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            borderBottom: `2px solid ${accent}`,
            paddingBottom: 6 * scale,
            marginBottom: 9 * scale,
          }}
        >
          <div style={{ fontSize: 13 * scale, fontWeight: 700, color: "var(--ink)" }}>
            AANYA MEHTA
          </div>
          <div style={{ height: 3 * scale, width: "24%", background: accent, borderRadius: 2 }} />
        </div>
        {[100, 82, 90].map((w, i) => line(w, i))}
        <div style={{ height: 5 * scale }} />
        <div style={{ height: 3 * scale, width: "30%", background: accent, borderRadius: 2, marginBottom: 6 * scale }} />
        {[88, 95, 70, 84].map((w, i) => line(w, "b" + i))}
      </div>
    );
  }

  // classic
  return (
    <div style={{ padding: 13 * scale, textAlign: "center" }}>
      <div style={{ fontFamily: "var(--serif)", fontSize: 13 * scale, color: "var(--ink)" }}>
        Aanya Mehta
      </div>
      <div
        style={{
          height: 2.5 * scale,
          width: "40%",
          background: accent,
          borderRadius: 2,
          margin: `${5 * scale}px auto ${9 * scale}px`,
        }}
      />
      <div style={{ textAlign: "left" }}>
        {[96, 84].map((w, i) => line(w, i))}
        <div style={{ height: 1, background: "var(--hairline)", margin: `${8 * scale}px 0` }} />
        {[90, 78, 88, 66].map((w, i) => line(w, "b" + i))}
      </div>
    </div>
  );
}
