"use client";

/**
 * S2 Feed — /[campaign]/feed
 * Filter chips (media-type ∧ keyword segments, M1) · mention rows with hover
 * Hide (M2 suppress) · "+ Add missed article" (M2 manual add) · honest-limits footer.
 */

import React from "react";
import { useParams } from "next/navigation";
import { useApp } from "@/lib/state";
import { useLiveMentions } from "@/lib/data/live";
import { EmptyState } from "@/components/app/EmptyState";
import { PlatformChip } from "@/components/app/PlatformChip";
import { chipTone, displayType, monoMeta, overline, sentTone, signed } from "@/lib/ui";
import { cardSurface } from "@/lib/ui";

export default function FeedPage() {
  const { campaign } = useParams<{ campaign: string }>();
  const { state, set, notify } = useApp();
  const canManage = state.role !== "client";
  const { feedTab, seg, hiddenIds } = state;

  // Live rows (RLS-scoped) are the only source now; manual adds sit on top.
  const liveData = useLiveMentions(campaign);
  const allRows = [...state.addedMentions, ...liveData.mentions];

  // Media-type tabs + segment chips derive from the live rows themselves:
  // counts are real, and segments come straight from enrichment topics[].
  const feedTabs = [
    { id: "all", label: "All", count: String(allRows.length) },
    { id: "news", label: "Media", count: String(allRows.filter((m) => m.media === "news").length) },
    { id: "social", label: "Social", count: String(allRows.filter((m) => m.media === "social").length) },
  ];
  const segTopics = Array.from(new Set(allRows.flatMap((m) => m.segs))).sort();
  const segs = [{ id: "all", label: "All" }, ...segTopics.map((t) => ({ id: t, label: t }))];

  // "all" (the default + campaign reset) shows every row; picking a specific
  // media type or segment filters as designed.
  const rows = allRows.filter(
    (m) => (feedTab === "all" || m.media === feedTab) && (seg === "all" || m.segs.includes(seg))
  );

  const addMention = () => {
    const url = state.urlInput.trim();
    if (!url) return;
    let host = "article";
    try {
      host = new URL(url.startsWith("http") ? url : "https://" + url).hostname.replace("www.", "");
    } catch {
      host = url.slice(0, 40);
    }
    set((s) => ({
      addedMentions: [
        {
          id: Date.now(),
          pf: "WEB",
          media: "news" as const,
          segs: ["candidate"],
          title: host + " — added manually",
          body: "Queued for enrichment — relevance, sentiment, entities land on the next worker pass (≤ 5 min).",
          meta: "manual add · pending enrichment",
          time: "just now",
          sentV: 0,
          url: url.startsWith("http") ? url : "https://" + url,
        },
        ...s.addedMentions,
      ],
      urlInput: "",
      addOpen: false,
    }));
    notify("Article added — running through normal enrichment");
  };

  return (
    <div data-screen-label="S2 Feed" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ ...displayType, fontSize: 20, fontWeight: 600 }}>Mention feed</span>
        <span style={monoMeta}>relevance ≥ 30 gate on</span>
        {liveData.live && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={overline}>live</span>
            <span style={monoMeta}>{liveData.mentions.length} mentions</span>
          </span>
        )}
        {canManage && (
          <button
            onClick={() => set((s) => ({ addOpen: !s.addOpen }))}
            style={{
              marginLeft: "auto",
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
            + Add missed article
          </button>
        )}
      </div>

      {state.addOpen && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 14px",
            borderRadius: 12,
            background: "var(--accent-subtle)",
            border: "1px solid var(--accent-border)",
          }}
        >
          <input
            value={state.urlInput}
            onChange={(e) => set({ urlInput: e.target.value })}
            placeholder="https:// — paste a URL we missed"
            style={{
              flex: 1,
              minWidth: 0,
              height: 32,
              padding: "0 12px",
              borderRadius: 10,
              background: "var(--surface-panel)",
              border: "1px solid var(--border-default)",
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              color: "var(--text-primary)",
              outline: "none",
            }}
          />
          <button
            onClick={addMention}
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
            Add to campaign
          </button>
          <span style={{ fontSize: 11.5, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
            Runs through normal enrichment
          </span>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {feedTabs.map((t) => {
          const c = chipTone(feedTab === t.id);
          return (
            <button
              key={t.id}
              onClick={() => set({ feedTab: t.id })}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                height: 26,
                padding: "0 10px",
                borderRadius: 999,
                border: `1px solid ${c.border}`,
                background: c.bg,
                color: c.color,
                fontFamily: "var(--font-ui)",
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              {t.label} <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, opacity: 0.75 }}>{t.count}</span>
            </button>
          );
        })}
        <span style={{ width: 1, height: 16, background: "var(--border-default)", margin: "0 4px" }} />
        <span style={overline}>Segments</span>
        {segs.map((g) => {
          const c = chipTone(seg === g.id);
          return (
            <button
              key={g.id}
              onClick={() => set({ seg: g.id })}
              style={{
                display: "inline-flex",
                alignItems: "center",
                height: 26,
                padding: "0 10px",
                borderRadius: 999,
                border: `1px solid ${c.border}`,
                background: c.bg,
                color: c.color,
                fontFamily: "var(--font-ui)",
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              {g.label}
            </button>
          );
        })}
      </div>

      <div style={{ ...cardSurface, overflow: "hidden" }}>
        {allRows.length === 0 ? (
          <EmptyState
            title="No mentions yet"
            note="Ingest runs hourly. Mentions appear here once a sweep captures a match."
          />
        ) : (
          <>
        {rows.map((m) => {
          const hidden = hiddenIds.includes(m.id);
          const ss = sentTone(m.sentV);
          return (
            <div
              key={m.id}
              style={{
                display: "flex",
                gap: 12,
                padding: "12px 16px",
                borderBottom: "1px solid var(--border-subtle)",
                opacity: hidden ? 0.4 : 1,
              }}
            >
              <PlatformChip pf={m.pf} style={{ marginTop: 1 }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  {m.url ? (
                    <a
                      href={m.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={m.url}
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        color: "inherit",
                        textDecoration: "none",
                      }}
                    >
                      {m.title}
                    </a>
                  ) : (
                    <span style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {m.title}
                    </span>
                  )}
                  <span style={{ ...monoMeta, flex: "none", marginLeft: "auto" }}>{m.time}</span>
                </div>
                <span style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.45 }}>{m.body}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={monoMeta}>{m.meta}</span>
                  {m.url && (
                    <a
                      href={m.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        color: "var(--accent-text)",
                        textDecoration: "none",
                      }}
                    >
                      source ↗
                    </a>
                  )}
                  <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 12,
                        fontWeight: 500,
                        padding: "2px 8px",
                        borderRadius: 6,
                        background: ss.bg,
                        color: ss.fg,
                      }}
                    >
                      {signed(m.sentV)}
                    </span>
                    {canManage && (
                      <button
                        onClick={() =>
                          set((s) => ({
                            hiddenIds: hidden ? s.hiddenIds.filter((i) => i !== m.id) : [...s.hiddenIds, m.id],
                          }))
                        }
                        style={{
                          border: "none",
                          background: "transparent",
                          cursor: "pointer",
                          fontFamily: "var(--font-ui)",
                          fontSize: 11,
                          color: "var(--text-tertiary)",
                          textDecoration: "underline",
                          padding: 0,
                        }}
                      >
                        {hidden ? "Restore" : "Hide"}
                      </button>
                    )}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
        <div style={{ display: "flex", justifyContent: "center", padding: 12, ...monoMeta }}>
          — syndicated copies collapsed · 24-month hot retention —
        </div>
          </>
        )}
      </div>
    </div>
  );
}
