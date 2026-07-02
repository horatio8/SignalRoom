"use client";

import React from "react";

export interface FilterChipProps {
  active?: boolean;
  /** Optional mono count. */
  count?: number | string;
  onClick?: () => void;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

/** Toggleable filter pill for the feed/stories filter rows and keyword segments (M1). */
export function FilterChip({ active = false, count, onClick, children, style }: FilterChipProps) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-pressed={active}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        height: 26,
        padding: "0 10px",
        borderRadius: "var(--radius-full)",
        fontFamily: "var(--font-ui)",
        fontSize: 12,
        fontWeight: 500,
        cursor: "pointer",
        background: active ? "var(--accent-subtle)" : hover ? "var(--surface-raised)" : "var(--surface-panel)",
        color: active ? "var(--accent-text)" : "var(--text-secondary)",
        border: `1px solid ${active ? "var(--accent-border)" : "var(--border-default)"}`,
        transition:
          "background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out)",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
      {count != null && <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, opacity: 0.75 }}>{count}</span>}
    </button>
  );
}
