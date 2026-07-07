"use client";

/**
 * Operational-metrics read surface (S7 Admin + Settings source health). Unlike
 * the campaign feeds (live.ts / liveAnalytics.ts), this reads `service_runs` —
 * the per-run ledger the ingest, enrichment, and Airtable-sync workers append to.
 *
 * The read goes through the anon-key browser client and is governed by RLS: that
 * policy opens `service_runs` to any signed-in user (operational metrics aren't
 * campaign-scoped, so there's no membership join here). Signed out — or with the
 * Supabase env absent (demo mode, createClient() === null) — the query returns
 * zero rows, `live` stays false, and the dashboard shows its waiting state. Live
 * data is strictly additive; its absence is never an error.
 *
 * The `detail` jsonb shape is still being finalised by the backend team, so every
 * detail.* access here is optional-chained through the asRecord/asArray/asNum/
 * asStr guards below — an unexpected or missing field degrades to a null/zero,
 * never a crash. See src/lib/data/live.ts for the read-only hook idiom this follows.
 */

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const POLL_MS = 60_000;

/** The three worker kinds that write to service_runs. */
export type RunKind = "ingest" | "enrich" | "sync_airtable";

/**
 * Search services that actually have ingest adapters (static knowledge). The
 * other catalog tools (kwatch, apify, meta_ad_library, firecrawl, podcastindex)
 * are not wired and never appear in ingest detail. Display names come from
 * SURVEY_TOOLS (src/lib/integrations.ts); this is just the wired set.
 */
export const WIRED_SOURCES = ["scrapecreators", "ensembledata", "newsdata", "gnews"] as const;
export type WiredSource = (typeof WIRED_SOURCES)[number];

/** The columns we select from `service_runs`. `detail` is opaque jsonb. */
interface ServiceRunRow {
  id: string;
  kind: RunKind;
  created_at: string;
  requests: number | null;
  processed: number | null;
  errors: number | null;
  tokens: number | null;
  detail: unknown;
}

/** The most-recent row for a kind, surfaced whole (detail kept opaque). */
export interface ServiceRunSummary {
  created_at: string;
  requests: number;
  processed: number;
  errors: number;
  tokens: number | null;
}

/** Today's summed counters for one kind (since local midnight). */
export interface KindAggregate {
  requests: number;
  processed: number;
  errors: number;
  tokens: number;
}

/** Per-wired-source rollup for the ingest health cards. */
export interface SourceUsage {
  id: WiredSource;
  /** API calls today, summed from detail.campaigns[].requestsBySource[source]. */
  requestsToday: number;
  /** Rows captured today per source — null when the shape carries no per-source count. */
  rowsToday: number | null;
  /** Credits left from the latest ingest detail.credits[source]; null (e.g. newsdata) → "—". */
  creditsRemaining: number | null;
  /** Most recent error message for this source across recent runs, else null. */
  lastError: string | null;
}

/** One row for the recent-runs log list. */
export interface RecentRun {
  id: string;
  kind: RunKind;
  created_at: string;
  requests: number;
  processed: number;
  errors: number;
  tokens: number | null;
}

export interface ServiceUsage {
  /** True once ≥ 1 service_runs row exists (any kind). */
  live: boolean;
  /** Most recent row per kind (absent kinds omitted). */
  latestByKind: Partial<Record<RunKind, ServiceRunSummary>>;
  /** Today's summed counters per kind (always all three, zeroed when idle). */
  todayByKind: Record<RunKind, KindAggregate>;
  /** Per-wired-source ingest rollup (always all three sources). */
  perSource: Record<WiredSource, SourceUsage>;
  /** Last ~15 runs, newest first. */
  recentRuns: RecentRun[];
  /** Latest sync_airtable run looks like a no-op (no token configured), if detectable. */
  airtableNoop: boolean;
}

/* ---------- defensive jsonb accessors (tolerate shape drift) ---------- */

type JsonRecord = Record<string, unknown>;

