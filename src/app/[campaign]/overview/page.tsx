"use client";

/**
 * S1 Overview — /[campaign]/overview
 * KPI cards · 30d volume chart · media-vs-social split · share of voice ·
 * hour-by-hour heat strip · top stories · ask-the-monitor (M5, Phase-4 flagged).
 */

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { useApp, type CampaignId } from "@/lib/state";
import { dataFor } from "@/lib/data";
import { KpiCard } from "@/components/ds";
import { VolumeChart } from "@/components/app/VolumeChart";
import { cardSurface, displayType, heatTone, monoMeta, overline, sentTone, signed } from "@/lib/ui";

export default function OverviewPage() {
  const { campaign } = useParams<{ campaign: CampaignId }>();
  const router = useRouter();
  const { state, set } = useApp();
  const D = dataFor(campaign);
  const goStories = () => router.push(`/${campaign}/stories`);

  const cannedAsk = (q: string) =>
    `On "${q}" — ${D.name} is at ${D.kpis[0].value} mentions/24h (${D.kpis[0].delta}), net sentiment ${D.kpis[1].value}. The hottest cluster is “${D.stories[0].label}” at ${D.stories[0].vel} baseline (${signed(D.stories[0].sentV)}). Full drill-down is on Stories.`;

  const sendAsk = () => {
    const q = state.askInput.trim();
    if (!q) return;
    set((s) => ({ chat: [...s.chat, { q, a: cannedAsk(q) }], askInput: "" }));
  };

  return (
    <div data-screen-label="S1 Overview" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <span style={{ ...displayType, fontSize: 20, fontWeight: 600 }}>Overview</span>
        <span style={monoMeta}>Wed 2 Jul · 07:58 · updated 2 min ago</span>
      </div>

      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
        {D.kpis.map((k) => (
          <KpiCard key={k.label} label={k.label} value={k.value} delta={k.delta} deltaColor={k.tone} heat={k.heat} />
        ))}
      </div>

      {/* chart + split */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
        <div style={{ ...cardSurface, padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>Volume &amp; share of voice</span>
            <span style={monoMeta}>last 30 days</span>
            <span style={{ marginLeft: "auto", display: "flex", gap: 14, fontSize: 11.5, color: "var(--text-secondary)" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 14, height: 3, borderRadius: 2, background: "var(--chart-us)" }} />
                Us
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 14, height: 3, borderRadius: 2, background: "var(--chart-them)" }} />
                Opponent
              </span>
            </span>
          </div>
          <VolumeChart us={D.chartUs} them={D.chartThem} />
        </div>

        <div style={{ ...cardSurface, padding: 20, display: "flex", flexDirection: "column", gap: 18 }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>Media vs social</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", ...monoMeta }}>
              <span>media {D.mediaCount}</span>
              <span>social {D.socialCount}</span>
            </div>
            <div style={{ display: "flex", height: 10, borderRadius: 999, overflow: "hidden", gap: 2 }}>
              <span style={{ width: `${D.mediaPct}%`, background: "var(--chart-media)" }} />
              <span style={{ flex: 1, background: "var(--chart-social)" }} />
            </div>
            <span style={{ fontSize: 11.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>{D.splitNote}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={overline}>Share of voice · 24h</span>
            <div style={{ display: "flex", height: 10, borderRadius: 999, overflow: "hidden", gap: 2 }}>
              <span style={{ width: `${D.sovUs}%`, background: "var(--chart-us)" }} />
              <span style={{ flex: 1, background: "var(--chart-them)" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", ...monoMeta }}>
              <span>us {D.sovUs}%</span>
              <span>opponent {100 - D.sovUs}%</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: "auto" }}>
            <span style={overline}>Hour-by-hour heat · 24h</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(24,1fr)", gap: 2 }}>
              {D.hours.map((h, i) => (
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

      {/* top stories + ask */}
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
          {D.stories.map((s) => {
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
          })}
        </div>

        <div style={{ ...cardSurface, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>Ask the monitor</span>
            <span
              style={{
                marginLeft: "auto",
                fontFamily: "var(--font-mono)",
                fontSize: 9.5,
                fontWeight: 600,
                letterSpacing: "0.06em",
                padding: "2px 7px",
                borderRadius: 6,
                background: "var(--accent-subtle)",
                color: "var(--accent-text)",
              }}
            >
              PHASE 4 PREVIEW
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, overflowY: "auto", maxHeight: 320 }}>
            {[D.chatIntro, ...state.chat].map((cm, i) => (
              <React.Fragment key={i}>
                <div
                  style={{
                    alignSelf: "flex-end",
                    maxWidth: "90%",
                    padding: "8px 12px",
                    borderRadius: "10px 10px 2px 10px",
                    background: "var(--accent-subtle)",
                    fontSize: 12.5,
                    color: "var(--text-primary)",
                  }}
                >
                  {cm.q}
                </div>
                <div
                  style={{
                    alignSelf: "flex-start",
                    maxWidth: "95%",
                    padding: "10px 12px",
                    borderRadius: "10px 10px 10px 2px",
                    background: "var(--surface-raised)",
                    fontSize: 12.5,
                    lineHeight: 1.55,
                    color: "var(--text-secondary)",
                  }}
                >
                  {cm.a}
                </div>
              </React.Fragment>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={state.askInput}
              onChange={(e) => set({ askInput: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") sendAsk();
              }}
              placeholder="Ask about your coverage…"
              style={{
                flex: 1,
                minWidth: 0,
                height: 32,
                padding: "0 12px",
                borderRadius: 10,
                background: "var(--surface-raised)",
                border: "1px solid var(--border-default)",
                fontFamily: "var(--font-ui)",
                fontSize: 12.5,
                color: "var(--text-primary)",
                outline: "none",
              }}
            />
            <button
              onClick={sendAsk}
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
              Ask
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
