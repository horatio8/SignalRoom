"use client";

import React from "react";

export interface CostMeterProps {
  label: string;
  spent: number;
  budget: number;
  /** Prefix, default "$". */
  unit?: string;
  style?: React.CSSProperties;
}

/** Budget meter with the 80% alarm from spec §9. Bar turns amber ≥60%, red ≥80%. */
export function CostMeter({ label, spent, budget, unit = "$", style }: CostMeterProps) {
  const pct = Math.min(100, (spent / budget) * 100);
  const alarm = pct >= 80;
  const barColor = alarm ? "var(--neg)" : pct >= 60 ? "var(--warn)" : "var(--pos)";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, fontFamily: "var(--font-ui)", ...style }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span
          style={{
            fontSize: "var(--text-2xs)",
            fontWeight: 600,
            letterSpacing: "var(--label-tracking)",
            textTransform: "uppercase",
            color: "var(--text-tertiary)",
          }}
        >
          {label}
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: alarm ? "var(--neg-text)" : "var(--text-secondary)",
          }}
        >
          {unit}
          {spent.toLocaleString()} / {unit}
          {budget.toLocaleString()}
        </span>
      </div>
      <div style={{ position: "relative", height: 6, borderRadius: 999, background: "var(--surface-sunken)", overflow: "hidden" }}>
        <div
          style={{
            position: "absolute",
            inset: "0 auto 0 0",
            width: `${pct}%`,
            borderRadius: 999,
            background: barColor,
            transition: "width var(--dur-med) var(--ease-out)",
          }}
        />
        <div style={{ position: "absolute", top: 0, bottom: 0, left: "80%", width: 1, background: "var(--border-strong)" }} />
      </div>
      {alarm && (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--neg-text)" }}>
          ▲ over 80% alarm threshold
        </span>
      )}
    </div>
  );
}
