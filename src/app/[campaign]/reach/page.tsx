"use client";

/**
 * S11 Organic Reach — /[campaign]/reach (operator+)
 * Productizes the Organic Reach Finder runbook: groups list (relevance dots,
 * political-rules, join-status cycle), discovery run (3-stage simulation),
 * join queue vs 10–20/day cap, chatter monitoring (per-group toggle, summary
 * strip, notable chatter), share kit, ground rules.
 */

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { useApp, type CampaignId } from "@/lib/state";
import { dataFor, type ReachGroup } from "@/lib/data";
import { PlatformChip } from "@/components/app/PlatformChip";
import { cardSurface, chipTone, displayType, monoMeta, overline, relDots, signed } from "@/lib/ui";

const POL_STYLE = {
  yes: { bg: "var(--pos-subtle)", fg: "var(--pos-text)", label: "political ok" },
  no: { bg: "var(--neg-subtle)", fg: "var(--neg-text)", label: "no political" },
  check: { bg: "var(--warn-subtle)", fg: "var(--warn-text)", label: "check rules" },
} as const;

const ST_STYLE = {
  none: { label: "Request to join", bg: "var(--surface-raised)", fg: "var(--text-primary)", border: "var(--border-default)", cursor: "pointer" },
  requested: { label: "Requested…", bg: "var(--accent-subtle)", fg: "var(--accent-text)", border: "var(--accent-border)", cursor: "default" },
  joined: { label: "✓ Joined", bg: "var(--pos-subtle)", fg: "var(--pos-text)", border: "transparent", cursor: "default" },
  rejected: { label: "Do not post", bg: "var(--neg-subtle)", fg: "var(--neg-text)", border: "transparent", cursor: "default" },
} as const;

function sentToneChip(sent: number) {
  return sent > 10
    ? { bg: "var(--pos-subtle)", fg: "var(--pos-text)" }
    : sent < -10
      ? { bg: "var(--neg-subtle)", fg: "var(--neg-text)" }
      : { bg: "var(--warn-subtle)", fg: "var(--warn-text)" };
}

