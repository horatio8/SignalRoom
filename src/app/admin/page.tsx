"use client";

/**
 * S7 Admin — /admin (owner only)
 * Cross-campaign service usage + cost dashboard, read live from `service_runs`
 * via useServiceUsage(). Owner-only gating is enforced by the shell (nav item
 * roles:["owner"] + the client redirect in AppShell); this screen renders the
 * metrics. Before the first run lands it shows an honest waiting state.
 *
 * Design rules honoured: numbers in mono, sentence case, no emoji. Red (--neg)
 * is reserved for errors/failures; a healthy source dot is --pos, degraded is
 * --warn, idle is --text-tertiary.
 */

import React from "react";
import { AppShell } from "@/components/app/AppShell";
import { useApp } from "@/lib/state";
import { cardSurface, displayType, monoMeta, overline } from "@/lib/ui";
import { SURVEY_TOOLS } from "@/lib/integrations";
import {
  useServiceUsage,
  WIRED_SOURCES,
  formatCompact,
  relTimeAgo,
  type SourceUsage,
  type RecentRun,
} from "@/lib/data/serviceUsage";

/** Wired-source id → true (fast membership test against the catalog). */
const WIRED = new Set<string>(WIRED_SOURCES);

/** Three-level source health. idle = no ingest runs; degraded = a recent error. */
type Health = "healthy" | "degraded" | "idle";
function healthOf(hasIngest: boolean, src: SourceUsage): Health {
  if (!hasIngest) return "idle";
  if (src.lastError) return "degraded";
  return "healthy";
}
const HEALTH_DOT: Record<Health, string> = {
  healthy: "var(--pos)",
  degraded: "var(--warn)",
  idle: "var(--text-tertiary)",
};
const HEALTH_LABEL: Record<Health, string> = {
  healthy: "healthy",
  degraded: "degraded",
  idle: "idle — no runs yet",
};

/** Human label for a run kind in the log list. */
const KIND_LABEL: Record<RecentRun["kind"], string> = {
  ingest: "Ingest",
  enrich: "Enrichment",
  sync_airtable: "Airtable sync",
};

function Dot({ color }: { color: string }) {
  return <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flex: "none" }} />;
}

/** A labelled mono stat (value big, caption small). "—" when the value is unknown. */
function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
      <span style={overline}>{label}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 600, color: tone ?? "var(--text-primary)" }}>
        {value}
      </span>
    </div>
  );
}

