"use client";

/**
 * S7 Admin — /admin (owner only)
 * Cross-campaign operations metrics (volume, queue depth, LLM spend, evals).
 * Not wired to live data yet — the screen keeps its header and shows an honest
 * placeholder.
 */

import React from "react";
import { AppShell } from "@/components/app/AppShell";
import { useApp } from "@/lib/state";
import { EmptyState } from "@/components/app/EmptyState";
import { cardSurface, displayType } from "@/lib/ui";

export default function AdminPage() {
  const { state } = useApp();
  return (
    <AppShell screen="admin" campaign={state.campaign}>
      <div data-screen-label="S7 Admin" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ ...displayType, fontSize: 20, fontWeight: 600 }}>Admin</span>
        </div>
        <div style={{ ...cardSurface }}>
          <EmptyState
            title="Admin"
            note="Cross-campaign operations metrics — not wired to live data yet."
          />
        </div>
      </div>
    </AppShell>
  );
}