export default function ReachPage() {
  const { campaign } = useParams<{ campaign: CampaignId }>();
  const router = useRouter();
  const { state, set, notify } = useApp();
  const D = dataFor(campaign);
  const R = D.reach;
  const { reachPf, reachPol, joinMap, joinsToday, discovery, discoveryStatus, discoveredGroups, monitorMap, sharedMap } = state;

  const all: ReachGroup[] = [...R.groups, ...discoveredGroups];
  const status = (g: ReachGroup) => joinMap[g.id] ?? g.status;
  const isMonitored = (g: ReachGroup) => {
    if (status(g) !== "joined") return false;
    return monitorMap[g.id] !== undefined ? monitorMap[g.id] : !!R.chatter[g.id];
  };

  const monitored = all.filter((g) => isMonitored(g) && R.chatter[g.id]);
  const chatVol = monitored.reduce((n, g) => n + R.chatter[g.id].vol, 0);
  const chatSent = monitored.length
    ? Math.round(monitored.reduce((n, g) => n + R.chatter[g.id].sent, 0) / monitored.length)
    : 0;
  const chatChip = sentToneChip(chatSent);

  const filtered = all
    .filter((g) => (reachPf === "all" || g.pf === reachPf) && (reachPol === "all" || g.pol === reachPol))
    .sort((a, b) => b.rel - a.rel);

  const count = (pf: string) => all.filter((g) => pf === "all" || g.pf === pf).length;
  const pfChips = [
    { id: "all", label: "All" },
    { id: "FB", label: "Facebook" },
    { id: "X", label: "X" },
    { id: "RD", label: "Reddit" },
    { id: "DIS", label: "Discord" },
  ];
  const polChips = [
    { id: "all", label: "Any rules" },
    { id: "yes", label: "Political ok" },
    { id: "check", label: "Check rules" },
  ];

  const joinQueue = all
    .filter((g) => status(g) === "none" && g.pol !== "no")
    .sort((a, b) => b.rel - a.rel)
    .slice(0, 4);

  const total = R.base + discoveredGroups.length;

  const requestJoin = (g: ReachGroup) => {
    if (status(g) !== "none") return;
    set((s) => ({ joinMap: { ...s.joinMap, [g.id]: "requested" as const }, joinsToday: s.joinsToday + 1 }));
    notify(
      `Join requested — ${joinsToday + 1} of 20 under today's cap. Read the rules on accept; set "allows political" accordingly.`
    );
  };

  const toggleMonitor = (g: ReachGroup) => {
    if (status(g) !== "joined") return;
    const next = !isMonitored(g);
    set((s) => ({ monitorMap: { ...s.monitorMap, [g.id]: next } }));
    notify(
      next
        ? `Monitoring ${g.name} — member-visible chatter joins the enrichment pipeline`
        : `Monitoring paused for ${g.name}`
    );
  };

  const shareKit = (g: ReachGroup) => {
    if (sharedMap[g.id]) return;
    set((s) => ({ sharedMap: { ...s.sharedMap, [g.id]: true } }));
    notify(`Share kit queued for ${g.name} — wording varied, send staggered. Sentiment watch arms on post.`);
  };

  const runDiscovery = () => {
    if (discovery === "running") return;
    set({ discovery: "running", discoveryStatus: "building query matrix — 4 issues × 6 community types × geo…" });
    setTimeout(() => set({ discoveryStatus: "28 queries via Google index · 391 raw results · resolving group ids…" }), 900);
    setTimeout(() => set({ discoveryStatus: `deduping against base · ${R.newGroups.length} new groups score ≥ 2…` }), 1800);
    setTimeout(() => {
      set({
        discovery: "done",
        discoveredGroups: R.newGroups.map((g) => ({ ...g, isNew: true })),
      });
      notify(`Discovery loaded ${R.newGroups.length} new groups into the base — dedupe absorbed the rest`);
    }, 2600);
  };

  return (
    <div data-screen-label="S11 Organic Reach" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ ...displayType, fontSize: 20, fontWeight: 600 }}>Organic reach</span>
        <span style={monoMeta}>
          {R.geo} · last discovery run {R.lastRun} · Airtable-synced
        </span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, minWidth: 220 }}>
          <span style={{ position: "relative", flex: 1, height: 6, borderRadius: 999, background: "var(--surface-sunken)", overflow: "hidden" }}>
            <span
              style={{
                position: "absolute",
                inset: "0 auto 0 0",
                width: `${Math.round((total / R.target) * 100)}%`,
                borderRadius: 999,
                background: "var(--accent)",
              }}
            />
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--text-secondary)", flex: "none" }}>
            {total} / {R.target}
          </span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.8fr 1fr", gap: 12, alignItems: "start" }}>
        {/* Left: chatter strip + filters + group list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ ...cardSurface, display: "flex", alignItems: "center", gap: 14, padding: "12px 16px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={overline}>Monitored</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 500 }}>{monitored.length} groups</span>
            </div>
            <span style={{ width: 1, alignSelf: "stretch", background: "var(--border-subtle)" }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={overline}>Chatter · 24h</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 500 }}>{chatVol} posts</span>
            </div>
            <span style={{ width: 1, alignSelf: "stretch", background: "var(--border-subtle)" }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={overline}>Chatter sentiment</span>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 13,
                    fontWeight: 500,
                    padding: "1px 8px",
                    borderRadius: 6,
                    background: chatChip.bg,
                    color: chatChip.fg,
                  }}
                >
                  {signed(chatSent)}
                </span>
                <span style={monoMeta}>vs {R.publicSent} public</span>
              </span>
            </div>
            <span
              style={{
                flex: 1,
                fontSize: 11.5,
                lineHeight: 1.5,
                color: "var(--text-secondary)",
                borderLeft: "2px solid var(--accent)",
                paddingLeft: 12,
                marginLeft: 6,
              }}
            >
              {R.chatterInsight}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {pfChips.map((c) => {
              const t = chipTone(reachPf === c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => set({ reachPf: c.id })}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    height: 26,
                    padding: "0 10px",
                    borderRadius: 999,
                    border: `1px solid ${t.border}`,
                    background: t.bg,
                    color: t.color,
                    fontFamily: "var(--font-ui)",
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  {c.label} <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, opacity: 0.75 }}>{count(c.id)}</span>
                </button>
              );
            })}
            <span style={{ width: 1, height: 16, background: "var(--border-default)", margin: "0 4px" }} />
            {polChips.map((c) => {
              const t = chipTone(reachPol === c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => set({ reachPol: c.id })}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    height: 26,
                    padding: "0 10px",
                    borderRadius: 999,
                    border: `1px solid ${t.border}`,
                    background: t.bg,
                    color: t.color,
                    fontFamily: "var(--font-ui)",
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  {c.label}
                </button>
              );
            })}
            <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-tertiary)" }}>
              showing {filtered.length} of {total} · sorted by relevance
            </span>
          </div>

          <div style={{ ...cardSurface, overflow: "hidden" }}>
            {filtered.map((g) => {
              const st = status(g);
              const ch = R.chatter[g.id];
              const mon = isMonitored(g);
              const shared = !!sharedMap[g.id];
              const pol = POL_STYLE[g.pol];
              const stS = ST_STYLE[st];
              const chChip = ch ? sentToneChip(ch.sent) : null;
              const canShare = st === "joined" && g.pol === "yes";
              const meta = `${g.members} members · ${g.region} · ${g.cadence}${
                g.last && g.last !== "—" ? " · " + g.last : ""
              }${shared ? " · shared just now" : ""}`;
              return (
                <div
                  key={g.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 16px",
                    borderBottom: "1px solid var(--border-subtle)",
                  }}
                >
                  <PlatformChip pf={g.pf} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0, flex: 1 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {g.name}
                      </span>
                      <span
                        style={{
                          flex: "none",
                          fontSize: 10.5,
                          fontWeight: 500,
                          padding: "2px 8px",
                          borderRadius: 6,
                          background: "var(--surface-raised)",
                          color: "var(--text-secondary)",
                        }}
                      >
                        {g.category}
                      </span>
                      {g.isNew && (
                        <span
                          style={{
                            flex: "none",
                            fontSize: 10,
                            fontWeight: 600,
                            letterSpacing: "0.05em",
                            padding: "2px 7px",
                            borderRadius: 6,
                            background: "var(--accent-subtle)",
                            color: "var(--accent-text)",
                          }}
                        >
                          NEW
                        </span>
                      )}
                    </span>
                    <span style={monoMeta}>{meta}</span>
                  </div>
                  {mon && ch && chChip && (
                    <span
                      title="chatter sentiment · posts/24h"
                      style={{
                        flex: "none",
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        fontWeight: 500,
                        padding: "2px 7px",
                        borderRadius: 6,
                        background: chChip.bg,
                        color: chChip.fg,
                      }}
                    >
                      {signed(ch.sent)} · {ch.vol}/24h
                    </span>
                  )}
                  <span
                    title={`relevance ${g.rel}/5`}
                    style={{ flex: "none", fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: 2, color: "var(--accent-text)" }}
                  >
                    {relDots(g.rel)}
                  </span>
                  <span
                    style={{
                      flex: "none",
                      fontSize: 10.5,
                      fontWeight: 500,
                      padding: "2px 8px",
                      borderRadius: 6,
                      background: pol.bg,
                      color: pol.fg,
                    }}
                  >
                    {pol.label}
                  </span>
                  <span
                    title="monitor chatter (joined groups only)"
                    onClick={() => toggleMonitor(g)}
                    style={{
                      flex: "none",
                      width: 26,
                      height: 15,
                      borderRadius: 999,
                      border: `1px solid ${mon ? "var(--accent)" : "var(--border-strong)"}`,
                      background: mon ? "var(--accent)" : "var(--surface-overlay)",
                      position: "relative",
                      cursor: st === "joined" ? "pointer" : "not-allowed",
                      display: "inline-block",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        top: 1.5,
                        left: mon ? 12 : 2,
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        background: "#fff",
                        transition: "left 120ms cubic-bezier(0.2,0.8,0.2,1)",
                      }}
                    />
                  </span>
                  {canShare ? (
                    <button
                      onClick={() => shareKit(g)}
                      style={{
                        flex: "none",
                        height: 26,
                        padding: "0 10px",
                        borderRadius: 8,
                        border: "none",
                        background: "var(--accent)",
                        color: "#fff",
                        fontFamily: "var(--font-ui)",
                        fontSize: 11,
                        fontWeight: 500,
                        cursor: "pointer",
                      }}
                    >
                      {shared ? "✓ Queued" : "Share"}
                    </button>
                  ) : (
                    <button
                      onClick={() => requestJoin(g)}
                      style={{
                        flex: "none",
                        width: 112,
                        height: 26,
                        borderRadius: 8,
                        border: `1px solid ${stS.border}`,
                        background: stS.bg,
                        color: stS.fg,
                        fontFamily: "var(--font-ui)",
                        fontSize: 11.5,
                        fontWeight: 500,
                        cursor: stS.cursor,
                      }}
                    >
                      {stS.label}
                    </button>
                  )}
                </div>
              );
            })}
            <div style={{ display: "flex", justifyContent: "center", padding: 12, ...monoMeta }}>
              rejected or banned → marked &quot;do not post&quot; · never repost
            </div>
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Run discovery */}
          <div style={{ ...cardSurface, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16, fontWeight: 600 }}>Run discovery</span>
              <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-tertiary)" }}>
                rerun monthly · results accumulate
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={overline}>Query matrix · geography × issue × community type</span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  lineHeight: 1.7,
                  color: "var(--text-secondary)",
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: "var(--surface-sunken)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                {R.query}
              </span>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {R.issues.map((ri) => (
                <span
                  key={ri}
                  style={{
                    height: 24,
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "0 9px",
                    borderRadius: 999,
                    background: "var(--surface-raised)",
                    border: "1px solid var(--border-default)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: "var(--text-secondary)",
                  }}
                >
                  {ri}
                </span>
              ))}
            </div>
            {discovery === "running" && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: "var(--accent-subtle)",
                  border: "1px solid var(--accent-border)",
                }}
              >
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent-text)" }}>{discoveryStatus}</span>
              </div>
            )}
            <button
              onClick={runDiscovery}
              style={{
                height: 32,
                borderRadius: 10,
                border: "none",
                background: discovery === "running" ? "var(--accent-hover)" : "var(--accent)",
                color: "#fff",
                fontFamily: "var(--font-ui)",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {discovery === "running" ? "Running…" : discovery === "done" ? "✓ Loaded — run again" : "Run discovery"}
            </button>
            <span style={{ fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
              Facebook via Google index (Firecrawl) — group homepages only. X Communities logged in-app; Discord via
              disboard tags; Reddit optional (strictest rules).
            </span>
          </div>

          {/* Notable chatter */}
          <div style={{ ...cardSurface, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16, fontWeight: 600 }}>Notable chatter</span>
              <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-tertiary)" }}>
                member-visible · enriched like any mention
              </span>
            </div>
            {R.notable.map((nc, i) => {
              const t = sentToneChip(nc.sentV);
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 5,
                    padding: "10px 12px",
                    borderRadius: 10,
                    background: "var(--surface-raised)",
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  <span style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--text-primary)" }}>“{nc.quote}”</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10.5,
                        color: "var(--text-tertiary)",
                        flex: 1,
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {nc.group} · {nc.time}
                    </span>
                    <span
                      style={{
                        flex: "none",
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        fontWeight: 500,
                        padding: "1px 7px",
                        borderRadius: 6,
                        background: t.bg,
                        color: t.fg,
                      }}
                    >
                      {signed(nc.sentV)}
                    </span>
                  </span>
                </div>
              );
            })}
            <button
              onClick={() => {
                set({ seg: "groups", feedTab: "all" });
                router.push(`/${campaign}/feed`);
              }}
              style={{
                height: 28,
                borderRadius: 8,
                border: "1px solid var(--border-default)",
                background: "var(--surface-raised)",
                fontFamily: "var(--font-ui)",
                fontSize: 11.5,
                fontWeight: 500,
                color: "var(--text-primary)",
                cursor: "pointer",
              }}
            >
              View all group chatter in Feed →
            </button>
          </div>

          {/* Join queue */}
          <div style={{ ...cardSurface, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16, fontWeight: 600 }}>Today&apos;s join queue</span>
              <span
                style={{
                  marginLeft: "auto",
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: joinsToday >= 15 ? "var(--warn-text)" : "var(--text-tertiary)",
                }}
              >
                {joinsToday} / 20 today
              </span>
            </div>
            <span style={{ fontSize: 11.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>
              Sorted by relevance. 10–20 requests/day per profile — more looks spammy and trips Facebook rate limits.
            </span>
            {joinQueue.map((jq) => (
              <div key={jq.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: 2, color: "var(--accent-text)", flex: "none" }}>
                  {relDots(jq.rel)}
                </span>
                <span
                  style={{
                    fontSize: 12.5,
                    fontWeight: 500,
                    flex: 1,
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {jq.name}
                </span>
                <button
                  onClick={() => requestJoin(jq)}
                  style={{
                    flex: "none",
                    height: 24,
                    padding: "0 10px",
                    borderRadius: 8,
                    border: "none",
                    background: "var(--accent)",
                    color: "#fff",
                    fontFamily: "var(--font-ui)",
                    fontSize: 11,
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  Request
                </button>
              </div>
            ))}
          </div>

          {/* Ground rules */}
          <div
            style={{
              borderRadius: 14,
              background: "var(--surface-sunken)",
              border: "1px solid var(--border-subtle)",
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <span style={overline}>Ground rules</span>
            <span style={{ fontSize: 12, lineHeight: 1.65, color: "var(--text-secondary)" }}>
              Only public-facing, authentic accounts — no sock puppets. Post as the campaign or real named
              staff/supporters. Vary wording and stagger timing (copy-paste blasts trip spam detection). Respect group
              rules; one strike → do not post. Local noticeboards convert with locally-framed content, not national
              talking points.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
