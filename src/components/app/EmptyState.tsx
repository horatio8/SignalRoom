"use client";

/**
 * Shared "what isn't there" placeholder. Two honest intents, conveyed by copy
 * (not styling): "no data yet" for live-wired surfaces awaiting rows, and
 * "not available yet" for features not wired to live data. Centered and muted,
 * compact enough to embed in a card or fill a whole panel.
 */

import React from "react";
import { displayType } from "@/lib/ui";

export function EmptyState({ title, note }: { title: string; note?: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        textAlign: "center",
        padding: "40px 24px",
        minHeight: 140,
      }}
    >
      <span style={{ ...displayType, fontSize: 15, fontWeight: 600, color: "var(--text-secondary)" }}>
        {title}
      </span>
      {note && (
        <span style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--text-tertiary)", maxWidth: 440 }}>
          {note}
        </span>
      )}
    </div>
  );
}
