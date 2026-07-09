"use client";

/**
 * S12 Narrative — /[campaign]/narrative
 * Live narrative control + the message-box (Leesburg) 2×2 grid, computed from
 * enriched mentions by useLiveNarrative. The grid is driven by stance
 * classification alone, so it is live whenever mentions carry a message-box
 * quadrant — even without a message-platform document. Narrative themes need
 * platform pillars to classify coverage; without them the themes panel shows an
 * honest note while the message box stays live.
 *
 * Screen states:
 *  - No enriched mentions with a stance quadrant → a single empty state.
 *  - Live grid + control meter always render once ≥ 1 quadrant exists.
 *  - Themes list when pillars have classified coverage; else the honest note.
 *
 * Design: mono data values, sentence case, red reserved for negative sentiment
 * (the opposition/"them" side is a neutral gray, never red), heat ramp is
 * intensity only.
 */

import React from "react";
import { useParams } from "next/navigation";
import { useLiveNarrative, type Quadrant } from "@/lib/data/liveNarrative";
import { useLiveCampaign } from "@/lib/data/liveCampaigns";
import type { CampaignType } from "@/lib/campaignType";
import { EmptyState } from "@/components/app/EmptyState";
import {
  cardSurface,
  displayType,
  heatTone,
  monoMeta,
  overline,
  sentTone,
  signed,
} from "@/lib/ui";

/** Quadrant labels, ordered us-row then them-row, adapted to the campaign type. */
const QUADRANT_ORDER: Quadrant[] = ["usUs", "usThem", "themUs", "themThem"];

function quadrantLabel(q: Quadrant, type: CampaignType): string {
  if (type === "issue") {
    return {
      usUs: "Campaign on the cause",
      usThem: "Campaign on the opposition",
      themUs: "Opposition on the campaign",
      themThem: "Opposition on itself",
    }[q];
  }
  return {
    usUs: "We talk about us",
    usThem: "We talk about them",
    themUs: "They talk about us",
    themThem: "They talk about them",
  }[q];
}

/** Compact reach ("1.2k", "3.4m"), mirroring the app's mono metric voice. */
function compactReach(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}

/** A sentiment pill, or a muted "—" when the quadrant/theme has no scores. */
function SentChip({ v }: { v: number | null }) {
  if (v == null) {
    return (
      <span style={{ ...monoMeta, fontSize: 12, color: "var(--text-tertiary)" }}>—</span>
    );
  }
  const t = sentTone(v);
  return (
    <span
      style={{
        flex: "none",
        fontFamily: "var(--font-mono)",
        fontSize: 12,
        fontWeight: 500,
        padding: "2px 8px",
        borderRadius: 6,
        background: t.bg,
        color: t.fg,
      }}
    >
      {signed(v)}
    </span>
  );
}

export default function NarrativePage() {
  const { campaign } = useParams<{ campaign: string }>();
  const nar = useLiveNarrative(campaign);
  // campaign_type only relabels the quadrants; defaults to 'candidate' and is
  // robust to the 0005 migration not being applied (see useLiveCampaign).
  const { campaign_type } = useLiveCampaign(campaign);

  const header = (
    <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
      <span style={{ ...displayType, fontSize: 20, fontWeight: 600 }}>Narrative</span>
      {nar.live && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={overline}>live</span>
          <span style={monoMeta}>{nar.mentionCount} classified</span>
        </span>
      )}
    </div>
  );

  // No enriched mention carries a stance quadrant yet → a single empty state.
  if (!nar.live) {
    return (
      <div data-screen-label="S12 Narrative" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {header}
        <div style={{ ...cardSurface }}>
          <EmptyState
            title="No narrative data yet"
            note="The message box fills in as mentions are enriched with stance classification."
          />
        </div>
      </div>
    );
  }

  const { control } = nar;
  const usLeads = control.usShare >= control.themShare;
  const controlRead = usLeads
    ? `Our side is setting the terms — ${control.usShare}% of stance-classified volume is framed by the campaign.`
    : `The opposition is driving — ${control.themShare}% of stance-classified volume is framed by the other side.`;

  return (
    <div data-screen-label="S12 Narrative" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {header}

      {/* Control meter — speaker-side share of stance volume */}
      <div style={{ ...cardSurface, padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>Narrative control</span>
          <span style={monoMeta}>who is driving · last 14 days</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", ...monoMeta }}>
            <span style={{ color: "var(--accent-text)" }}>us-framed {control.usShare}%</span>
            <span>them-framed {control.themShare}%</span>
          </div>
          <div style={{ display: "flex", height: 12, borderRadius: 999, overflow: "hidden", gap: 2 }}>
            <span style={{ width: `${control.usShare}%`, background: "var(--chart-us)" }} />
            <span style={{ flex: 1, background: "var(--chart-them)" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", ...monoMeta }}>
            <span>{control.usCount} mentions</span>
            <span>{control.themCount} mentions</span>
          </div>
        </div>
        <span style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.55 }}>
          {controlRead}
        </span>
      </div>

      {/* Message box — the 2×2 stance grid */}
      <div style={{ ...cardSurface, padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>Message box</span>
          <span style={monoMeta}>{nar.mentionCount} stance-classified mentions</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {QUADRANT_ORDER.map((q) => {
            const cell = nar.quadrants[q];
            const hh = heatTone(cell.heat);
            return (
              <div
                key={q}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "14px 16px",
                  borderRadius: 10,
                  border: "1px solid var(--border-subtle)",
                  background: "var(--surface-sunken)",
                }}
              >
                <span
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 8,
                    flex: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: hh.bg,
                    color: hh.fg,
                    fontFamily: "var(--font-mono)",
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                  title="volume (heat = intensity)"
                >
                  {cell.count}
                </span>
                <span style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0, flex: 1 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>
                    {quadrantLabel(q, campaign_type)}
                  </span>
                  <span style={monoMeta}>{cell.share}% of stance volume</span>
                </span>
                <SentChip v={cell.avgSentiment} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Narrative themes — or the honest "needs a platform" note */}
      <div style={{ ...cardSurface, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", padding: "14px 16px", borderBottom: "1px solid var(--border-subtle)" }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>Narrative themes</span>
          {nar.hasThemes && (
            <span style={{ ...monoMeta, marginLeft: 12 }}>{nar.themes.length} themes · by volume</span>
          )}
        </div>
        {!nar.hasThemes ? (
          <div style={{ padding: "16px 18px" }}>
            <span style={{ fontSize: 12.5, color: "var(--text-tertiary)", lineHeight: 1.6 }}>
              Narrative themes need a message platform — set the campaign&apos;s pillars to classify
              coverage into themes. The message box below works from stance classification and is live.
            </span>
          </div>
        ) : (
          nar.themes.map((t) => (
            <div
              key={t.theme}
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
                  {t.theme}
                </span>
                <span style={monoMeta}>
                  {t.count} mentions · {t.share}% · reach {compactReach(t.reach)}
                </span>
              </span>
              <SentChip v={t.avgSentiment} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
