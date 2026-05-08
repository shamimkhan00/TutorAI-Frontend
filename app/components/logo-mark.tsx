export function LogoMark({ size = 38 }: { size?: number }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 11 }}>
      <div
        style={{
          width: size,
          height: size,
          background: "var(--accent)",
          borderRadius: `${Math.round(size * 0.27)}px`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: `${size * 0.44}px`,
          fontFamily: "var(--font-display)",
          color: "#0d0e14",
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        T
      </div>
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontSize: `${size * 0.66}px`,
          color: "var(--text)",
          lineHeight: 1,
        }}
      >
        TutorAI
      </span>
    </div>
  );
}
