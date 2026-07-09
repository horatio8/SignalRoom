"use client";

/**
 * Live read/write path for S4 Briefings. Mirrors live.ts: an anon-key browser
 * read governed by RLS (0002_rls.sql) — briefings are scoped to campaign
 * members, so signed out (or demo mode, createClient() === null) the query
 * returns zero rows, `live` stays false, and the screen falls back to its
 * EmptyState. Live data is strictly additive; its absence is never an error.
 *
 * Beyond reading, this exposes `vote(briefingId, 'up'|'down')` which inserts a
 * `briefing_feedback` row (also RLS-scoped by briefing → campaign). It returns
 * an error string on failure, or null on success, so the caller can notify().
 *
 * Briefings change slowly (one per day), so a 60s poll is plenty.
 *
 * See src/lib/data/live.ts for the read-only idiom this follows.
 */

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** One briefing row as the screen consumes it (via the inner-joined slug). */
export interface LiveBriefing {
  id: string;
  briefing_date: string;
  kind: string;
  content_md: string;
  stats: BriefingStats | null;
  model: string | null;
  prompt_version: string | null;
}

/** The stats jsonb the generator writes (all optional — read defensively). */
export interface BriefingStats {
  volume?: number;
  priorVolume?: number;
  volumeDelta?: number;
  sentiment?: number | null;
  priorSentiment?: number | null;
  sentimentDelta?: number | null;
  clusterCount?: number;
  alertCount?: number;
  topPlatforms?: { platform: string; count: number }[];
}

interface BriefingRow {
  id: string;
  briefing_date: string;
  kind: string;
  content_md: string;
  stats: BriefingStats | null;
  model: string | null;
  prompt_version: string | null;
}

const POLL_MS = 60_000;

/**
 * Live briefings for a campaign, newest first (limit 30). `live` is true only
 * when the query succeeded AND returned >= 1 row; any other outcome (no client,
 * error, empty) yields `{ live: false, briefings: [] }`. Fetches on mount then
 * polls every 60s until unmount.
 */
export function useLiveBriefings(campaign: string): {
  live: boolean;
  briefings: LiveBriefing[];
  vote: (briefingId: string, vote: "up" | "down") => Promise<string | null>;
} {
  const [state, setState] = useState<{ live: boolean; briefings: LiveBriefing[] }>({
    live: false,
    briefings: [],
  });

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) {
      setState({ live: false, briefings: [] });
      return;
    }

    let cancelled = false;

    const load = async () => {
      const { data, error } = await supabase
        .from("briefings")
        .select(
          "id, briefing_date, kind, content_md, stats, model, prompt_version, campaigns!inner(slug)"
        )
        .eq("campaigns.slug", campaign)
        .order("briefing_date", { ascending: false })
        .limit(30);

      if (cancelled) return;
      if (error || !data) {
        setState({ live: false, briefings: [] });
        return;
      }
      const briefings = (data as unknown as BriefingRow[]).map((r) => ({
        id: r.id,
        briefing_date: r.briefing_date,
        kind: r.kind,
        content_md: r.content_md,
        stats: r.stats,
        model: r.model,
        prompt_version: r.prompt_version,
      }));
      setState({ live: briefings.length > 0, briefings });
    };

    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [campaign]);

  /**
   * Record up/down feedback on a briefing. Attributes the row to the signed-in
   * user when a session exists (user_id is nullable). RLS rejects a briefing the
   * user can't see; that surfaces as the returned error string.
   */
  const vote = useCallback(
    async (briefingId: string, vote: "up" | "down"): Promise<string | null> => {
      const supabase = createClient();
      if (!supabase) return "Feedback needs a signed-in session.";

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error } = await supabase
        .from("briefing_feedback")
        .insert({ briefing_id: briefingId, user_id: user?.id ?? null, vote });
      if (error) return error.message;
      return null;
    },
    []
  );

  return { ...state, vote };
}
