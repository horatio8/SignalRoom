"use client";

/**
 * S5 Alerts — /[campaign]/alerts (operator+)
 * Alert history and the detector rule set. Not wired to live data yet — the
 * screen keeps its header and shows an honest placeholder.
 */

import React from "react";
import { EmptyState } from "@/components/app/EmptyState";
import { cardSurface, displayType } from "@/lib/ui";

export default function AlertsPage() {
  return (
    <div data-screen-label="S5 Alerts" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ ...displayType, fontSize: 20, fontWeight: 600 }}>Alerts</span>
      </div>
      <div style={{ ...cardSurface }}>
        <EmptyState
          title="Alerts"
          note="Detector rules fire alerts on spikes, big-reach hits, and sentiment slides. Not wired to live data yet."
        />
      </div>
    </div>
  );
}
