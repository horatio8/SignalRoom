"use client";

/**
 * S4 Briefings — /[campaign]/briefings
 * The daily morning briefing archive and rendered report. Live-wired to the
 * `briefings` table via useLiveBriefings (RLS-scoped read + up/down feedback).
 * Signed out / demo mode / no rows yet → an honest EmptyState.
 *
 * Layout: a date list (left) selects a briefing; the panel (right) renders its
 * markdown body in serif prose, a mono stats line, and up/down feedback.
 */

import React from "react";
import { useParams } from "next/navigation";
import { useApp } from "@/lib/state";
import {
  useLiveBriefings,
  type BriefingStats,
  type LiveBriefing,
} from "@/lib/data/liveBriefings";
import { EmptyState } from "@/components/app/EmptyState";
import { cardSurface, displayType, monoMeta, overline, signed } from "@/lib/ui";

/** Format an ISO date (yyyy-mm-dd) as "Wed 2 Jul". */
function fmtDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()];
  const mon = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ][d.getUTCMonth()];
  return `${day} ${d.getUTCDate()} ${mon}`;
}

/** Build a compact mono stats line from the briefing's stats jsonb. */
function statsLine(stats: BriefingStats | null): string {
  if (!stats) return "no stats recorded";
  const parts: string[] = [];
  if (typeof stats.volume === "number") {
    const delta =
      typeof stats.volumeDelta === "number"
        ? ` (${signed(stats.volumeDelta)})`
        : "";
    parts.push(`vol ${stats.volume}${delta}`);
  }
  if (typeof stats.sentiment === "number") {
    const delta =
      typeof stats.sentimentDelta === "number"
        ? ` (${signed(stats.sentimentDelta)})`
        : "";
    parts.push(`sent ${signed(stats.sentiment)}${delta}`);
  }
  if (typeof stats.clusterCount === "number") parts.push(`${stats.clusterCount} clusters`);
  if (typeof stats.alertCount === "number") parts.push(`${stats.alertCount} alerts`);
  if (stats.topPlatforms && stats.topPlatforms.length) {
    parts.push(stats.topPlatforms.map((p) => `${p.platform} ${p.count}`).join(" · "));
  }
  return parts.length ? parts.join("  ·  ") : "no stats recorded";
}

/** Render inline **bold** spans within a line; everything else is plain text. */
function inline(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  parts.forEach((p, i) => {
    if (p.startsWith("**") && p.endsWith("**") && p.length > 4) {
      out.push(
        <strong key={`${keyBase}-b${i}`} style={{ fontWeight: 600 }}>
          {p.slice(2, -2)}
        </strong>
      );
    } else if (p) {
      out.push(<React.Fragment key={`${keyBase}-t${i}`}>{p}</React.Fragment>);
    }
  });
  return out;
}

/**
 * Lightweight markdown → elements. Handles `#`/`##`/`###` headings, `-`/`*`
 * bullet lists, and paragraphs (blank-line separated). No heavy dependency —
 * the briefing body is short, controlled prose.
 */
