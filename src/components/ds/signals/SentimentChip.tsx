"use client";

import React from "react";

export interface SentimentChipProps {
  /** Stance-aware sentiment toward our candidate (-100..100). */
  value: number;
  style?: React.CSSProperties;
}

/** Signed mono number chip. Sentiment is never color alone — the number is always shown. */
export function SentimentChip({ value = 0, style }: SentimentChipProps) {
  const tone = value > 10 ? "pos" : value < -10 ? "neg" : "warn";
  const colors = {
    pos: { color: "var(--pos-text)", bg: "var(--pos-subtle)" },
    neg: { color: "var(--neg-text)", bg: "var(--neg-subtle)" },
    warn: { color: "var(--warn-text)", bg: "var(--warn-subtle)" },
  }[tone];
  const label = value > 0 ? `+${value}` : `${value}`;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: "var(--radius-sm)",
        fontFamily: "var(--font-mono)",
        fontSize: 12,
        fontWeight: 500,
        color: colors.color,
        background: colors.bg,
        whiteSpace: "nowrap",
        flex: "none",
        ...style,
      }}
    >
      {label}
    </span>
  );
}
