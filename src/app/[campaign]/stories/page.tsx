"use client";

/**
 * S3 Stories — /[campaign]/stories
 * Clusters tab (featured hot-cluster card + list) · Opposition ads (F1) ·
 * Press corps (F2).
 */

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { useApp, type CampaignId } from "@/lib/state";
import { dataFor } from "@/lib/data";
import { Sparkline } from "@/components/ds";
import { PlatformChip } from "@/components/app/PlatformChip";
import { cardSurface, displayType, heatTone, monoMeta, overline, sentTone, signed } from "@/lib/ui";

export default function StoriesPage() {
  const { campaign } = useParams<{ campaign: CampaignId }>();
  const router = useRouter();
  const { state, set } = useApp();
  const D = dataFor(campaign);
  const canManage = state.role !== "client";
  const { storyTab } = state;
  const fc = D.fc;
  const fss = sentTone(fc.sentV);

  const tabs = [
    { id: "clusters", label: "Clusters" },
    { id: "ads", label: "Opposition ads" },
    { id: "press", label: "Press corps" },
  ];

  return (
    <div data-screen-label="S3 Stories" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <span style={{ ...displayType, fontSize: 20, fontWeight: 600 }}>Stories</span>
        <span style={monoMeta}>5 open clusters · 2 fading</span>
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

      {storyTab === "clusters" && (
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
            {D.otherClusters.map((c) => {
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
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 14px",
              borderRadius: 10,
              background: "var(--warn-subtle)",
              border: "1px solid var(--warn)",
            }}
          >
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: "var(--warn-text)" }}>▲ NEW</span>
            <span style={{ fontSize: 12.5, color: "var(--text-primary)" }}>{D.adsNote}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
            {D.oppoAds.map((ad, i) => {
              const active = ad.active === "active";
              return (
                <div key={i} style={{ ...cardSurface, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <PlatformChip pf={ad.pf} size={24} />
                    <span style={{ fontSize: 12.5, fontWeight: 600 }}>{ad.advertiser}</span>
                    <span
                      style={{
                        marginLeft: "auto",
                        fontSize: 10.5,
                        fontWeight: 500,
                        padding: "2px 8px",
                        borderRadius: 6,
                        background: active ? "var(--pos-subtle)" : "var(--surface-raised)",
                        color: active ? "var(--pos-text)" : "var(--text-tertiary)",
                      }}
                    >
                      {ad.active}
                    </span>
                  </div>
                  <span style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--text-secondary)", fontStyle: "italic" }}>
                    “{ad.creative}”
                  </span>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      color: "var(--text-tertiary)",
                      marginTop: "auto",
                    }}
                  >
                    <span>
                      spend {ad.spend} · impr {ad.impressions}
                    </span>
                    <span>
                      {ad.regions} · {ad.dates}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <span style={monoMeta}>source: Meta Ad Library + Google Ads Transparency · pulled daily per tracked opponent</span>
        </>
      )}

      {storyTab === "press" && (
        <div style={{ ...cardSurface, overflow: "hidden" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1.4fr 0.8fr 0.9fr 1fr",
              gap: 12,
              padding: "10px 16px",
              borderBottom: "1px solid var(--border-subtle)",
              ...overline,
            }}
          >
            <span>Journalist</span>
            <span>Outlet</span>
            <span>Articles</span>
            <span>Avg sentiment</span>
            <span>Last wrote</span>
          </div>
          {D.pressCorps.map((j) => (
            <div
              key={j.name}
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1.4fr 0.8fr 0.9fr 1fr",
                gap: 12,
                padding: "12px 16px",
                borderBottom: "1px solid var(--border-subtle)",
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600 }}>{j.name}</span>
              <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>{j.outlet}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-secondary)" }}>{j.count}</span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  fontWeight: 500,
                  color: j.sentV > 10 ? "var(--pos-text)" : j.sentV < -10 ? "var(--neg-text)" : "var(--warn-text)",
                }}
              >
                {signed(j.sentV)}
              </span>
              <span style={monoMeta}>{j.last}</span>
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", fontSize: 12, color: "var(--text-secondary)" }}>
            Built from your own coverage bylines · pairs with Amplify media-release rails for distribution
          </div>
        </div>
      )}
    </div>
  );
}
