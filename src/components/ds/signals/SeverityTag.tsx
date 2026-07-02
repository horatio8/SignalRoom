"use client";

import React from "react";

const SEV = {
  info: { color: "var(--sev-info)", bg: "var(--sev-info-subtle)", dot: "var(--sev-info)", label: "Info" },
  watch: { color: "var(--warn-text)", bg: "var(--sev-watch-subtle)", dot: "var(--sev-watch)", label: "Watch" },
  urgent: { color: "var(--neg-text)", bg: "var(--sev-urgent-subtle)", dot: "var(--sev-urgent)", label: "Urgent" },
} as const;

export interface SeverityTagProps {
  /** The fixed three-level severity. Never invent a fourth. */
  severity: "info" | "watch" | "urgent";
  style?: React.CSSProperties;
}

export function SeverityTag({ severity = "info", style }: SeverityTagProps) {
  const s = SEV[severity] || SEV.info;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 10px",
        borderRadius: "var(--radius-full)",
        fontFamily: "var(--font-ui)",
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: "var(--label-tracking)",
        textTransform: "uppercase",
        color: s.color,
        background: s.bg,
        whiteSpace: "nowrap",
        flex: "none",
        ...style,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot, flex: "none" }} />
      {s.label}
    </span>
  );
}
