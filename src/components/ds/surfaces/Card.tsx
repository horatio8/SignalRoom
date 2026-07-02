"use client";

import React from "react";

export interface CardProps {
  /** Card title (16px semibold). */
  title?: React.ReactNode;
  /** Mono meta line under the title (e.g. "last 24h · updated 2 min ago"). */
  meta?: React.ReactNode;
  /** Header-right actions (buttons, chips). */
  action?: React.ReactNode;
  /** Interior padding. Default 20px. */
  padding?: string;
  /** True for list-style cards: header gets a bottom hairline, body is unpadded. */
  flush?: boolean;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

export function Card({
  title,
  meta,
  action,
  padding = "var(--pad-card)",
  flush = false,
  children,
  style,
}: CardProps) {
  const hasHeader = title || action || meta;
  return (
    <div
      style={{
        background: "var(--surface-panel)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-card-light)",
        display: "flex",
        flexDirection: "column",
        fontFamily: "var(--font-ui)",
        overflow: "hidden",
        ...style,
      }}
    >
      {hasHeader && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: flush ? "14px 16px" : `16px ${padding} 0 ${padding}`,
            ...(flush ? { borderBottom: "1px solid var(--border-subtle)" } : {}),
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
            {title && (
              <span style={{ fontSize: "var(--text-lg)", fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.2 }}>
                {title}
              </span>
            )}
            {meta && (
              <span style={{ fontSize: "var(--text-xs)", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                {meta}
              </span>
            )}
          </div>
          {action && <div style={{ marginLeft: "auto", display: "flex", gap: 8, flex: "none" }}>{action}</div>}
        </div>
      )}
      <div style={{ padding: flush ? 0 : padding, flex: 1, minHeight: 0 }}>{children}</div>
    </div>
  );
}
