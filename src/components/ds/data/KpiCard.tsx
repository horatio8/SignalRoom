"use client";

import React from "react";
import { Sparkline } from "./Sparkline";

export interface KpiCardProps {
  label: string;
  /** Formatted value string ("1,204", "−12", "3.2×"). */
  value: string;
  /** Baseline comparison, e.g. "+38% vs 7-day". Required by system rule 01. */
  delta: string;
  deltaTone?: "pos" | "neg" | "warn" | "neutral";
  /** Raw CSS color override for the delta (prototype passes exact vars). */
  deltaColor?: string;
  /** Optional sparkline values. */
  trend?: number[];
  /** 0-5: heat-tints the whole card when this KPI is the thing to look at (≥3 flips text white). */
  heat?: number;
  style?: React.CSSProperties;
}

export function KpiCard({ label, value, delta, deltaTone = "neutral", deltaColor, trend, heat = 0, style }: KpiCardProps) {
  const toneColor =
    deltaColor ??
    ({ pos: "var(--pos-text)", neg: "var(--neg-text)", warn: "var(--warn-text)", neutral: "var(--text-tertiary)" }[
      deltaTone
    ] ||
      "var(--text-tertiary)");
  const hot = heat >= 3;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "18px 20px",
        borderRadius: "var(--radius-lg)",
        background: heat > 0 ? `var(--heat-${heat})` : "var(--surface-panel)",
        border: `1px solid ${heat > 0 ? "transparent" : "var(--border-subtle)"}`,
        boxShadow: "var(--shadow-card-light)",
        fontFamily: "var(--font-ui)",
        minWidth: 0,
        ...style,
      }}
    >
      <span
        style={{
          fontSize: "var(--text-2xs)",
          fontWeight: 600,
          letterSpacing: "var(--label-tracking)",
          textTransform: "uppercase",
          color: hot ? "rgba(255,255,255,.85)" : "var(--text-tertiary)",
        }}
      >
        {label}
      </span>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12 }}>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-2xl)",
            fontWeight: 500,
            letterSpacing: "-0.02em",
            lineHeight: 1,
            color: hot ? "#fff" : "var(--text-primary)",
          }}
        >
          {value}
        </span>
        {trend && <Sparkline data={trend} width={72} height={26} hot={hot} style={{ marginLeft: "auto" }} />}
      </div>
      {delta && (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            fontWeight: 500,
            color: hot ? "rgba(255,255,255,.9)" : toneColor,
          }}
        >
          {delta}
        </span>
      )}
    </div>
  );
}
