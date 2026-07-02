"use client";

import React from "react";

const STATUS = {
  healthy: { color: "var(--pos)", text: "var(--pos-text)", label: "healthy" },
  degraded: { color: "var(--warn)", text: "var(--warn-text)", label: "degraded" },
  down: { color: "var(--neg)", text: "var(--neg-text)", label: "down" },
  off: { color: "var(--sev-info)", text: "var(--text-tertiary)", label: "off" },
} as const;

export interface SourceHealthCardProps {
  /** Adapter name, mono ("kwatch", "newsdata"). */
  source: string;
  status: keyof typeof STATUS;
  lastItem?: string;
  rate?: string;
  note?: string;
  style?: React.CSSProperties;
}

export function SourceHealthCard({ source, status = "healthy", lastItem, rate, note, style }: SourceHealthCardProps) {
  const s = STATUS[status] || STATUS.healthy;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "14px 16px",
        borderRadius: "var(--radius-lg)",
        background: "var(--surface-panel)",
        border: "1px solid var(--border-subtle)",
        boxShadow: "var(--shadow-card-light)",
        fontFamily: "var(--font-ui)",
        minWidth: 0,
        ...style,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: s.color, flex: "none" }} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)" }}>
          {source}
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: s.text,
          }}
        >
          {s.label}
        </span>
      </div>
      <div style={{ display: "flex", gap: 12, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-tertiary)" }}>
        {rate && <span>{rate}</span>}
        {lastItem && <span>last item {lastItem}</span>}
      </div>
      {note && <span style={{ fontSize: 11.5, color: "var(--text-secondary)", lineHeight: 1.45 }}>{note}</span>}
    </div>
  );
}
