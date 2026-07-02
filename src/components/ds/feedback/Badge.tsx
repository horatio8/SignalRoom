"use client";

import React from "react";

const TONES = {
  neutral: { color: "var(--text-secondary)", background: "var(--surface-raised)", border: "var(--border-default)" },
  accent: { color: "var(--accent-text)", background: "var(--accent-subtle)", border: "var(--accent-border)" },
  pos: { color: "var(--pos-text)", background: "var(--pos-subtle)", border: "transparent" },
  neg: { color: "var(--neg-text)", background: "var(--neg-subtle)", border: "transparent" },
  warn: { color: "var(--warn-text)", background: "var(--warn-subtle)", border: "transparent" },
} as const;

export interface BadgeProps {
  tone?: keyof typeof TONES;
  /** Mono for data values (counts, kinds). */
  mono?: boolean;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export function Badge({ tone = "neutral", mono = false, children, style }: BadgeProps) {
  const t = TONES[tone] || TONES.neutral;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "2px 8px",
        borderRadius: "var(--radius-sm)",
        fontFamily: mono ? "var(--font-mono)" : "var(--font-ui)",
        fontSize: 11.5,
        fontWeight: 500,
        whiteSpace: "nowrap",
        color: t.color,
        background: t.background,
        border: `1px solid ${t.border}`,
        ...style,
      }}
    >
      {children}
    </span>
  );
}
