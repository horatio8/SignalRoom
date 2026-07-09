"use client";

/**
 * Live read for the Narrative screen (S12) — the message box + narrative
 * control, computed from enriched mentions. Follows the same read-only idiom as
 * live.ts / liveAnalytics.ts: an anon-key browser client governed by RLS
 * (0002_rls.sql), a bounded fresh window fetched on mount and re-polled, with
 * plain-TS aggregation over the returned rows. Signed out — or with the Supabase
 * env absent (demo mode, createClient() === null) — the query returns zero rows,
 * `live` stays false, and the caller renders its empty state. Live data is
 * strictly additive; its absence is never an error.
 *
 * What it computes from the last 14 days of enriched, relevant mentions:
 *  - The 2×2 message box: for each stance quadrant (usUs / usThem / themUs /
 *    themThem) the count, its share of stance-classified volume, and the average
 *    sentiment of that quadrant. "us" = our campaign/cause, "them" = the
 *    opposition (see src/lib/enrich/prompt.ts for how the worker assigns them).
 *  - A "control" meter: the share of stance-classified volume that is us-FRAMED
 *    (usUs + usThem — our side is the speaker) vs them-framed (themThem + themUs
 *    — the opposition is the speaker). Who is driving the conversation.
 *  - Narrative themes: mentions grouped by narrative_theme (non-null), each with
 *    volume, average sentiment, and summed reach, sorted by volume. The
 *    enrichment worker only sets narrative_theme when the campaign has
 *    message_platform pillars; with no platform document every theme is null, so
 *    `themes` is empty and `hasThemes` is false — the UI shows an honest note
 *    while the message box (from stance alone) stays live.
 *
 * Design rules honored: red is reserved for negative sentiment (the "them" side
 * is a neutral identity, never red); any heat ramp in the UI is intensity only.
 *
 * See src/lib/data/live.ts for the read-only idiom this follows.
 */

import { useEffect, useState } from "react";
import type { CampaignId } from "@/lib/state";
import { createClient } from "@/lib/supabase/client";

const POLL_MS = 60_000;
const DAY_MS = 86_400_000;
const WINDOW_DAYS = 14;

/** The four message-box stance quadrants (mentions.message_box_quadrant). */
export type Quadrant = "usUs" | "usThem" | "themUs" | "themThem";
const QUADRANTS: Quadrant[] = ["usUs", "usThem", "themUs", "themThem"];

/** The columns S12 aggregates (plus the inner-joined campaign slug). */
interface NarrativeRow {
  message_box_quadrant: string | null;
  narrative_theme: string | null;
  sentiment: number | null;
  reach_score: number | null;
}

/** Per-quadrant aggregate. `avgSentiment` is null when the quadrant is empty. */
export interface QuadrantStat {
  quadrant: Quadrant;
  count: number;
  /** 0..100 share of stance-classified volume. */
  share: number;
  /** 0..5 intensity ramp (share relative to the busiest quadrant). */
  heat: number;
  avgSentiment: number | null;
}

/** One narrative theme aggregate (only present when pillars classify coverage). */
export interface ThemeStat {
  theme: string;
  count: number;
  /** 0..100 share of themed volume. */
  share: number;
  avgSentiment: number | null;
  /** Summed reach_score across the theme's mentions (null scores count as 0). */
  reach: number;
}

/** Who is driving the conversation — speaker-side share of stance volume. */
export interface ControlStat {
  usCount: number;
  themCount: number;
  /** 0..100 share of stance volume framed by our side (usUs + usThem). */
  usShare: number;
  /** 0..100 share framed by the opposition (themThem + themUs). */
  themShare: number;
}

export interface LiveNarrative {
  /** True only when ≥ 1 enriched mention with a stance quadrant was returned. */
  live: boolean;
  /** Stance-classified mentions in the window — powers the header live chip. */
  mentionCount: number;
  /** The 2×2 message box, keyed by quadrant. Always has all four keys. */
  quadrants: Record<Quadrant, QuadrantStat>;
  /** Speaker-side control meter. */
  control: ControlStat;
  /** Themes sorted by volume; empty when no pillars have classified coverage. */
  themes: ThemeStat[];
  /** True when ≥ 1 non-null narrative_theme was returned (a platform exists). */
  hasThemes: boolean;
}

/** mean of a numeric array, or null when empty. */
function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

/** Zeroed quadrant map — also the empty-state shape (all counts 0). */
function emptyQuadrants(): Record<Quadrant, QuadrantStat> {
  return {
    usUs: { quadrant: "usUs", count: 0, share: 0, heat: 0, avgSentiment: null },
    usThem: { quadrant: "usThem", count: 0, share: 0, heat: 0, avgSentiment: null },
    themUs: { quadrant: "themUs", count: 0, share: 0, heat: 0, avgSentiment: null },
    themThem: { quadrant: "themThem", count: 0, share: 0, heat: 0, avgSentiment: null },
  };
}

