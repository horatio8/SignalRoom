"use client";

import React from "react";

export interface MustCalloutProps {
  /** 1-based item number. */
  index: number;
  issue: string;
  whyNow?: string;
  /** The suggested line, rendered as quoted serif italic. */
  suggestedLine?: string;
  style?: React.CSSProperties;
}

/** Briefing "Must address today" callout: issue → why now → suggested line. Max 3 per briefing. */
export function MustCallout({ index = 1, issue, whyNow, suggestedLine, style }: MustCalloutProps) {
  return (
    <div
      style={{
        display: "flex",
        gap: 14,
        padding: "16px 18px",
        borderRadius: "var(--radius-lg)",
        background: "var(--warn-subtle)",
        border: "1px solid var(--warn)",
        fontFamily: "var(--font-ui)",
        ...style,
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 13,
          fontWeight: 600,
          color: "var(--warn-text)",
          flex: "none",
          lineHeight: 1.4,
        }}
      >
        {String(index).padStart(2, "0")}
      </span>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.35 }}>{issue}</span>
        {whyNow && (
          <span style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>
            <b style={{ fontWeight: 600, color: "var(--warn-text)" }}>Why now — </b>
            {whyNow}
          </span>
        )}
        {suggestedLine && (
          <span
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 14,
              fontStyle: "italic",
              color: "var(--text-primary)",
              lineHeight: 1.55,
              borderLeft: "2px solid var(--warn)",
              paddingLeft: 12,
            }}
          >
            “{suggestedLine}”
          </span>
        )}
      </div>
    </div>
  );
}
