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
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import { useLiveOverview, type ShareOfVoice, type VolumePoint } from "@/lib/data/liveAnalytics";
import { KpiCard } from "@/components/ds";
import { EmptyState } from "@/components/app/EmptyState";
import { cardSurface, displayType, heatTone, monoMeta, overline, sentTone, signed } from "@/lib/ui";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "YYYY-MM-DD" → "Jul 7" (compact mono axis label). */
function fmtDay(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  if (!y || !m || !d) return key;
  return `${MONTHS[m - 1]} ${d}`;
}

/**
 * 30-day volume trend, styled like the design's VolumeChart (sunken plot, gray
 * grid, us = accent line with end dot, opponent = neutral gray — never red).
 * Unlike the fixture chart the x-axis carries the real dates in the series, so a
 * short series (a few days of ingest) renders honestly rather than faking a full
 * month. Only the first / middle / last day are ticked to avoid crowding.
 */
function TrendChart({ series }: { series: VolumePoint[] }) {
  const data = series.map((p, i) => ({ i, us: p.us, them: p.them, date: p.date }));
  const last = data.length - 1;
  const ticks = Array.from(new Set([0, Math.floor(last / 2), last])).filter((t) => t >= 0);
  return (
    <div
      style={{
        flex: 1,
        background: "var(--surface-sunken)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 10,
        padding: "12px 12px 6px",
      }}
    >
      <ResponsiveContainer width="100%" height={185}>
        <LineChart data={data} margin={{ top: 8, right: 26, bottom: 0, left: 10 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeWidth={1} />
          <XAxis
            dataKey="i"
            ticks={ticks}
            tickFormatter={(v: number) => fmtDay(data[v]?.date ?? "")}
            tick={{ fontFamily: "var(--font-mono)", fontSize: 10, fill: "var(--text-tertiary)" }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis hide domain={[0, "dataMax + 2"]} />
          <Line
            type="linear"
            dataKey="them"
            stroke="var(--chart-them)"
            strokeWidth={2}
            dot={data.length === 1 ? { r: 3, fill: "var(--chart-them)" } : false}
            isAnimationActive={false}
          />
          <Line
            type="linear"
            dataKey="us"
            stroke="var(--chart-us)"
            strokeWidth={2}
            dot={data.length === 1 ? { r: 3.5, fill: "var(--chart-us)" } : false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Us-vs-them share-of-voice bar (last 24h) from message_box_quadrant. Us is the
 * accent, them is neutral gray (never red — them is not negative sentiment). The
 * delta line shows the percentage-point swing vs the prior period when both
 * windows have classified rows, and is omitted cleanly otherwise.
 */
function ShareOfVoiceBar({ sov }: { sov: ShareOfVoice }) {
  if (sov.total === 0) {
    return (
      <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
        No classified mentions in the last 24h — share of voice accrues as enrichment tags stance.
      </span>
    );
  }
  const deltaTone =
    sov.deltaPct == null
      ? "var(--text-tertiary)"
      : sov.deltaPct > 0
        ? "var(--pos-text)"
        : sov.deltaPct < 0
          ? "var(--text-secondary)"
          : "var(--text-tertiary)";
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", ...monoMeta }}>
        <span>us {sov.usPct}%</span>
        <span>them {sov.themPct}%</span>
      </div>
      <div style={{ display: "flex", height: 10, borderRadius: 999, overflow: "hidden", gap: 2 }}>
        <span style={{ width: `${sov.usPct}%`, background: "var(--chart-us)" }} />
        <span style={{ flex: 1, background: "var(--chart-them)" }} />
      </div>
      <span style={{ fontSize: 11.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>
        {sov.usCount} us · {sov.themCount} them
        {sov.deltaPct != null && (
          <>
            {" · "}
            <span style={{ fontFamily: "var(--font-mono)", color: deltaTone }}>
              {signed(sov.deltaPct)} pp vs prior
            </span>
          </>
        )}
      </span>
    </>
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
        <KpiCard
          label="Active urgent alerts"
          value={String(ov.urgentAlerts24h)}
          delta="last 24h"
          deltaColor="var(--text-tertiary)"
          heat={ov.urgentAlerts24h > 0 ? 4 : 0}
        />
      </div>

      {/* chart (not wired) + split (live) */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
        <div style={{ ...cardSurface, padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>30-day trend</span>
            <span style={monoMeta}>
              {ov.volumeSeries.length > 0
                ? `${ov.volumeSeries.length} ${ov.volumeSeries.length === 1 ? "day" : "days"} · us vs them`
                : "last 30 days"}
            </span>
          </div>
          {ov.volumeSeries.length > 0 ? (
            <TrendChart series={ov.volumeSeries} />
          ) : (
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
          )}
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
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={overline}>Share of voice · 24h</span>
            <ShareOfVoiceBar sov={ov.shareOfVoice} />
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
