"use client";

/**
 * S12 Narrative — /[campaign]/narrative
 * Narrative control + the message-box (Leesburg) grid map coverage into themes.
 * Not wired to live data yet — the screen keeps its header and shows an honest
 * placeholder until theme classification is available.
 */

import React from "react";
import { EmptyState } from "@/components/app/EmptyState";
import { cardSurface, displayType } from "@/lib/ui";

export default function NarrativePage() {
  return (
    <div data-screen-label="S12 Narrative" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <span style={{ ...displayType, fontSize: 20, fontWeight: 600 }}>Narrative</span>
      </div>
      <div style={{ ...cardSurface }}>
        <EmptyState
          title="Narrative"
          note="Narrative control and the message-box grid map coverage into themes. Not wired to live data yet."
        />
      </div>
    </div>
  );
}
