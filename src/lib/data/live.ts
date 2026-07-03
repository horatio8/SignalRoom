"use client";

/**
 * First live read path (S2 Feed). Every other screen still renders mock
 * fixtures via dataFor(); this hook is the one place that reaches past them to
 * real rows written by the ingest + enrichment workers into `mentions`.
 *
 * The read goes through the anon-key browser client and is therefore governed
 * by RLS (0002_rls.sql): reads are scoped to campaign members. Signed out — or
 * with the Supabase env absent (demo mode, createClient() === null) — the query
 * returns zero rows, `live` stays false, and the caller falls straight back to
 * fixtures. Live data is strictly additive; its absence is never an error.
 *
 * See src/lib/data/index.ts for the mock layer this augments.
 */

import { useEffect, useState } from "react";
import type { CampaignId } from "@/lib/state";
import type { Mention, MediaType } from "./types";
import { createClient } from "@/lib/supabase/client";

/** The columns we select from `mentions` (plus the inner-joined campaign slug). */
interface LiveRow {
  id: string;
  platform: string;
  media_type: MediaType;
  url: string | null;
  author: string | null;
  author_followers: number | null;
  title: string | null;
  body: string | null;
  published_at: string | null;
  relevance: number | null;
  sentiment: number | null;
  topics: string[] | null;
}

const POLL_MS = 60_000;

/** DB `platform` value → PlatformChip key (see PF_ICONS / monogram fallbacks in src/lib/ui.ts). */
const PLATFORM_CHIP: Record<string, string> = {
  reddit: "RD",
  x: "X",
  youtube: "YT",
  tiktok: "TT",
  instagram: "IG",
  facebook: "FB",
  bluesky: "BS",
  discord: "DIS",
  news: "NEWS",
  podcast: "POD",
  web: "WEB",
  rss: "RSS",
  linkedin: "LI",
  quora: "Q",
};

/**
 * Stable positive 32-bit hash of a mention uuid → numeric Mention.id. The view
 * model (and the feed's hiddenIds flow) key on `number`; the hash is stable
 * across polls so a hidden row stays hidden.
 */
function hashId(uuid: string): number {
  let h = 0;
  for (let i = 0; i < uuid.length; i++) {
    h = (Math.imul(31, h) + uuid.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

/** published_at → the feed's compact relative time ("4m", "2h", "Mon 14:02"). */
function relTime(iso: string | null): string {
  if (!iso) return "pending";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "pending";
  const mins = Math.floor((Date.now() - then) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const d = new Date(then);
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${day} ${hh}:${mm}`;
}

/** Author + follower line, mirroring the fixtures' "@handle · N followers" meta. */
function metaLine(row: LiveRow): string {
  const parts: string[] = [];
  if (row.author) parts.push(row.author);
  if (typeof row.author_followers === "number")
    parts.push(`${row.author_followers.toLocaleString()} followers`);
  return parts.join(" · ");
}

/** Map one DB row to the exact Mention view-model shape (src/lib/data/types.ts). */
function toMention(row: LiveRow): Mention {
  const title =
    row.title?.trim() ||
    (row.body ? row.body.slice(0, 80).trim() : "") ||
    "Untitled mention";
  return {
    id: hashId(row.id),
    pf: PLATFORM_CHIP[row.platform] ?? row.platform.toUpperCase(),
    media: row.media_type,
    // segs come straight from enrichment topics[]; unenriched rows → [].
    segs: row.topics ?? [],
    title,
    body: row.body ?? "",
    meta: metaLine(row),
    time: relTime(row.published_at),
    // Unenriched rows (relevance/sentiment null) render as neutral 0.
    sentV: row.sentiment ?? 0,
  };
}

/**
 * Live mentions for a campaign. `live` is true only when the query succeeded
 * AND returned ≥ 1 row; any other outcome (no client, error, empty) yields
 * `{ live: false, mentions: [] }` so the feed keeps its fixtures. Fetches once
 * on mount, then polls every 60s until unmount.
 */
export function useLiveMentions(campaign: CampaignId): {
  live: boolean;
  mentions: Mention[];
} {
  const [state, setState] = useState<{ live: boolean; mentions: Mention[] }>({
    live: false,
    mentions: [],
  });

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) {
      setState({ live: false, mentions: [] });
      return;
    }

    let cancelled = false;

    const load = async () => {
      const { data, error } = await supabase
        .from("mentions")
        .select(
          "id, platform, media_type, url, author, author_followers, title, body, published_at, relevance, sentiment, topics, campaigns!inner(slug)"
        )
        .eq("campaigns.slug", campaign)
        .is("duplicate_of", null)
        .eq("is_hidden", false)
        .or("relevance.gte.30,relevance.is.null")
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(100);

      if (cancelled) return;
      if (error || !data) {
        setState({ live: false, mentions: [] });
        return;
      }
      const mentions = (data as unknown as LiveRow[]).map(toMention);
      setState({ live: mentions.length > 0, mentions });
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
