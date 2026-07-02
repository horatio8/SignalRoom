"use client";

/**
 * S4 Briefings — /[campaign]/briefings
 * Archive rail + rendered briefing (the 7 fixed sections, §6) · clips toggle
 * (F3) · weekly PDF (F3) · 👍/👎 feedback loop · model/prompt version meta.
 */

import React from "react";
import { useParams } from "next/navigation";
import { useApp, type CampaignId } from "@/lib/state";
import { dataFor } from "@/lib/data";
import { MustCallout } from "@/components/ds";
import { cardSurface, displayType, monoMeta, overline } from "@/lib/ui";

export default function BriefingsPage() {
  const { campaign } = useParams<{ campaign: CampaignId }>();
  const { state, set, notify } = useApp();
  const D = dataFor(campaign);
  const canManage = state.role !== "client";
  const { clips, vote } = state;

  const briefSel = Math.min(state.briefSel, D.briefs.length - 1);
  const brief = D.briefs[briefSel];

  const voteBtn = (v: "up" | "down") => ({
    background: vote === v ? "var(--accent-subtle)" : "var(--surface-raised)",
    border: `1px solid ${vote === v ? "var(--accent-border)" : "var(--border-default)"}`,
    color: vote === v ? "var(--accent-text)" : "var(--text-secondary)",
  });

  return (
    <div data-screen-label="S4 Briefings" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ ...displayType, fontSize: 20, fontWeight: 600 }}>Briefings</span>
        <span style={monoMeta}>daily 06:00 + 16:00 mini-brief · {D.tz}</span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => set((s) => ({ clips: !s.clips }))}
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: 26,
              padding: "0 10px",
              borderRadius: 999,
              border: `1px solid ${clips ? "var(--accent-border)" : "var(--border-default)"}`,
              background: clips ? "var(--accent-subtle)" : "var(--surface-panel)",
              color: clips ? "var(--accent-text)" : "var(--text-secondary)",
              fontFamily: "var(--font-ui)",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Clips format
          </button>
          {canManage && (
            <button
              onClick={() => notify("Weekly report queued — Jun 26 – Jul 2 PDF renders from the same data as briefings")}
              style={{
                height: 30,
                padding: "0 12px",
                borderRadius: 8,
                border: "1px solid var(--border-default)",
                background: "var(--surface-raised)",
                fontFamily: "var(--font-ui)",
                fontSize: 12,
                fontWeight: 500,
                color: "var(--text-primary)",
                cursor: "pointer",
              }}
            >
              ↓ Weekly PDF report
            </button>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 12, alignItems: "start" }}>
        {/* Archive rail */}
        <div style={{ ...cardSurface, overflow: "hidden" }}>
          {D.briefs.map((b, i) => {
            const on = i === briefSel;
            return (
              <div
                key={b.date}
                onClick={() => set({ briefSel: i })}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                  padding: "11px 14px",
                  borderBottom: "1px solid var(--border-subtle)",
                  borderLeft: `2px solid ${on ? "var(--accent)" : "transparent"}`,
                  background: on ? "var(--accent-subtle)" : "transparent",
                  cursor: "pointer",
                }}
              >
                <span style={{ fontSize: 12.5, fontWeight: on ? 600 : 500 }}>{b.date}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-tertiary)" }}>{b.metaLine}</span>
              </div>
            );
          })}
        </div>

        {/* Rendered briefing */}
        <div style={{ ...cardSurface, padding: "28px 32px", display: "flex", flexDirection: "column", gap: 20, maxWidth: 760 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              borderBottom: "1px solid var(--border-subtle)",
              paddingBottom: 16,
            }}
          >
            <span style={{ ...displayType, fontSize: 18, fontWeight: 700 }}>{brief.title}</span>
            <span style={monoMeta}>{brief.sent}</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={overline}>Overnight in one paragraph</span>
            <span style={{ fontFamily: "var(--font-serif)", fontSize: 15, lineHeight: 1.65 }}>
              {brief.overnight} <em style={{ color: "var(--text-secondary)" }}>{brief.overnightEm}</em>
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={overline}>Media</span>
              <span style={{ fontFamily: "var(--font-serif)", fontSize: 13.5, lineHeight: 1.6, color: "var(--text-secondary)" }}>
                {brief.media}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={overline}>Social</span>
              <span style={{ fontFamily: "var(--font-serif)", fontSize: 13.5, lineHeight: 1.6, color: "var(--text-secondary)" }}>
                {brief.social}
              </span>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              padding: "14px 16px",
              borderRadius: 10,
              background: "var(--accent-subtle)",
              border: "1px solid var(--accent-border)",
            }}
          >
            <span style={{ ...overline, color: "var(--accent-text)" }}>Where media and social diverge</span>
            <span style={{ fontFamily: "var(--font-serif)", fontSize: 13.5, lineHeight: 1.6 }}>{brief.diverge}</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={overline}>Sentiment and momentum</span>
            <div style={{ display: "flex", gap: 24, fontFamily: "var(--font-mono)", fontSize: 12.5, flexWrap: "wrap" }}>
              {brief.momentum.map((mo) => (
                <span key={mo.k}>
                  {mo.k} <b>{mo.v}</b> <span style={{ color: mo.dc }}>{mo.d}</span>
                </span>
              ))}
            </div>
          </div>

          {brief.musts.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <span style={overline}>Must address today</span>
              {brief.musts.map((mu, i) => (
                <MustCallout key={i} index={i + 1} issue={mu.issue} whyNow={mu.why} suggestedLine={mu.line} />
              ))}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={overline}>Watchlist</span>
            <span style={{ fontFamily: "var(--font-serif)", fontSize: 13.5, lineHeight: 1.6, color: "var(--text-secondary)" }}>
              {brief.watchlist}
            </span>
          </div>

          {canManage && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                borderTop: "1px solid var(--border-subtle)",
                paddingTop: 16,
              }}
            >
              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Was this briefing accurate and useful?</span>
              <button
                onClick={() => set({ vote: "up" })}
                style={{
                  height: 28,
                  padding: "0 12px",
                  borderRadius: 8,
                  fontFamily: "var(--font-ui)",
                  fontSize: 12,
                  cursor: "pointer",
                  ...voteBtn("up"),
                }}
              >
                👍 Yes
              </button>
              <button
                onClick={() => set({ vote: "down" })}
                style={{
                  height: 28,
                  padding: "0 12px",
                  borderRadius: 8,
                  fontFamily: "var(--font-ui)",
                  fontSize: 12,
                  cursor: "pointer",
                  ...voteBtn("down"),
                }}
              >
                👎 Needs work
              </button>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-tertiary)", marginLeft: "auto" }}>
                feedback tunes prompt v13
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
