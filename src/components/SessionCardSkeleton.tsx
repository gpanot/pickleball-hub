export function SessionCardSkeleton() {
  return (
    <div
      style={{
        height: "200px",
        borderRadius: "12px",
        border: "0.5px solid var(--color-border-tertiary)",
        background: "var(--color-background-secondary)",
        marginBottom: "12px",
        animation: "session-card-skeleton-pulse 1.5s ease-in-out infinite",
      }}
    />
  );
}
