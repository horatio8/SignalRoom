import Link from "next/link";

/** Branded 404 — every stray URL gets a way back to the desk. */
export default function NotFound() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--surface-app)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: "var(--font-ui)",
        color: "var(--text-primary)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "center" }}>
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontStretch: "112%",
            letterSpacing: "-0.02em",
            fontWeight: 700,
            fontSize: 24,
          }}
        >
          Signal<span style={{ color: "var(--text-secondary)", fontWeight: 500 }}> Room</span>
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-tertiary)" }}>
          404 · this page is not on the map
        </span>
        <Link
          href="/voss/overview"
          style={{
            display: "inline-flex",
            alignItems: "center",
            height: 34,
            padding: "0 16px",
            borderRadius: 10,
            background: "var(--accent)",
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Back to the overview →
        </Link>
      </div>
    </div>
  );
}
