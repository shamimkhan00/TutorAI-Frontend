export function EmptyState({
  icon,
  title,
  desc,
}: {
  icon: string;
  title: string;
  desc: string;
}) {
  return (
    <div style={{ textAlign: "center", padding: "48px 16px" }}>
      <div style={{ fontSize: "2rem", marginBottom: 14, opacity: 0.25 }}>
        {icon}
      </div>
      <p
        style={{
          fontSize: "0.9375rem",
          fontWeight: 500,
          color: "var(--text-2)",
          marginBottom: 8,
        }}
      >
        {title}
      </p>
      <p
        style={{ fontSize: "0.875rem", color: "var(--text-3)", lineHeight: 1.65 }}
      >
        {desc}
      </p>
    </div>
  );
}
