"use client";

/**
 * Live reads for the Overview (S1) and Stories (S3) screens — the third and
 * fourth surfaces to reach past dataFor() fixtures to real rows, after the Feed
 * (live.ts) and Settings keywords (keywords.ts).
 *
 * Both hooks go through the anon-key browser client and are governed by RLS
 * (0002_rls.sql): reads are scoped to campaign members via campaigns!inner(slug).
 * Signed out — or with the Supabase env absent (demo mode, createClient() ===
 * null) — the queries return zero rows, `live` stays false, and each caller
 * falls straight back to its fixtures. Live data is strictly additive; its
 * absence is never an error. So for voss/marsh (no live rows) nothing changes.
 *
 * All aggregation here is plain TS over a bounded, freshly-fetched window. This
 * is deliberately naive: at scale the per-hour / per-day rollups, velocity, and
 * cluster stats move to SQL (materialized views / a stats RPC) so the browser
 * isn't summing thousands of rows on every poll. For the current row counts the
 * in-hook math is honest and cheap.
 *
 * Design rules honored (per the design system):
 *  - No number without a baseline delta. Today is compared against the average
 *    of the prior 6 days in the same fetched window; with no prior data (first
 *    day) the delta renders as "—" (no-baseline style), never a fabricated one.
 *  - Red is reserved for negative sentiment. The volume delta never goes red;
 *    the heat strip is an intensity ramp (--heat-0..5), not a sentiment scale.
 *
 * See src/lib/data/live.ts for the read-only idiom this follows.
 */

import { useEffect, useState } from "react";
import type { CampaignId } from "@/lib/state";
import type { Kpi, Story, ClusterListItem, FeaturedCluster, MediaType, Journalist } from "./types";
import { signed } from "@/lib/ui";
import { createClient } from "@/lib/supabase/client";

const POLL_MS = 120_000;
const DAY_MS = 86_400_000;

/** The four message-box quadrants stamped on enriched mentions (S12). */
type Quadrant = "usUs" | "usThem" | "themUs" | "themThem";

/* CSS color vars reused for delta tones (raw, like the fixtures pass). */
const POS = "var(--pos-text)";
const NEG = "var(--neg-text)";
const WARN = "var(--warn-text)";
const MUTED = "var(--text-tertiary)";
const SECONDARY = "var(--text-secondary)";
/** Delta string used when there is genuinely no baseline yet (first day). */
const NO_BASELINE = "—";

/** The mentions columns S1 aggregates (plus the inner-joined campaign slug). */
interface OverviewMentionRow {
  published_at: string | null;
  sentiment: number | null;
  relevance: number | null;
  platform: string;
  media_type: MediaType;
  reach_score: number | null;
  /** S12 stance quadrant; null until the enrichment worker classifies the row. */
  message_box_quadrant: Quadrant | null;
}

/** The clusters columns both screens map from. */
interface ClusterRow {
  id: string;
  label: string | null;
  summary: string | null;
  first_seen: string | null;
  last_seen: string | null;
  mention_count: number | null;
  avg_sentiment: number | null;
  peak_velocity: number | null;
  media_pct: number | null;
  origin_path: string | null;
  is_coordinated: boolean | null;
  status: string | null;
}

/* ---------- small formatters ---------- */

function formatCount(n: number): string {
  return n.toLocaleString();
}

/** peak_velocity → "5.4×"; null → "—" (unenriched cluster, no velocity yet). */
function velLabel(c: ClusterRow): string {
  return typeof c.peak_velocity === "number" ? `${c.peak_velocity.toFixed(1)}×` : "—";
}

/** media_pct → the dominant side, mirroring the fixtures' "81% social" / "54% media". */
function dominantMix(mediaPct: number | null): string {
  if (mediaPct == null) return "mix pending";
  const social = 100 - mediaPct;
  return mediaPct >= social ? `${mediaPct}% media` : `${social}% social`;
}