const EMPTY_NARRATIVE: LiveNarrative = {
  live: false,
  mentionCount: 0,
  quadrants: emptyQuadrants(),
  control: { usCount: 0, themCount: 0, usShare: 0, themShare: 0 },
  themes: [],
  hasThemes: false,
};

function asQuadrant(v: string | null): Quadrant | null {
  return v && (QUADRANTS as string[]).includes(v) ? (v as Quadrant) : null;
}

function buildNarrative(rows: NarrativeRow[]): LiveNarrative {
  // --- 2×2 message box: bucket rows by stance quadrant ---
  const bucketRows: Record<Quadrant, NarrativeRow[]> = {
    usUs: [],
    usThem: [],
    themUs: [],
    themThem: [],
  };
  for (const r of rows) {
    const q = asQuadrant(r.message_box_quadrant);
    if (q) bucketRows[q].push(r);
  }

  const total = QUADRANTS.reduce((n, q) => n + bucketRows[q].length, 0);
  if (total === 0) return EMPTY_NARRATIVE;

  const maxCount = QUADRANTS.reduce((m, q) => Math.max(m, bucketRows[q].length), 0);
  const quadrants = emptyQuadrants();
  for (const q of QUADRANTS) {
    const rs = bucketRows[q];
    const count = rs.length;
    // Intensity ramp (0..5): busiest quadrant tops out, empty quadrants stay 0.
    const heat =
      maxCount <= 0 || count === 0 ? 0 : Math.min(5, Math.max(1, Math.ceil((count / maxCount) * 5)));
    quadrants[q] = {
      quadrant: q,
      count,
      share: Math.round((count / total) * 100),
      heat,
      avgSentiment: (() => {
        const avg = mean(rs.map((r) => r.sentiment).filter((s): s is number => s != null));
        return avg != null ? Math.round(avg) : null;
      })(),
    };
  }

  // --- control meter: speaker-side share (us = usUs+usThem, them = themThem+themUs) ---
  const usCount = quadrants.usUs.count + quadrants.usThem.count;
  const themCount = quadrants.themThem.count + quadrants.themUs.count;
  const control: ControlStat = {
    usCount,
    themCount,
    usShare: Math.round((usCount / total) * 100),
    themShare: Math.round((themCount / total) * 100),
  };

  // --- narrative themes: group non-null narrative_theme, sort by volume ---
  const themeRows: Record<string, NarrativeRow[]> = {};
  for (const r of rows) {
    const t = r.narrative_theme?.trim();
    if (!t) continue;
    (themeRows[t] ??= []).push(r);
  }
  const themedTotal = Object.values(themeRows).reduce((n, rs) => n + rs.length, 0);
  const themes: ThemeStat[] = Object.entries(themeRows)
    .map(([theme, rs]) => {
      const avg = mean(rs.map((r) => r.sentiment).filter((s): s is number => s != null));
      return {
        theme,
        count: rs.length,
        share: themedTotal > 0 ? Math.round((rs.length / themedTotal) * 100) : 0,
        avgSentiment: avg != null ? Math.round(avg) : null,
        reach: rs.reduce((n, r) => n + (r.reach_score ?? 0), 0),
      };
    })
    .sort((a, b) => b.count - a.count);

  return {
    live: true,
    mentionCount: total,
    quadrants,
    control,
    themes,
    hasThemes: themes.length > 0,
  };
}

/**
 * Live Narrative aggregates for a campaign. Fetches the last 14 days of
 * enriched, relevant mentions (RLS-scoped, capped) once on mount, then polls
 * every 60s. `live` is true only when the query succeeded AND ≥ 1 returned row
 * carries a stance quadrant; any other outcome yields the empty shape so the
 * caller can render its "no narrative data yet" state.
 */
export function useLiveNarrative(campaign: CampaignId): LiveNarrative {
  const [state, setState] = useState<LiveNarrative>(EMPTY_NARRATIVE);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) {
      setState(EMPTY_NARRATIVE);
      return;
    }

    let cancelled = false;

    const load = async () => {
      const sinceISO = new Date(Date.now() - WINDOW_DAYS * DAY_MS).toISOString();

      const { data, error } = await supabase
        .from("mentions")
        .select(
          "message_box_quadrant, narrative_theme, sentiment, reach_score, campaigns!inner(slug)"
        )
        .eq("campaigns.slug", campaign)
        .is("duplicate_of", null)
        .eq("is_hidden", false)
        .gte("relevance", 30)
        .gte("published_at", sinceISO)
        .limit(5000);

      if (cancelled) return;
      if (error || !data || data.length === 0) {
        setState(EMPTY_NARRATIVE);
        return;
      }
      setState(buildNarrative(data as unknown as NarrativeRow[]));
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
