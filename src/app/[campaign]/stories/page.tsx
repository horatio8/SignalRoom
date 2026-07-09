"use client";

/**
 * S3 Stories — /[campaign]/stories
 * Clusters tab (featured hot-cluster card + list) · Opposition ads (F1) ·
 * Press corps (F2).
 */

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { useApp } from "@/lib/state";
import type { FeaturedCluster } from "@/lib/data";
import { useLiveStories, useLivePressCorps } from "@/lib/data/liveAnalytics";
import { Sparkline } from "@/components/ds";
import { EmptyState } from "@/components/app/EmptyState";
import { cardSurface, displayType, heatTone, monoMeta, overline, sentTone, signed } from "@/lib/ui";

/**
 * Neutral fallback for the featured card's two fields the clusters table cannot
 * supply: the per-hour velocity sparkline (no cluster time-series is stored) and
 * a null origin path. spark = [] renders nothing rather than a fabricated line.
 */
const NEUTRAL_FC: FeaturedCluster = {
  label: "",
  vel: "—",
  velBg: "var(--heat-0)",
  border: "var(--border-subtle)",
  status: "open",
  coordinated: false,
  sentV: 0,
  meta: "",
  summary: "",
  path: "origin → spread path pending",
  spark: [],
  sparkBaseline: 0,
  sparkColor: "var(--heat-4)",
  mediaMixPct: 0,
  mixLabel: "mix pending",
  mentionsLabel: "View mentions",
};

