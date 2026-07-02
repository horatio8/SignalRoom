"use client";

import React from "react";

export interface StepIndicatorProps {
  /** Step labels in order, e.g. ["Basics","Keywords","Sources","Delivery","Backfill"]. */
  steps: string[];
  /** 0-indexed current step. */
  current: number;
  style?: React.CSSProperties;
}

/** Onboarding step tracker (S8): numbered dots, check on done, accent line fills. */
export function StepIndicator({ steps = [], current = 0, style }: StepIndicatorProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, fontFamily: "var(--font-ui)", ...style }}>
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <React.Fragment key={label}>
            {i > 0 && (
              <span
                style={{
                  flex: 1,
                  height: 1,
                  minWidth: 24,
                  background: done || active ? "var(--accent)" : "var(--border-default)",
                  margin: "0 8px",
                }}
              />
            )}
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flex: "none" }}>
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  flex: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: done ? "var(--accent)" : active ? "var(--accent-subtle)" : "var(--surface-raised)",
                  border: `1px solid ${done || active ? "var(--accent)" : "var(--border-default)"}`,
                  fontFamily: "var(--font-mono)",
                  fontSize: 10.5,
                  fontWeight: 600,
                  color: done ? "#fff" : active ? "var(--accent-text)" : "var(--text-tertiary)",
                }}
              >
                {done ? (
                  <svg width="9" height="7" viewBox="0 0 9 7">
                    <path d="M1 3.5L3.5 6 8 1" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                ) : (
                  i + 1
                )}
              </span>
              <span
                style={{
                  fontSize: 12.5,
                  fontWeight: active ? 600 : 500,
                  color: active ? "var(--text-primary)" : done ? "var(--text-secondary)" : "var(--text-tertiary)",
                  whiteSpace: "nowrap",
                }}
              >
                {label}
              </span>
            </span>
          </React.Fragment>
        );
      })}
    </div>
  );
}
