/** StepDots — a small progress indicator used across onboarding flows. */
export function StepDots({ count, active }: { count: number; active: number }) {
  return (
    <div style={{ display: "flex", gap: 7 }}>
      {Array.from({ length: count }).map((_, k) => (
        <span
          key={k}
          style={{
            height: 6,
            borderRadius: 99,
            transition: "0.2s",
            width: k === active ? 22 : 6,
            background: k === active ? "var(--accent)" : "rgba(26,26,42,.16)",
          }}
        />
      ))}
    </div>
  );
}