function renderMarkdown(md: string): React.ReactNode[] {
  const blocks: React.ReactNode[] = [];
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  let para: string[] = [];
  let list: string[] = [];
  let key = 0;

  const flushPara = () => {
    if (!para.length) return;
    const text = para.join(" ").trim();
    para = [];
    if (!text) return;
    blocks.push(
      <p
        key={`p${key++}`}
        style={{
          margin: 0,
          fontFamily: "var(--font-serif)",
          fontSize: 14,
          lineHeight: "var(--leading-prose, 1.65)",
          color: "var(--text-primary)",
        }}
      >
        {inline(text, `p${key}`)}
      </p>
    );
  };

  const flushList = () => {
    if (!list.length) return;
    const items = list;
    list = [];
    blocks.push(
      <ul
        key={`u${key++}`}
        style={{
          margin: 0,
          paddingLeft: 20,
          display: "flex",
          flexDirection: "column",
          gap: 5,
          fontFamily: "var(--font-serif)",
          fontSize: 14,
          lineHeight: 1.5,
          color: "var(--text-primary)",
        }}
      >
        {items.map((it, i) => (
          <li key={`li${key}-${i}`}>{inline(it, `li${key}-${i}`)}</li>
        ))}
      </ul>
    );
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);

    if (heading) {
      flushPara();
      flushList();
      const level = heading[1].length;
      blocks.push(
        <div
          key={`h${key++}`}
          style={{
            ...displayType,
            fontSize: level === 1 ? 16 : 13.5,
            fontWeight: 600,
            color: "var(--text-secondary)",
            marginTop: blocks.length ? 6 : 0,
          }}
        >
          {heading[2]}
        </div>
      );
    } else if (bullet) {
      flushPara();
      list.push(bullet[1]);
    } else if (line.trim() === "") {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return blocks;
}

export default function BriefingsPage() {
  const { campaign } = useParams<{ campaign: string }>();
  const { notify } = useApp();
  const { live, briefings, vote } = useLiveBriefings(campaign);

  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  // Default the selection to the newest briefing once rows arrive, and keep it
  // valid if the selected briefing scrolls out of the window.
  React.useEffect(() => {
    if (!briefings.length) {
      if (selectedId !== null) setSelectedId(null);
      return;
    }
    if (!selectedId || !briefings.some((b) => b.id === selectedId)) {
      setSelectedId(briefings[0].id);
    }
  }, [briefings, selectedId]);

  const selected: LiveBriefing | null =
    briefings.find((b) => b.id === selectedId) ?? null;

  const onVote = async (v: "up" | "down") => {
    if (!selected) return;
    const err = await vote(selected.id, v);
    if (err) return notify(err);
    notify(v === "up" ? "Thanks — briefing marked useful" : "Thanks — feedback noted");
  };

  const header = (
    <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
      <span style={{ ...displayType, fontSize: 20, fontWeight: 600 }}>Briefings</span>
      <span style={monoMeta}>morning digest · one read per day</span>
    </div>
  );

  if (!live || !briefings.length) {
    return (
      <div data-screen-label="S4 Briefings" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {header}
        <div style={{ ...cardSurface }}>
          <EmptyState
            title="No briefings yet"
            note="The morning briefing digests each day's coverage. It generates on schedule, or on demand."
          />
        </div>
      </div>
    );
  }

  return (
    <div data-screen-label="S4 Briefings" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {header}

      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 12, alignItems: "start" }}>
        {/* Left: date list */}
        <div style={{ ...cardSurface, overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border-subtle)" }}>
            <span style={overline}>Archive</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {briefings.map((b) => {
              const on = b.id === selectedId;
              return (
                <button
                  key={b.id}
                  onClick={() => setSelectedId(b.id)}
                  style={{
                    textAlign: "left",
                    padding: "10px 14px",
                    border: "none",
                    borderBottom: "1px solid var(--border-subtle)",
                    background: on ? "var(--accent-subtle)" : "transparent",
                    color: on ? "var(--accent-text)" : "var(--text-secondary)",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: on ? 600 : 500 }}>
                    {fmtDate(b.briefing_date)}
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-tertiary)" }}>
                    {b.kind}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: selected briefing */}
        <div style={{ ...cardSurface, overflow: "hidden" }}>
          {selected && (
            <>
              <div
                style={{
                  padding: "12px 18px",
                  borderBottom: "1px solid var(--border-subtle)",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <span style={{ ...displayType, fontSize: 15, fontWeight: 600 }}>
                  {fmtDate(selected.briefing_date)} briefing
                </span>
                <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-tertiary)" }}>
                  {selected.model ?? "—"} · {selected.prompt_version ?? "—"}
                </span>
              </div>

              <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
                {renderMarkdown(selected.content_md)}
              </div>

              <div
                style={{
                  padding: "10px 18px",
                  borderTop: "1px solid var(--border-subtle)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--text-tertiary)",
                  overflowX: "auto",
                  whiteSpace: "nowrap",
                }}
              >
                {statsLine(selected.stats)}
              </div>

              <div
                style={{
                  padding: "10px 18px",
                  borderTop: "1px solid var(--border-subtle)",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span style={overline}>Was this useful?</span>
                <button
                  onClick={() => void onVote("up")}
                  style={feedbackBtn}
                  aria-label="Mark briefing useful"
                >
                  Useful
                </button>
                <button
                  onClick={() => void onVote("down")}
                  style={feedbackBtn}
                  aria-label="Mark briefing not useful"
                >
                  Not useful
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const feedbackBtn: React.CSSProperties = {
  padding: "5px 12px",
  borderRadius: 8,
  border: "1px solid var(--border-default)",
  background: "var(--surface-panel)",
  color: "var(--text-secondary)",
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
};
