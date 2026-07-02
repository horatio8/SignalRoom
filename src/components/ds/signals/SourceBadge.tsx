"use client";

import React from "react";

/** Typographic platform monograms — no third-party logo art. */
const PLATFORMS: Record<string, string> = {
  reddit: "RD",
  x: "X",
  youtube: "YT",
  linkedin: "LI",
  facebook: "FB",
  quora: "QR",
  tiktok: "TT",
  instagram: "IG",
  bluesky: "BS",
  news: "NEWS",
  web: "WEB",
  podcast: "POD",
  rss: "RSS",
  meta: "META",
  google: "GOOG",
};

export interface SourceBadgeProps {
  platform: string;
  style?: React.CSSProperties;
}

export function SourceBadge({ platform = "web", style }: SourceBadgeProps) {
  const label = PLATFORMS[platform] || platform.slice(0, 4).toUpperCase();
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 28,
        height: 20,
        padding: "0 5px",
        borderRadius: "var(--radius-sm)",
        background: "var(--surface-raised)",
        border: "1px solid var(--border-default)",
        fontFamily: "var(--font-mono)",
        fontSize: 9.5,
        fontWeight: 600,
        letterSpacing: "0.04em",
        color: "var(--text-secondary)",
        whiteSpace: "nowrap",
        flex: "none",
        ...style,
      }}
    >
      {label}
    </span>
  );
}
