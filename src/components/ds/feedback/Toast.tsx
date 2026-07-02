"use client";

import React from "react";

const TONES = {
  neutral: "var(--sev-info)",
  pos: "var(--pos)",
  neg: "var(--neg)",
  warn: "var(--warn)",
  accent: "var(--accent)",
} as const;

export interface ToastProps {
  tone?: keyof typeof TONES;
  title: React.ReactNode;
  description?: React.ReactNode;
  onDismiss?: () => void;
  style?: React.CSSProperties;
}

/** Transient confirmation/notice. Not for alerts — alerts have their own rail. */
export function Toast({ tone = "neutral", title, description, onDismiss, style }: ToastProps) {
  return (
    <div
      role="status"
      style={{
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
        width: 360,
        padding: "12px 14px",
        background: "var(--surface-overlay)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-popover)",
        fontFamily: "var(--font-ui)",
        ...style,
      }}
    >
      <span
        style={{
          width: 3,
          alignSelf: "stretch",
          borderRadius: 2,
          background: TONES[tone] || TONES.neutral,
          flex: "none",
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0, flex: 1 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{title}</span>
        {description && <span style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.45 }}>{description}</span>}
      </div>
      {onDismiss && (
        <button
          aria-label="Dismiss"
          onClick={onDismiss}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text-tertiary)",
            cursor: "pointer",
            padding: 2,
            flex: "none",
          }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );
}