export default function AdminPage() {
  const { state } = useApp();
  const usage = useServiceUsage();
  const hasIngest = !!usage.latestByKind.ingest;

  const enrichAgg = usage.todayByKind.enrich;
  const syncAgg = usage.todayByKind.sync_airtable;
  const latestEnrich = usage.latestByKind.enrich;
  const latestSync = usage.latestByKind.sync_airtable;

  return (
    <AppShell screen="admin" campaign={state.campaign}>
      <div data-screen-label="S7 Admin" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ ...displayType, fontSize: 20, fontWeight: 600 }}>Admin</span>
          <span style={monoMeta}>service usage · all campaigns</span>
        </div>

        {!usage.live && (
          // Non-blocking note only — the wired services are static knowledge and
          // always render below (idle status) so the operator sees them pre-run.
          <span style={{ fontSize: 12, lineHeight: 1.6, color: "var(--text-tertiary)" }}>
            No runs recorded yet — usage appears after the next ingest, enrichment, or sync.
          </span>
        )}
        {
          <>
            {/* ============ SEARCH SERVICES ============ */}
            <div style={{ ...cardSurface, overflow: "hidden" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "14px 16px",
                  borderBottom: "1px solid var(--border-subtle)",
                }}
              >
                <span style={{ fontSize: 16, fontWeight: 600 }}>Search services</span>
                <span style={{ ...monoMeta, marginLeft: "auto" }}>
                  ingest {relTimeAgo(usage.latestByKind.ingest?.created_at)}
                </span>
              </div>

              {SURVEY_TOOLS.map((tool) => {
                const wired = WIRED.has(tool.id);
                if (!wired) {
                  // Not-wired catalog services: dimmed, labelled — no live signal to show.
                  return (
                    <div
                      key={tool.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "12px 16px",
                        borderBottom: "1px solid var(--border-subtle)",
                        opacity: 0.45,
                      }}
                    >
                      <Dot color="var(--text-tertiary)" />
                      <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{tool.name}</span>
                        <span style={{ ...monoMeta, fontSize: 10.5 }}>{tool.desc}</span>
                      </div>
                      <span style={{ ...monoMeta, flex: "none" }}>not wired</span>
                    </div>
                  );
                }

                const src = usage.perSource[tool.id as (typeof WIRED_SOURCES)[number]];
                const health = healthOf(hasIngest, src);
                return (
                  <div
                    key={tool.id}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      padding: "12px 16px",
                      borderBottom: "1px solid var(--border-subtle)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <Dot color={HEALTH_DOT[health]} />
                      <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 600 }}>{tool.name}</span>
                          <span style={{ ...monoMeta, fontSize: 10 }}>{HEALTH_LABEL[health]}</span>
                        </div>
                        <span style={{ ...monoMeta, fontSize: 10.5 }}>{tool.desc}</span>
                      </div>
                      <div style={{ display: "flex", gap: 20, flex: "none" }}>
                        {/* Pre-run: "—" rather than a misleading 0 across the board. */}
                        <Stat label="Requests today" value={hasIngest ? formatCompact(src.requestsToday) : "—"} />
                        <Stat label="Rows today" value={src.rowsToday == null ? "—" : formatCompact(src.rowsToday)} />
                        <Stat
                          label="Credits left"
                          value={src.creditsRemaining == null ? "—" : formatCompact(src.creditsRemaining)}
                        />
                        <Stat label="Last run" value={relTimeAgo(usage.latestByKind.ingest?.created_at)} />
                      </div>
                    </div>
                    {src.lastError && (
                      // Muted, truncated — red only on the value, not the whole row.
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 10.5,
                          color: "var(--neg-text)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        last error · {src.lastError}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ============ ENRICHMENT + AIRTABLE ============ */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {/* Enrichment */}
              <div style={{ ...cardSurface, padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 16, fontWeight: 600 }}>Enrichment</span>
                  <span style={{ ...monoMeta, marginLeft: "auto" }}>{relTimeAgo(latestEnrich?.created_at)}</span>
                </div>
                <div style={{ display: "flex", gap: 24 }}>
                  {/* "—" until the first enrichment run, then today's aggregates. */}
                  <Stat label="Enriched today" value={latestEnrich ? formatCompact(enrichAgg.processed) : "—"} />
                  <Stat label="Tokens today" value={latestEnrich ? formatCompact(enrichAgg.tokens) : "—"} />
                  <Stat
                    label="Failures today"
                    value={latestEnrich ? formatCompact(enrichAgg.errors) : "—"}
                    tone={enrichAgg.errors > 0 ? "var(--neg-text)" : undefined}
                  />
                </div>
              </div>

              {/* Airtable sync */}
              <div style={{ ...cardSurface, padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 16, fontWeight: 600 }}>Airtable sync</span>
                  <span style={{ ...monoMeta, marginLeft: "auto" }}>{relTimeAgo(latestSync?.created_at)}</span>
                </div>
                <div style={{ display: "flex", gap: 24 }}>
                  {/* "—" until the first sync run, then today's aggregates. */}
                  <Stat label="Synced today" value={latestSync ? formatCompact(syncAgg.processed) : "—"} />
                  <Stat
                    label="Errors today"
                    value={latestSync ? formatCompact(syncAgg.errors) : "—"}
                    tone={syncAgg.errors > 0 ? "var(--neg-text)" : undefined}
                  />
                </div>
                {usage.airtableNoop && (
                  <span style={{ fontSize: 11.5, lineHeight: 1.5, color: "var(--text-tertiary)" }}>
                    No-op — no Airtable token configured, so the last sync did nothing.
                  </span>
                )}
              </div>
            </div>

            {/* ============ RECENT RUNS ============ */}
            <div style={{ ...cardSurface, overflow: "hidden" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "14px 16px",
                  borderBottom: "1px solid var(--border-subtle)",
                }}
              >
                <span style={{ fontSize: 16, fontWeight: 600 }}>Recent runs</span>
                <span style={{ ...monoMeta, marginLeft: "auto" }}>last {usage.recentRuns.length}</span>
              </div>
              {/* Column header row — mono, tertiary. */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "8px 16px",
                  borderBottom: "1px solid var(--border-subtle)",
                  background: "var(--surface-raised)",
                  ...overline,
                }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>Run</span>
                <span style={{ width: 88, textAlign: "right" }}>When</span>
                <span style={{ width: 72, textAlign: "right" }}>Requests</span>
                <span style={{ width: 72, textAlign: "right" }}>Processed</span>
                <span style={{ width: 56, textAlign: "right" }}>Errors</span>
                <span style={{ width: 64, textAlign: "right" }}>Tokens</span>
              </div>
              {usage.recentRuns.map((run) => (
                <div
                  key={run.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "9px 16px",
                    borderBottom: "1px solid var(--border-subtle)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 11.5,
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0, fontWeight: 600, color: "var(--text-primary)" }}>
                    {KIND_LABEL[run.kind]}
                  </span>
                  <span style={{ width: 88, textAlign: "right", color: "var(--text-tertiary)" }}>
                    {relTimeAgo(run.created_at)}
                  </span>
                  <span style={{ width: 72, textAlign: "right", color: "var(--text-secondary)" }}>
                    {formatCompact(run.requests)}
                  </span>
                  <span style={{ width: 72, textAlign: "right", color: "var(--text-secondary)" }}>
                    {formatCompact(run.processed)}
                  </span>
                  <span
                    style={{
                      width: 56,
                      textAlign: "right",
                      color: run.errors > 0 ? "var(--neg-text)" : "var(--text-tertiary)",
                    }}
                  >
                    {formatCompact(run.errors)}
                  </span>
                  <span style={{ width: 64, textAlign: "right", color: "var(--text-secondary)" }}>
                    {run.tokens == null ? "—" : formatCompact(run.tokens)}
                  </span>
                </div>
              ))}
              {usage.recentRuns.length === 0 && (
                <div style={{ padding: "12px 16px", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-tertiary)" }}>
                  no runs yet
                </div>
              )}
            </div>
          </>
        }
      </div>
    </AppShell>
  );
}
