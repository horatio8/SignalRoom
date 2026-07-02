"use client";

/**
 * S7 Admin — /admin (owner only)
 * Cross-campaign table with LLM spend meters (amber ≥60%, red ≥80%, 80% tick) ·
 * ingest volume by source · ops numbers · platform cost vs $250 ceiling (§9) ·
 * golden-set eval · secrets-rotation reminder.
 */

import React from "react";
import { AppShell } from "@/components/app/AppShell";
import { useApp } from "@/lib/state";
import { adminCampaigns, ingestRows } from "@/lib/data";
import { cardSurface, displayType, monoMeta, overline } from "@/lib/ui";

export default function AdminPage() {
  const { state } = useApp();
  return (
    <AppShell screen="admin" campaign={state.campaign}>
      <AdminScreen />
    </AppShell>
  );
}

function AdminScreen() {
  return (
    <div data-screen-label="S7 Admin" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ ...displayType, fontSize: 20, fontWeight: 600 }}>Admin</span>
        <span style={monoMeta}>cross-campaign · owner only</span>
        <span style={{ marginLeft: "auto", ...monoMeta }}>secrets last rotated 12 May · due 12 Aug</span>
      </div>

      {/* Cross-campaign table */}
      <div style={{ ...cardSurface, overflow: "hidden" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.6fr 0.8fr 0.9fr 0.9fr 0.9fr 1.4fr",
            gap: 12,
            padding: "10px 16px",
            borderBottom: "1px solid var(--border-subtle)",
            ...overline,
          }}
        >
          <span>Campaign</span>
          <span>Status</span>
          <span>24h volume</span>
          <span>Queue depth</span>
          <span>Dup rate</span>
          <span>LLM spend / $40</span>
        </div>
        {adminCampaigns.map((ac) => (
          <div
            key={ac.name}
            style={{
              display: "grid",
              gridTemplateColumns: "1.6fr 0.8fr 0.9fr 0.9fr 0.9fr 1.4fr",
              gap: 12,
              padding: "12px 16px",
              borderBottom: "1px solid var(--border-subtle)",
              alignItems: "center",
            }}
          >
            <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{ac.name}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-tertiary)" }}>{ac.plan}</span>
            </span>
            <span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  padding: "2px 8px",
                  borderRadius: 6,
                  background: ac.stBg,
                  color: ac.stFg,
                }}
              >
                {ac.status}
              </span>
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{ac.vol}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: ac.qColor }}>{ac.queue}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: ac.dupColor }}>{ac.dup}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ position: "relative", flex: 1, height: 6, borderRadius: 999, background: "var(--surface-sunken)", overflow: "hidden" }}>
                <span
                  style={{
                    position: "absolute",
                    inset: "0 auto 0 0",
                    width: ac.spendPct,
                    borderRadius: 999,
                    background: ac.spendColor,
                  }}
                />
                <span style={{ position: "absolute", top: 0, bottom: 0, left: "80%", width: 1, background: "var(--border-strong)" }} />
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: ac.spendTextColor, flex: "none" }}>{ac.spend}</span>
            </span>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 12, alignItems: "start" }}>
        {/* Ingest volume */}
        <div style={{ ...cardSurface, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>Ingest volume by source</span>
            <span style={monoMeta}>items/hr · last 24h</span>
          </div>
          {ingestRows.map((ig) => (
            <div key={ig.name} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, fontWeight: 600, width: 72, flex: "none" }}>{ig.name}</span>
              <span style={{ flex: 1, height: 8, borderRadius: 999, background: "var(--surface-sunken)", overflow: "hidden", position: "relative" }}>
                <span
                  style={{
                    position: "absolute",
                    inset: "0 auto 0 0",
                    width: ig.pct,
                    borderRadius: 999,
                    background: ig.color,
                  }}
                />
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-tertiary)", width: 110, flex: "none", textAlign: "right" }}>
                {ig.meta}
              </span>
            </div>
          ))}
          <div
            style={{
              display: "flex",
              gap: 20,
              paddingTop: 8,
              borderTop: "1px solid var(--border-subtle)",
              fontFamily: "var(--font-mono)",
              fontSize: 11.5,
            }}
          >
            <span>
              queue depth <b style={{ color: "var(--pos-text)" }}>14</b>{" "}
              <span style={{ color: "var(--text-tertiary)" }}>(no growth)</span>
            </span>
            <span>
              enrich_failed <b style={{ color: "var(--warn-text)" }}>3</b>{" "}
              <span style={{ color: "var(--text-tertiary)" }}>manual sweep</span>
            </span>
            <span>
              delivery failures 24h <b style={{ color: "var(--pos-text)" }}>0</b>
            </span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Platform cost */}
          <div style={{ ...cardSurface, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontSize: 16, fontWeight: 600 }}>Platform cost</span>
              <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--warn-text)" }}>
                $187 / $250
              </span>
            </div>
            <span style={{ position: "relative", height: 8, borderRadius: 999, background: "var(--surface-sunken)", overflow: "hidden" }}>
              <span style={{ position: "absolute", inset: "0 auto 0 0", width: "75%", borderRadius: 999, background: "var(--warn)" }} />
              <span style={{ position: "absolute", top: 0, bottom: 0, left: "80%", width: 1, background: "var(--border-strong)" }} />
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-tertiary)" }}>
              alarm at 80% ($200) · Jul projection $214
            </span>
          </div>

          {/* Golden-set eval */}
          <div style={{ ...cardSurface, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontSize: 16, fontWeight: 600 }}>Golden-set eval</span>
              <span style={monoMeta}>prompt v12 vs v11 · 200 labeled/country</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, fontFamily: "var(--font-mono)", fontSize: 12 }}>
              <span style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-secondary)" }}>relevance F1</span>
                <span>
                  <b>0.91</b> <span style={{ color: "var(--pos-text)" }}>+0.02</span>
                </span>
              </span>
              <span style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-secondary)" }}>sentiment MAE</span>
                <span>
                  <b>11.2</b> <span style={{ color: "var(--pos-text)" }}>−1.4</span>
                </span>
              </span>
              <span style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-secondary)" }}>stance flips (AU set)</span>
                <span>
                  <b>4</b> <span style={{ color: "var(--warn-text)" }}>+1 · review</span>
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
