"use client";

/**
 * S11 Organic Reach — /[campaign]/reach (operator+)
 * Group discovery, join queue, and chatter monitoring. Not wired to live data
 * yet — the screen keeps its header and shows an honest placeholder.
 */

import React from "react";
import { EmptyState } from "@/components/app/EmptyState";
import { cardSurface, displayType } from "@/lib/ui";

export default function ReachPage() {
  return (
    <div data-screen-label="S11 Organic Reach" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ ...displayType, fontSize: 20, fontWeight: 600 }}>Organic reach</span>
      </div>
      <div style={{ ...cardSurface }}>
        <EmptyState
          title="Reach"
          note="Discover and monitor organic groups, and manage the daily join queue. Not wired to live data yet."
        />
      </div>
    </div>
  );
}
