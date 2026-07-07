"use client";

/**
 * S10 Respond — /[campaign]/respond (operator+)
 * Response drafting, human approval, and publish rails. Not wired to live data
 * yet — the screen keeps its header and shows an honest placeholder.
 */

import React from "react";
import { EmptyState } from "@/components/app/EmptyState";
import { cardSurface, displayType } from "@/lib/ui";

export default function RespondPage() {
  return (
    <div data-screen-label="S10 Respond" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ ...displayType, fontSize: 20, fontWeight: 600 }}>Respond</span>
      </div>
      <div style={{ ...cardSurface }}>
        <EmptyState
          title="Respond"
          note="Draft, approve, and publish responses to a spike — every word human-approved. Not wired to live data yet."
        />
      </div>
    </div>
  );
}
