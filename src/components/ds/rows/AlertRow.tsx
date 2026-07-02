"use client";

import React from "react";
import { SeverityTag } from "../signals/SeverityTag";

export interface AlertRowProps {
  severity: "info" | "watch" | "urgent";
  headline: string;
  /** One-paragraph AI read (what happened, who's driving it, first-response options). */
  situationRead?: string;
  time?: string;
  /** Delivered channels, e.g. ['email','slack','sms']. */
  channels?: string[];
  onOpen?: () => void;
  style?: React.CSSProperties;
}

/** Fired alert in history: severity + headline + AI situation read + delivery receipts. */
export function AlertRow({
  severity = "info",
  headline,
  situationRead,
  time,
  channels = [],
  onOpen,
  style,
}: AlertRowProps) {
  const [hover, setHover] = React.useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onOpen}
      style={{
        display: "flex",
        gap: 12,
        padding: "14px 16px",
        borderBottom: "1px solid var(--border-subtle)",
        background: hover ? "var(--surface-raised)" : "transparent",
        transition: "background var(--dur-fast) var(--ease-out)",
        fontFamily: "var(--font-ui)",
        cursor: onOpen ? "pointer" : "default",
        ...style,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <SeverityTag severity={severity} />
          <span
            style={{
              fontSize: 13.5,
              fontWeight: 600,
              color: "var(--text-primary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {headline}
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-tertiary)", flex: "none", marginLeft: "auto" }}>
            {time}
          </span>
        </div>
        {situationRead && (
          <span
            style={{
              fontSize: 12.5,
              color: "var(--text-secondary)",
              lineHeight: 1.5,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {situationRead}
          </span>
        )}
        {channels.length > 0 && (
          <div style={{ display: "flex", gap: 6 }}>
            {channels.map((c) => (
              <span
                key={c}
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  fontWeight: 500,
                  padding: "1px 6px",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--surface-raised)",
                  border: "1px solid var(--border-subtle)",
                  color: "var(--text-tertiary)",
                  textTransform: "uppercase",
                }}
              >
                {c}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
