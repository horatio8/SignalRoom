"use client";

/**
 * S4 Briefings — /[campaign]/briefings
 * The daily 06:00 / 16:00 briefing archive and rendered report. Not wired to
 * live data yet — the screen keeps its header and shows an honest placeholder.
 */

import React from "react";
import { EmptyState } from "@/components/app/EmptyState";
import { cardSurface, displayType } from "@/lib/ui";

export default function BriefingsPage() {
  return (
    <div data-screen-label="S4 Briefings" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ ...displayType, fontSize: 20, fontWeight: 600 }}>Briefings</span>
      </div>
      <div style={{ ...cardSurface }}>
        <EmptyState
          title="Briefings"
          note="The daily briefing digests each morning's coverage into one read. Not wired to live data yet."
        />
      </div>
    </div>
  );
}