/** first_seen → the fixtures' compact absolute stamp ("Tue 22:04"). */
function absTime(iso: string | null): string {
  if (!iso) return "recently";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "recently";
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${day} ${hh}:${mm}`;
}

/** DB status → the three-level view-model status; unknown/null → "open". */
function mapStatus(s: string | null): "open" | "fading" | "closed" {
  return s === "fading" ? "fading" : s === "closed" ? "closed" : "open";
}

/* ---------- cluster heat ramp (intensity only) ---------- */

interface HeatCtx {
  basisOf(c: ClusterRow): number;
  maxBasis: number;
}

/**
 * Build a heat context for a set of clusters. Heat is an intensity ramp: it
 * prefers peak_velocity (the "how hot right now" signal) when any cluster has
 * it, else falls back to mention_count so unenriched sets still ramp sensibly.
 */
function heatCtx(clusters: ClusterRow[]): HeatCtx {
  const useVel = clusters.some((c) => typeof c.peak_velocity === "number");
  const basisOf = (c: ClusterRow): number =>
    useVel ? (c.peak_velocity ?? 0) : (c.mention_count ?? 0);
  const maxBasis = clusters.reduce((m, c) => Math.max(m, basisOf(c)), 0);
  return { basisOf, maxBasis };
}

/** 0..5 heat: 0 when no activity, else at least 1, normalized to the set's max. */
function heatLevel(c: ClusterRow, ctx: HeatCtx): number {
  const b = ctx.basisOf(c);
  if (ctx.maxBasis <= 0 || b <= 0) return 0;
  return Math.min(5, Math.max(1, Math.ceil((b / ctx.maxBasis) * 5)));
}

/* ---------- cluster → view-model mappers ---------- */

function toStory(c: ClusterRow, ctx: HeatCtx): Story {
  return {
    label: c.label?.trim() || "Unlabeled story",
    vel: velLabel(c),
    h: heatLevel(c, ctx),
    mentions: formatCount(c.mention_count ?? 0),
    mix: dominantMix(c.media_pct),
    // Unenriched clusters (avg_sentiment null) render neutral, not red.
    sentV: c.avg_sentiment ?? 0,
    coordinated: !!c.is_coordinated,
  };
}

function toClusterListItem(c: ClusterRow, ctx: HeatCtx): ClusterListItem {
  return { ...toStory(c, ctx), status: mapStatus(c.status) };
}

/**
 * Featured hot-cluster card. Fields the clusters table cannot honestly fill —
 * the per-hour velocity sparkline (no cluster time-series is stored) and the
 * origin→spread path when null — keep the caller's fixture rendering.
 */
function toFeatured(c: ClusterRow, ctx: HeatCtx, fallback: FeaturedCluster): FeaturedCluster {
  const h = heatLevel(c, ctx);
  const count = c.mention_count ?? 0;
  const mediaPct = c.media_pct;
  return {
    label: c.label?.trim() || "Unlabeled story",
    vel: velLabel(c),
    velBg: `var(--heat-${h})`,
    border: `var(--heat-${Math.max(1, h - 1)})`,
    status: c.status?.trim() || "open",
    coordinated: !!c.is_coordinated,
    sentV: c.avg_sentiment ?? 0,
    meta: `${formatCount(count)} mentions · first seen ${absTime(c.first_seen)} · ${dominantMix(mediaPct)}`,
    summary: c.summary?.trim() || "Summary pending — this cluster has not been written up yet.",
    // origin_path null → keep the fixture timeline (no honest live value).
    path: c.origin_path?.trim() || fallback.path,
    // No per-hour cluster series is stored, so the velocity sparkline stays fixture.
    spark: fallback.spark,
    sparkBaseline: fallback.sparkBaseline,
    sparkColor: fallback.sparkColor,
    mediaMixPct: mediaPct ?? fallback.mediaMixPct,
    mixLabel:
      mediaPct != null ? `media ${mediaPct}% · social ${100 - mediaPct}%` : fallback.mixLabel,
    mentionsLabel: `View ${formatCount(count)} mentions`,
  };
}

/* ================= S1 Overview ================= */

/**
 * Us-vs-them share of voice over the last 24h, from message_box_quadrant.
 * us = usUs + usThem (we set the agenda), them = themThem + themUs (they do).
 * `deltaPct` is the change in usPct vs the prior-6-day window in percentage
 * points, or null when either window has no classified rows (no honest baseline).
 */
export interface ShareOfVoice {
  usPct: number;
  themPct: number;
  usCount: number;
  themCount: number;
  /** usCount + themCount — 0 means nothing is classified yet (empty, not fake). */
  total: number;
  deltaPct: number | null;
}

/** One day of the 30-day volume trend: total mentions split us vs them. */
export interface VolumePoint {
  /** Local calendar day, "YYYY-MM-DD". */
  date: string;
  us: number;
  them: number;
  total: number;
}

export interface LiveOverview {
  /** True only when the mentions query succeeded AND returned ≥ 1 row. */
  live: boolean;
  /** Rows fetched in the window — powers the header "live · N mentions" chip. */
  mentionCount: number;
  /** 24h volume KPI with a prior-6-day baseline delta. */
  volumeKpi: Kpi;
  /** Net sentiment KPI with a prior-6-day baseline delta. */
  sentimentKpi: Kpi;
  /** Urgent alerts (severity='urgent') fired in the last 24h; 0 is a live value. */
  urgentAlerts24h: number;
  mediaCount: number;
  socialCount: number;
  mediaPct: number;
  /** Us-vs-them share of voice (last 24h) from message_box_quadrant. */
  shareOfVoice: ShareOfVoice;
  /** 24-length heat strip (0..5) indexed by hour-of-day, last 24h normalized. */
  hours: number[];
  /** Per-day volume series (up to 30 days, contiguous from first day of data). */
  volumeSeries: VolumePoint[];
  /** Top clusters (hottest first, up to 5) as Overview story rows. */
  stories: Story[];
}

const EMPTY_SOV: ShareOfVoice = { usPct: 0, themPct: 0, usCount: 0, themCount: 0, total: 0, deltaPct: null };

const EMPTY_OVERVIEW: LiveOverview = {
  live: false,
  mentionCount: 0,
  volumeKpi: { label: "24h volume", value: "0", delta: NO_BASELINE, tone: MUTED, heat: 0 },
  sentimentKpi: { label: "Net sentiment", value: "0", delta: NO_BASELINE, tone: MUTED, heat: 0 },
  urgentAlerts24h: 0,
  mediaCount: 0,
  socialCount: 0,
  mediaPct: 0,
  shareOfVoice: EMPTY_SOV,
  hours: new Array(24).fill(0),
  volumeSeries: [],
  stories: [],
};

/** mean of a numeric array, or null when empty. */
function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

/** us = usUs+usThem (we drive the frame); null/other quadrants are neither. */
function isUsQuadrant(q: Quadrant | null): boolean {
  return q === "usUs" || q === "usThem";
}
/** them = themThem+themUs (they drive the frame). */
function isThemQuadrant(q: Quadrant | null): boolean {
  return q === "themThem" || q === "themUs";
}

/** Local calendar-day key ("YYYY-MM-DD") for daily bucketing. */
function dayKey(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function buildOverview(
  rows: OverviewMentionRow[],
  clusters: ClusterRow[],
  urgentAlerts24h: number
): LiveOverview {
  const now = Date.now();
  const todayFloor = now - DAY_MS; // rolling last 24h
  const priorFloor = now - 7 * DAY_MS; // start of the 6-day baseline window
  const trendFloor = now - 30 * DAY_MS; // 30-day volume series window

  const ts = (r: OverviewMentionRow): number => {
    const t = r.published_at ? new Date(r.published_at).getTime() : NaN;
    return Number.isNaN(t) ? -Infinity : t;
  };

  const today = rows.filter((r) => ts(r) >= todayFloor);
  const prior = rows.filter((r) => ts(r) >= priorFloor && ts(r) < todayFloor);

  // --- 24h volume + delta vs the prior-6-day daily average ---
  const todayCount = today.length;
  const priorDailyAvg = prior.length / 6;
  const hasVolBaseline = prior.length > 0;
  const volPct = hasVolBaseline ? Math.round(((todayCount - priorDailyAvg) / priorDailyAvg) * 100) : null;
  const volumeKpi: Kpi = {
    label: "24h volume",
    value: formatCount(todayCount),
    delta: volPct != null ? `${signed(volPct)}% vs 7-day` : NO_BASELINE,
    // Volume is never red (red = negative sentiment only); up is positive, a
    // decline reads neutral, no-baseline reads muted.
    tone: volPct == null ? MUTED : volPct >= 0 ? POS : SECONDARY,
    heat: 0,
  };

  // --- net sentiment today + delta vs the same baseline ---
  const todayAvg = mean(today.map((r) => r.sentiment).filter((s): s is number => s != null));
  const priorAvg = mean(prior.map((r) => r.sentiment).filter((s): s is number => s != null));
  const sentValue = todayAvg != null ? Math.round(todayAvg) : 0; // all-null → neutral 0
  const sentDelta = todayAvg != null && priorAvg != null ? Math.round(todayAvg - priorAvg) : null;
  const sentimentKpi: Kpi = {
    label: "Net sentiment",
    value: signed(sentValue),
    delta: sentDelta != null ? `${signed(sentDelta)} vs baseline` : NO_BASELINE,
    // Sentiment change may legitimately go red.
    tone: sentDelta == null ? MUTED : sentDelta > 0 ? POS : sentDelta < 0 ? NEG : WARN,
    heat: 0,
  };

  // --- media vs social mix (last 24h) ---
  const mediaCount = today.filter((r) => r.media_type === "news").length;
  const socialCount = today.filter((r) => r.media_type === "social").length;
  const mixTotal = mediaCount + socialCount;
  const mediaPct = mixTotal > 0 ? Math.round((mediaCount / mixTotal) * 100) : 0;

  // --- us-vs-them share of voice (last 24h) from message_box_quadrant ---
  // Only classified rows count; unenriched (null quadrant) rows are excluded so
  // the split is honest. usPct + themPct == 100 whenever anything is classified.
  const sovUsCount = today.filter((r) => isUsQuadrant(r.message_box_quadrant)).length;
  const sovThemCount = today.filter((r) => isThemQuadrant(r.message_box_quadrant)).length;
  const sovTotal = sovUsCount + sovThemCount;
  const usPct = sovTotal > 0 ? Math.round((sovUsCount / sovTotal) * 100) : 0;
  const themPct = sovTotal > 0 ? 100 - usPct : 0;
  // prior-window share (same rule) for a percentage-point delta, when both exist.
  const priorUs = prior.filter((r) => isUsQuadrant(r.message_box_quadrant)).length;
  const priorThem = prior.filter((r) => isThemQuadrant(r.message_box_quadrant)).length;
  const priorSovTotal = priorUs + priorThem;
  const sovDelta =
    sovTotal > 0 && priorSovTotal > 0 ? usPct - Math.round((priorUs / priorSovTotal) * 100) : null;
  const shareOfVoice: ShareOfVoice = {
    usPct,
    themPct,
    usCount: sovUsCount,
    themCount: sovThemCount,
    total: sovTotal,
    deltaPct: sovDelta,
  };

  // --- 30-day per-day volume series (us/them/total), contiguous from day one ---
  const inTrend = rows.filter((r) => {
    const t = ts(r);
    return t !== -Infinity && t >= trendFloor;
  });
  const dayBuckets = new Map<string, { us: number; them: number; total: number }>();
  let minTs = Infinity;
  for (const r of inTrend) {
    const t = ts(r);
    if (t < minTs) minTs = t;
    const key = dayKey(t);
    const b = dayBuckets.get(key) ?? { us: 0, them: 0, total: 0 };
    b.total++;
    if (isUsQuadrant(r.message_box_quadrant)) b.us++;
    else if (isThemQuadrant(r.message_box_quadrant)) b.them++;
    dayBuckets.set(key, b);
  }
  const volumeSeries: VolumePoint[] = [];
  if (inTrend.length > 0) {
    // Walk contiguous local days from the first day of data through today so the
    // line has an unbroken x-axis; empty interior days read as honest zeros.
    const cursor = new Date(minTs);
    cursor.setHours(0, 0, 0, 0);
    const endKey = dayKey(now);
    // Cap the walk at 31 iterations (30-day window) as a defensive bound.
    for (let i = 0; i < 31; i++) {
      const key = dayKey(cursor.getTime());
      const b = dayBuckets.get(key) ?? { us: 0, them: 0, total: 0 };
      volumeSeries.push({ date: key, us: b.us, them: b.them, total: b.total });
      if (key === endKey) break;
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  // --- 24h heat strip: per clock-hour count, normalized to the window's max ---
  const buckets = new Array(24).fill(0);
  for (const r of today) {
    const t = ts(r);
    if (t === -Infinity) continue;
    buckets[new Date(t).getHours()]++;
  }
  const maxHour = buckets.reduce((m, c) => Math.max(m, c), 0);
  const hours = buckets.map((c) =>
    maxHour <= 0 || c === 0 ? 0 : Math.min(5, Math.max(1, Math.ceil((c / maxHour) * 5)))
  );

  // --- top clusters (hottest first) → Overview story rows ---
  const ctx = heatCtx(clusters);
  const stories = [...clusters]
    .sort((a, b) => ctx.basisOf(b) - ctx.basisOf(a))
    .slice(0, 5)
    .map((c) => toStory(c, ctx));

  return {
    live: true,
    mentionCount: rows.length,
    volumeKpi,
    sentimentKpi,
    urgentAlerts24h,
    mediaCount,
    socialCount,
    mediaPct,
    shareOfVoice,
    hours,
    volumeSeries,
    stories,
  };
}

/**
 * Live Overview aggregates for a campaign. Fetches the last 7 days of mentions
 * (RLS-scoped, newest-first, capped) plus the campaign's clusters once on mount,
 * then polls every 120s. `live` is true only when the mentions query succeeded
 * AND returned ≥ 1 row; any other outcome yields the empty shape so S1 keeps its
 * fixtures. The clusters read is best-effort: if it fails or is empty, stories
 * come back empty and the caller falls back to fixture stories.
 */
export function useLiveOverview(campaign: CampaignId): LiveOverview {
  const [state, setState] = useState<LiveOverview>(EMPTY_OVERVIEW);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) {
      setState(EMPTY_OVERVIEW);
      return;
    }

    let cancelled = false;

    const load = async () => {
      // 30-day window so the volume trend has history; the 24h/7-day KPIs still
      // filter within these rows by timestamp, so widening the fetch is safe.
      const sinceISO = new Date(Date.now() - 30 * DAY_MS).toISOString();
      const alertsSinceISO = new Date(Date.now() - DAY_MS).toISOString();

      const [mres, cres, ares] = await Promise.all([
        supabase
          .from("mentions")
          .select(
            "published_at, sentiment, relevance, platform, media_type, reach_score, message_box_quadrant, campaigns!inner(slug)"
          )
          .eq("campaigns.slug", campaign)
          .is("duplicate_of", null)
          .eq("is_hidden", false)
          .or("relevance.gte.30,relevance.is.null")
          .gte("published_at", sinceISO)
          .order("published_at", { ascending: false, nullsFirst: false })
          .limit(2000),
        supabase
          .from("clusters")
          .select(
            "id, label, summary, first_seen, last_seen, mention_count, avg_sentiment, peak_velocity, media_pct, origin_path, is_coordinated, status, campaigns!inner(slug)"
          )
          .eq("campaigns.slug", campaign)
          .order("last_seen", { ascending: false, nullsFirst: false })
          .limit(30),
        // Urgent alerts fired in the last 24h (RLS-scoped by campaign slug).
        // head:true + count:exact returns the count without shipping rows.
        supabase
          .from("alerts")
          .select("id, campaigns!inner(slug)", { count: "exact", head: true })
          .eq("campaigns.slug", campaign)
          .eq("severity", "urgent")
          .gte("fired_at", alertsSinceISO),
      ]);

      if (cancelled) return;
      if (mres.error || !mres.data || mres.data.length === 0) {
        setState(EMPTY_OVERVIEW);
        return;
      }
      const rows = mres.data as unknown as OverviewMentionRow[];
      const clusters = (!cres.error && cres.data ? (cres.data as unknown as ClusterRow[]) : []);
      // Best-effort: a failed alerts read reads as 0 (honest live zero), not an error.
      const urgentAlerts24h = !ares.error && typeof ares.count === "number" ? ares.count : 0;
      setState(buildOverview(rows, clusters, urgentAlerts24h));
    };

    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [campaign]);

  return state;
}

/* ================= S3 Stories ================= */

export interface LiveStories {
  /** True when the clusters query returned ≥ 1 row. */
  live: boolean;
  clusterCount: number;
  openCount: number;
  fadingCount: number;
  /** Featured hot-cluster card (highest open mention_count, else most recent). */
  fc: FeaturedCluster;
  /** Every other cluster as a list row. */
  otherClusters: ClusterListItem[];
}

/**
 * Live Stories clusters for a campaign. Fetches all statuses (last_seen desc,
 * capped) once on mount, then polls every 120s. `live` is true when ≥ 1 cluster
 * came back. The featured card needs a fixture `fallback` for the two fields the
 * clusters table cannot supply (velocity sparkline + null origin path); when not
 * live the caller uses its own fixture featured/otherClusters instead.
 */
export function useLiveStories(campaign: CampaignId, fallback: FeaturedCluster): LiveStories {
  const [state, setState] = useState<LiveStories>({
    live: false,
    clusterCount: 0,
    openCount: 0,
    fadingCount: 0,
    fc: fallback,
    otherClusters: [],
  });

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) {
      setState({ live: false, clusterCount: 0, openCount: 0, fadingCount: 0, fc: fallback, otherClusters: [] });
      return;
    }

    let cancelled = false;

    const load = async () => {
      const { data, error } = await supabase
        .from("clusters")
        .select(
          "id, label, summary, first_seen, last_seen, mention_count, avg_sentiment, peak_velocity, media_pct, origin_path, is_coordinated, status, campaigns!inner(slug)"
        )
        .eq("campaigns.slug", campaign)
        .order("last_seen", { ascending: false, nullsFirst: false })
        .limit(30);

      if (cancelled) return;
      if (error || !data || data.length === 0) {
        setState({ live: false, clusterCount: 0, openCount: 0, fadingCount: 0, fc: fallback, otherClusters: [] });
        return;
      }

      const clusters = data as unknown as ClusterRow[];
      const ctx = heatCtx(clusters);

      // Featured = highest mention_count among open; else the most recent
      // (data is already last_seen desc, so the first row is the fallback).
      const open = clusters.filter((c) => mapStatus(c.status) === "open");
      const featured =
        open.length > 0
          ? open.reduce((best, c) => ((c.mention_count ?? 0) > (best.mention_count ?? 0) ? c : best))
          : clusters[0];

      const otherClusters = clusters
        .filter((c) => c.id !== featured.id)
        .map((c) => toClusterListItem(c, ctx));

      setState({
        live: true,
        clusterCount: clusters.length,
        openCount: clusters.filter((c) => mapStatus(c.status) === "open").length,
        fadingCount: clusters.filter((c) => mapStatus(c.status) === "fading").length,
        fc: toFeatured(featured, ctx, fallback),
        otherClusters,
      });
    };

    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // fallback is the campaign's fixture fc — stable per campaign; re-run on slug.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign]);

  return state;
}

/* ---------- Press corps (F2, grown from bylines) ---------- */

/** The journalists columns the Press corps tab reads (name, outlet + metrics). */
interface JournalistRow {
  name: string;
  outlet: string | null;
  mention_count: number | null;
  avg_sentiment: number | null;
  last_wrote_at: string | null;
}

export interface LivePressCorps {
  /** True when the journalists query succeeded AND returned ≥ 1 row. */
  live: boolean;
  /** Journalist rows mapped to the S3 view model; [] until bylines populate it. */
  journalists: Journalist[];
}

/** last_wrote_at → the compact absolute stamp the Journalist row shows. */
function toJournalist(row: JournalistRow): Journalist {
  return {
    name: row.name,
    outlet: row.outlet?.trim() || "—",
    count: formatCount(row.mention_count ?? 0),
    // Unenriched (avg_sentiment null) reads neutral 0, never a fabricated tone.
    sentV: row.avg_sentiment ?? 0,
    last: absTime(row.last_wrote_at),
  };
}

/**
 * Live press corps for a campaign — the F2 journalist table, grown from news
 * bylines by the enrichment pipeline (out of scope here; this is the read side).
 * RLS-scoped, best-effort, 120s poll. The table is empty until bylines populate
 * it, so `live` is false and the caller renders an honest empty state — never a
 * fabricated roster.
 */
export function useLivePressCorps(campaign: CampaignId): LivePressCorps {
  const [state, setState] = useState<LivePressCorps>({ live: false, journalists: [] });

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) {
      setState({ live: false, journalists: [] });
      return;
    }

    let cancelled = false;

    const load = async () => {
      const { data, error } = await supabase
        .from("journalists")
        .select("name, outlet, mention_count, avg_sentiment, last_wrote_at, campaigns!inner(slug)")
        .eq("campaigns.slug", campaign)
        .order("mention_count", { ascending: false, nullsFirst: false })
        .limit(50);

      if (cancelled) return;
      if (error || !data || data.length === 0) {
        setState({ live: false, journalists: [] });
        return;
      }
      const journalists = (data as unknown as JournalistRow[]).map(toJournalist);
      setState({ live: journalists.length > 0, journalists });
    };

    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [campaign]);

  return state;
}
