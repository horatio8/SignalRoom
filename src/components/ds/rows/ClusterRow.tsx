"use client";

import React from "react";
import { Badge } from "../feedback/Badge";
import { SentimentChip } from "../signals/SentimentChip";
import { Sparkline } from "../data/Sparkline";

/** Velocity → heat level (0..5). Thresholds as baseline multiples. */
export function heatLevel(velocityX?: number | null): number {
  if (velocityX == null || velocityX < 1) return 0;
  if (velocityX < 1.5) return 1;
  if (velocityX < 2) return 2;
  if (velocityX < 3) return 3;
  if (velocityX < 5) return 4;
  return 5;
}

export interface ClusterRowProps {
  /** AI-written story label. */
  label: string;
  status?: "open" | "fading" | "closed";
  mentions?: number;
  /** Cluster avg sentiment (-100..100). */
  sentiment?: number;
  /** Velocity as multiple of baseline (e.g. 3.2). Drives the heat square: ≥3× turns hot. */
  velocityX?: number;
  /** Hourly counts for the sparkline. */
  trend?: number[];
  /** F7 coordinated-behavior flag. */
  coordinated?: boolean;
  onOpen?: () => void;
  style?: React.CSSProperties;
}

export function ClusterRow({
  label,
  status = "open",
  mentions,
  sentiment,
  velocityX,
  trend = [],
  coordinated = false,
  onOpen,
  style,
}: ClusterRowProps) {
  const [hover, setHover] = React.useState(false);
  const heat = heatLevel(velocityX);
  const hot = heat >= 3;
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onOpen}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "12px 16px",
        borderBottom: "1px solid var(--border-subtle)",
        background: hover ? "var(--surface-raised)" : "transparent",
        transition: "background var(--dur-fast) var(--ease-out)",
        fontFamily: "var(--font-ui)",
        cursor: onOpen ? "pointer" : "default",
        ...style,
      }}
    >
      <span
        title={`velocity ${velocityX}× baseline`}
        style={{
          width: 34,
          height: 34,
          borderRadius: 8,
          flex: "none",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: `var(--heat-${heat})`,
          fontFamily: "var(--font-mono)",
          fontSize: 10.5,
          fontWeight: 600,
          color: hot ? "#fff" : "var(--text-secondary)",
        }}
      >
        {velocityX != null ? `${velocityX}×` : "—"}
      </span>
      <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
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
            {label}
          </span>
          <Badge tone={status === "open" ? "accent" : "neutral"}>{status}</Badge>
          {coordinated && <Badge tone="warn">possibly coordinated</Badge>}
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-tertiary)" }}>
          {mentions != null ? `${mentions.toLocaleString()} mentions` : ""}
        </span>
      </div>
      {trend.length > 0 && <Sparkline data={trend} width={90} height={26} hot={hot} />}
      {sentiment != null && <SentimentChip value={sentiment} />}
    </div>
  );
}