export default function StoriesPage() {
  const { campaign } = useParams<{ campaign: string }>();
  const router = useRouter();
  const { state, set } = useApp();
  const canManage = state.role !== "client";
  const { storyTab } = state;

  // Live clusters (RLS-scoped) drive the Clusters tab — featured card + list.
  // The Opposition ads and Press corps tabs are not wired to live data yet.
  const live = useLiveStories(campaign, NEUTRAL_FC);
  const fc = live.fc;
  const otherClusters = live.otherClusters;
  const fss = sentTone(fc.sentV);

  // Press corps (F2) — grown from news bylines; empty until the pipeline fills it.
  const press = useLivePressCorps(campaign);

  const tabs = [
    { id: "clusters", label: "Clusters" },
    { id: "ads", label: "Opposition ads" },
    { id: "press", label: "Press corps" },
  ];

  return (
    <div data-screen-label="S3 Stories" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <span style={{ ...displayType, fontSize: 20, fontWeight: 600 }}>Stories</span>
        {live.live && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={overline}>live</span>
            <span style={monoMeta}>
              {live.openCount} open · {live.fadingCount} fading
            </span>
          </span>
        )}
      </div>

      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border-subtle)" }}>
        {tabs.map((t) => {
          const on = storyTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => set({ storyTab: t.id })}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "10px 12px",
                marginBottom: -1,
                background: "transparent",
                border: "none",
                borderBottom: `2px solid ${on ? "var(--accent)" : "transparent"}`,
                cursor: "pointer",
                fontFamily: "var(--font-ui)",
                fontSize: 13,
                fontWeight: on ? 600 : 500,
                color: on ? "var(--text-primary)" : "var(--text-tertiary)",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {storyTab === "clusters" && !live.live && (
        <div style={{ ...cardSurface }}>
          <EmptyState
            title="No stories yet"
            note="Stories form automatically as mentions are enriched and clustered."
          />
        </div>
      )}

      {storyTab === "clusters" && live.live && (
        <>
          {/* Featured hot cluster */}
          <div
            style={{
              ...cardSurface,
              border: `1px solid ${fc.border}`,
              padding: 20,
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 10,
                  flex: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: fc.velBg,
                  color: "#fff",
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {fc.vel}
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 16, fontWeight: 600 }}>{fc.label}</span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 500,
                      padding: "2px 8px",
                      borderRadius: 6,
                      background: "var(--accent-subtle)",
                      color: "var(--accent-text)",
                    }}
                  >
                    {fc.status}
                  </span>
                  {fc.coordinated && (
                    <span
                      style={{
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
                <span style={monoMeta}>{fc.meta}</span>
              </div>
              <span
                style={{
                  marginLeft: "auto",
                  flex: "none",
                  fontFamily: "var(--font-mono)",
                  fontSize: 13,
                  fontWeight: 500,
                  padding: "3px 10px",
                  borderRadius: 6,
                  background: fss.bg,
                  color: fss.fg,
                }}
              >
                {signed(fc.sentV)}
              </span>
            </div>
            <span style={{ fontSize: 13, lineHeight: 1.55, color: "var(--text-secondary)", maxWidth: 720 }}>{fc.summary}</span>
            <div style={{ display: "flex", gap: 12, alignItems: "stretch" }}>
              <div
                style={{
                  flex: 1.4,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  padding: "12px 14px",
                  borderRadius: 10,
                  background: "var(--surface-sunken)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <span style={overline}>Origin → spread path</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, lineHeight: 1.9, color: "var(--text-secondary)" }}>
                  {fc.path}
                </span>
              </div>
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  padding: "12px 14px",
                  borderRadius: 10,
                  background: "var(--surface-sunken)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <span style={overline}>Velocity · mentions/hr</span>
                <Sparkline data={fc.spark} baseline={fc.sparkBaseline} stroke={fc.sparkColor} width={220} height={54} fluid />
                <div style={{ display: "flex", height: 8, borderRadius: 999, overflow: "hidden", gap: 2 }}>
                  <span style={{ width: `${fc.mediaMixPct}%`, background: "var(--chart-media)" }} />
                  <span style={{ flex: 1, background: "var(--chart-social)" }} />
                </div>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-tertiary)" }}>{fc.mixLabel}</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => router.push(`/${campaign}/feed`)}
                style={{
                  height: 32,
                  padding: "0 14px",
                  borderRadius: 10,
                  border: "1px solid var(--border-default)",
                  background: "var(--surface-raised)",
                  fontFamily: "var(--font-ui)",
                  fontSize: 12.5,
                  fontWeight: 500,
                  color: "var(--text-primary)",
                  cursor: "pointer",
                }}
              >
                {fc.mentionsLabel}
              </button>
              {canManage && (
                <button
                  onClick={() => router.push(`/${campaign}/respond`)}
                  style={{
                    height: 32,
                    padding: "0 14px",
                    borderRadius: 10,
                    border: "none",
                    background: "var(--accent)",
                    color: "#fff",
                    fontFamily: "var(--font-ui)",
                    fontSize: 12.5,
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  Draft response →
                </button>
              )}
            </div>
          </div>

          {/* Remaining clusters */}
          <div style={{ ...cardSurface, overflow: "hidden" }}>
            {otherClusters.map((c) => {
              const hh = heatTone(c.h);
              const ss = sentTone(c.sentV);
              const open = c.status === "open";
              return (
                <div
                  key={c.label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "12px 16px",
                    borderBottom: "1px solid var(--border-subtle)",
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
                    {c.vel}
                  </span>
                  <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0, flex: 1 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.label}
                      </span>
                      <span
                        style={{
                          flex: "none",
                          fontSize: 11,
                          fontWeight: 500,
                          padding: "2px 8px",
                          borderRadius: 6,
                          background: open ? "var(--accent-subtle)" : "var(--surface-raised)",
                          color: open ? "var(--accent-text)" : "var(--text-tertiary)",
                        }}
                      >
                        {c.status}
                      </span>
                    </span>
                    <span style={monoMeta}>
                      {c.mentions} mentions · {c.mix}
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
                    {signed(c.sentV)}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {storyTab === "ads" && (
        <div style={{ ...cardSurface }}>
          <EmptyState
            title="Opposition ads"
            note="Not available yet — opponent ad tracking (Meta Ad Library + Google Ads Transparency) isn't wired to live data."
          />
        </div>
      )}

      {storyTab === "press" && !press.live && (
        <div style={{ ...cardSurface }}>
          <EmptyState
            title="Press corps builds from news bylines"
            note="As news mentions are enriched, the journalists behind them accrue here with outlet, volume, and how they lean."
          />
        </div>
      )}

      {storyTab === "press" && press.live && (
        <div style={{ ...cardSurface, overflow: "hidden" }}>
          {press.journalists.map((j) => {
            const ss = sentTone(j.sentV);
            return (
              <div
                key={`${j.name}·${j.outlet}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "12px 16px",
                  borderBottom: "1px solid var(--border-subtle)",
                }}
              >
                <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0, flex: 1 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {j.name}
                  </span>
                  <span style={monoMeta}>
                    {j.outlet} · {j.count} mentions · last {j.last}
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
                  {signed(j.sentV)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
