"use client";

/**
 * S1 Overview — /[campaign]/overview
 * Live KPIs (24h volume, net sentiment) · media-vs-social split · hour-by-hour
 * heat strip · top stories — all from useLiveOverview. The panels that mentions
 * alone can't honestly fill (share of voice, urgent-alert KPI, the 30-day volume
 * chart, ask-the-monitor) show inline "not available yet" placeholders. Zero
 * live mentions → a single empty state for the screen.
 */

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { useLiveOverview } from "@/lib/data/liveAnalytics";
import { KpiCard } from "@/components/ds";
import { EmptyState } from "@/components/app/EmptyState";
import { cardSurface, displayType, heatTone, monoMeta, overline, sentTone, signed } from "@/lib/ui";

/** A KPI-shaped placeholder (dashed) for a metric not wired to live data yet. */
function NotWiredKpi({ label, note }: { label: string; note: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "18px 20px",
        borderRadius: "var(--radius-lg)",
        background: "var(--surface-panel)",
        border: "1px dashed var(--border-default)",
        boxShadow: "var(--shadow-card-light)",
        minWidth: 0,
      }}
    >
      <span
        style={{
          fontSize: "var(--text-2xs)",
          fontWeight: 600,
          letterSpacing: "var(--label-tracking)",
          textTransform: "uppercase",
          color: "var(--text-tertiary)",
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--text-tertiary)" }}>{note}</span>
    </div>
  );
}

export default function OverviewPage() {
  const { campaign } = useParams<{ campaign: string }>();
  const router = useRouter();
  const goStories = () => router.push(`/${campaign}/stories`);

  // Live aggregates (RLS-scoped). `live` is false only when there are zero live
  // mentions — in which case the whole screen is a single empty state.
  const ov = useLiveOverview(campaign);

  if (!ov.live) {
    return (
      <div data-screen-label="S1 Overview" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <span style={{ ...displayType, fontSize: 20, fontWeight: 600 }}>Overview</span>
        </div>
        <div style={{ ...cardSurface }}>
          <EmptyState
            title="No mentions yet"
            note="Overview fills in as ingest captures mentions — the first sweep seeds volume, sentiment, the heat strip, and top stories."
          />
        </div>
      </div>
    );
  }

  return (
    <div data-screen-label="S1 Overview" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <span style={{ ...displayType, fontSize: 20, fontWeight: 600 }}>Overview</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={overline}>live</span>
          <span style={monoMeta}>{ov.mentionCount} mentions</span>
        </span>
      </div>

      {/* KPI row — two live KPIs + the alerts KPI (not wired yet) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
        <KpiCard
          label={ov.volumeKpi.label}
          value={ov.volumeKpi.value}
          delta={ov.volumeKpi.delta}
          deltaColor={ov.volumeKpi.tone}
          heat={ov.volumeKpi.heat}
        />
        <KpiCard
          label={ov.sentimentKpi.label}
          value={ov.sentimentKpi.value}
          delta={ov.sentimentKpi.delta}
          deltaColor={ov.sentimentKpi.tone}
          heat={ov.sentimentKpi.heat}
        />
        <NotWiredKpi label="Active urgent alerts" note="Not wired yet." />
      </div>

      {/* chart (not wired) + split (live) */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
        <div style={{ ...cardSurface, padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>30-day trend</span>
            <span style={monoMeta}>last 30 days</span>
          </div>
          <div
            style={{
              flex: 1,
              minHeight: 160,
              display: "flex",
              borderRadius: 10,
              border: "1px dashed var(--border-default)",
              background: "var(--surface-sunken)",
            }}
          >
            <EmptyState
              title="30-day trend"
              note="Accrues with history — the volume and share-of-voice series build as days of ingest accumulate."
            />
          </div>
        </div>

        <div style={{ ...cardSurface, padding: 20, display: "flex", flexDirection: "column", gap: 18 }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>Media vs social</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", ...monoMeta }}>
              <span>media {ov.mediaCount}</span>
              <span>social {ov.socialCount}</span>
            </div>
            <div style={{ display: "flex", height: 10, borderRadius: 999, overflow: "hidden", gap: 2 }}>
              <span style={{ width: `${ov.mediaPct}%`, background: "var(--chart-media)" }} />
              <span style={{ flex: 1, background: "var(--chart-social)" }} />
            </div>
            <span style={{ fontSize: 11.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>
              Last 24h · {ov.mediaPct}% media
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={overline}>Share of voice · 24h</span>
            <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
              Share of voice — needs opponent classification.
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: "auto" }}>
            <span style={overline}>Hour-by-hour heat · 24h</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(24,1fr)", gap: 2 }}>
              {ov.hours.map((h, i) => (
                <span
                  key={i}
                  title={`${String(i).padStart(2, "0")}:00`}
                  style={{ height: 16, borderRadius: 3, background: `var(--heat-${h})` }}
                />
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-tertiary)" }}>
              <span>00:00</span>
              <span>12:00</span>
              <span>now</span>
            </div>
          </div>
        </div>
      </div>

      {/* top stories (live) + ask (not wired) */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
        <div style={{ ...cardSurface, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", padding: "14px 16px", borderBottom: "1px solid var(--border-subtle)" }}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>Top stories</span>
            <button
              onClick={goStories}
              style={{
                marginLeft: "auto",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                fontFamily: "var(--font-ui)",
                fontSize: 12,
                fontWeight: 500,
                color: "var(--accent-text)",
              }}
            >
              View all →
            </button>
          </div>
          {ov.stories.length === 0 ? (
            <EmptyState
              title="No stories yet"
              note="Stories form automatically as mentions are enriched and clustered."
            />
          ) : (
            ov.stories.map((s) => {
              const hh = heatTone(s.h);
              const ss = sentTone(s.sentV);
              return (
                <div
                  key={s.label}
                  onClick={goStories}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "12px 16px",
                    borderBottom: "1px solid var(--border-subtle)",
                    cursor: "pointer",
                  }}
                >
                  <span
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 8,
                      flex: "none",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: hh.bg,
                      color: hh.fg,
                      fontFamily: "var(--font-mono)",
                      fontSize: 10.5,
                      fontWeight: 600,
                    }}
                  >
                    {s.vel}
                  </span>
                  <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0, flex: 1 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {s.label}
                      </span>
                      {s.coordinated && (
                        <span
                          style={{
                            flex: "none",
                            fontSize: 11,
                            fontWeight: 500,
                            padding: "2px 8px",
                            borderRadius: 6,
                            background: "var(--warn-subtle)",
                            color: "var(--warn-text)",
                          }}
                        >
                          possibly coordinated
                        </span>
                      )}
                    </span>
                    <span style={monoMeta}>
                      {s.mentions} mentions · {s.mix}
                    </span>
                  </span>
                  <span
                    style={{
                      flex: "none",
                      fontFamily: "var(--font-mono)",
                      fontSize: 12,
                      fontWeight: 500,
                      padding: "2px 8px",
                      borderRadius: 6,
                      background: ss.bg,
                      color: ss.fg,
                    }}
                  >
                    {signed(s.sentV)}
                  </span>
                </div>
              );
            })
          )}
        </div>

        <div style={{ ...cardSurface, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "16px 16px 0" }}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>Ask the monitor</span>
          </div>
          <EmptyState
            title="Ask the monitor"
            note="Coming in a later phase — a chat that answers questions about your live coverage."
          />
        </div>
      </div>
    </div>
  );
}