function asRecord(v: unknown): JsonRecord | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as JsonRecord) : null;
}
function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function asNum(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function asStr(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/* ---------- empty shape (no rows / no client) ---------- */

function zeroAggregate(): KindAggregate {
  return { requests: 0, processed: 0, errors: 0, tokens: 0 };
}
function emptySource(id: WiredSource): SourceUsage {
  return { id, requestsToday: 0, rowsToday: null, creditsRemaining: null, lastError: null };
}
function emptyUsage(): ServiceUsage {
  return {
    live: false,
    latestByKind: {},
    todayByKind: { ingest: zeroAggregate(), enrich: zeroAggregate(), sync_airtable: zeroAggregate() },
    perSource: Object.fromEntries(
      WIRED_SOURCES.map((s) => [s, emptySource(s)])
    ) as Record<WiredSource, SourceUsage>,
    recentRuns: [],
    airtableNoop: false,
  };
}

/* ---------- derivation ---------- */

/** Detect a no-op Airtable sync (no token configured) from the latest detail. */
function detectAirtableNoop(detail: unknown): boolean {
  const d = asRecord(detail);
  if (!d) return false;
  if (d.skipped === true || d.noop === true) return true;
  const reason = asStr(d.reason);
  return !!reason && /token|not configured|no[-_ ]?token/i.test(reason);
}

function buildUsage(rows: ServiceRunRow[]): ServiceUsage {
  if (rows.length === 0) return emptyUsage();

  const out = emptyUsage();
  out.live = true;

  // Rows arrive newest-first; today = since local midnight (a calendar day, not
  // a rolling 24h — matches how operators read "today's spend").
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const midnightMs = midnight.getTime();
  const ts = (iso: string): number => {
    const t = new Date(iso).getTime();
    return Number.isNaN(t) ? -Infinity : t;
  };

  // latestByKind: first row seen per kind (already newest-first).
  for (const r of rows) {
    if (!out.latestByKind[r.kind]) {
      out.latestByKind[r.kind] = {
        created_at: r.created_at,
        requests: r.requests ?? 0,
        processed: r.processed ?? 0,
        errors: r.errors ?? 0,
        tokens: r.tokens,
      };
    }
  }

  // todayByKind: sum the top-level counters over today's rows.
  for (const r of rows) {
    if (ts(r.created_at) < midnightMs) continue;
    const agg = out.todayByKind[r.kind];
    agg.requests += r.requests ?? 0;
    agg.processed += r.processed ?? 0;
    agg.errors += r.errors ?? 0;
    agg.tokens += r.tokens ?? 0;
  }

  // perSource requests + rows today, summed across today's ingest rows'
  // per-campaign breakdown. rowsBySource/insertedBySource are read defensively:
  // if the shape carries no per-source row count, rowsToday stays null → "—".
  const rowsSeen = Object.fromEntries(
    WIRED_SOURCES.map((s) => [s, false])
  ) as Record<WiredSource, boolean>;
  for (const r of rows) {
    if (r.kind !== "ingest" || ts(r.created_at) < midnightMs) continue;
    const detail = asRecord(r.detail);
    for (const c of asArray(detail?.campaigns)) {
      const camp = asRecord(c);
      if (!camp) continue;
      const rbs = asRecord(camp.requestsBySource);
      const rowsBS = asRecord(camp.rowsBySource) ?? asRecord(camp.insertedBySource);
      for (const src of WIRED_SOURCES) {
        const req = asNum(rbs?.[src]);
        if (req != null) out.perSource[src].requestsToday += req;
        const rows = asNum(rowsBS?.[src]);
        if (rows != null) {
          out.perSource[src].rowsToday = (out.perSource[src].rowsToday ?? 0) + rows;
          rowsSeen[src] = true;
        }
      }
    }
  }
  // Sources that never carried a per-source row count read "—", not "0".
  for (const src of WIRED_SOURCES) {
    if (!rowsSeen[src]) out.perSource[src].rowsToday = null;
  }

  // creditsRemaining from the latest ingest run's detail.credits.
  const latestIngest = rows.find((r) => r.kind === "ingest");
  const credits = asRecord(asRecord(latestIngest?.detail)?.credits);
  for (const src of WIRED_SOURCES) {
    out.perSource[src].creditsRemaining = asNum(credits?.[src]);
  }

  // lastError per source: first (newest) matching error across recent ingest runs.
  for (const r of rows) {
    if (r.kind !== "ingest") continue;
    const detail = asRecord(r.detail);
    for (const c of asArray(detail?.campaigns)) {
      const errs = asArray(asRecord(c)?.errors);
      for (const e of errs) {
        const er = asRecord(e);
        const src = asStr(er?.source);
        const msg = asStr(er?.message);
        if (src && msg && (WIRED_SOURCES as readonly string[]).includes(src)) {
          const s = src as WiredSource;
          if (out.perSource[s].lastError == null) out.perSource[s].lastError = msg;
        }
      }
    }
  }

  // recentRuns: last ~15, newest first.
  out.recentRuns = rows.slice(0, 15).map((r) => ({
    id: r.id,
    kind: r.kind,
    created_at: r.created_at,
    requests: r.requests ?? 0,
    processed: r.processed ?? 0,
    errors: r.errors ?? 0,
    tokens: r.tokens,
  }));

  out.airtableNoop = detectAirtableNoop(rows.find((r) => r.kind === "sync_airtable")?.detail);

  return out;
}

/**
 * Live service-usage metrics. Fetches the ~60 most recent service_runs rows
 * (RLS-open to any signed-in user, newest-first) once on mount, then polls every
 * 60s. `live` is true only when ≥ 1 row came back; any other outcome (no client,
 * error, empty) yields the zeroed empty shape so callers show a waiting state.
 */
export function useServiceUsage(): ServiceUsage {
  const [state, setState] = useState<ServiceUsage>(emptyUsage);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) {
      setState(emptyUsage());
      return;
    }

    let cancelled = false;

    const load = async () => {
      const { data, error } = await supabase
        .from("service_runs")
        .select("id, kind, created_at, requests, processed, errors, tokens, detail")
        .order("created_at", { ascending: false })
        .limit(60);

      if (cancelled) return;
      if (error || !data) {
        setState(emptyUsage());
        return;
      }
      setState(buildUsage(data as unknown as ServiceRunRow[]));
    };

    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return state;
}

/* ---------- shared formatters (used by Admin + Settings) ---------- */

/** Compact large counts: 942 → "942", 12300 → "12.3k", 4.2M → "4.2m". */
export function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs < 1000) return `${n}`;
  if (abs < 1_000_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`;
}

/** Past ISO timestamp → compact relative time ("just now", "4m", "2h", "Mon 14:02"). */
export function relTimeAgo(iso: string | null | undefined): string {
  if (!iso) return "no runs yet";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "unknown";
  const mins = Math.floor((Date.now() - then) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const d = new Date(then);
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${day} ${hh}:${mm}`;
}
