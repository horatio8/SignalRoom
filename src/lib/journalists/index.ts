/**
 * Press-corps population worker (F2 · journalist intelligence, grown from
 * bylines). For every active campaign it reads recent NEWS mentions, extracts a
 * genuine journalist byline from each, aggregates per (campaign, journalist),
 * and upserts the roster into the `journalists` table so the Stories "Press
 * corps" tab (read side in `useLivePressCorps`) shows real people.
 *
 * Honest scope: most keyword-search results — all social, and most news — carry
 * NO clean byline. NewsData exposes `raw.creator` (an array of author names);
 * GNews exposes only `source.name` (the OUTLET, never a person). We treat the
 * outlet as an outlet, never a journalist, so the press corps stays sparse until
 * more genuinely bylined news is ingested. This worker populates only what is
 * really there and NEVER fabricates a roster.
 *
 * Exposed as `runJournalists()` so the cron route can share it. SERVER-ONLY: it
 * uses the service-role Supabase client — never import from a client component.
 *
 * NOTE: the `journalists` table has no unique constraint on (campaign_id, name)
 * (see migration 0001), so we cannot use PostgREST `upsert`/`onConflict`. We
 * emulate the upsert with select-then-update-or-insert keyed on
 * (campaign_id, name).
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";

/** Only look back this far for bylined news. */
const LOOKBACK_DAYS = 30;
/** Cap news rows scanned per campaign so a busy campaign can't run long. */
const MAX_NEWS_ROWS = 2000;

// ---- Minimal DB row shapes (the repo has no generated Supabase types) ----

interface CampaignRow {
  id: string;
  slug: string;
}

interface NewsMentionRow {
  author: string | null;
  sentiment: number | null;
  published_at: string | null;
  raw: Record<string, unknown> | null;
}

interface JournalistIdRow {
  id: string;
}

/** In-memory aggregate for one (campaign, journalist name). */
interface Aggregate {
  name: string;
  outlet: string | null;
  mentionCount: number;
  sentimentSum: number;
  sentimentCount: number;
  lastWroteAt: string | null;
  /** published_at of the row that set `outlet` — so outlet tracks the newest. */
  outletAt: string | null;
}

export interface CampaignJournalistSummary {
  slug: string;
  journalists: number;
}

export interface JournalistsSummary {
  campaigns: CampaignJournalistSummary[];
  total: number;
  /** Non-fatal per-campaign errors; the run continues past them. */
  errors: string[];
}

/**
 * Run one press-corps population pass across all active campaigns. Returns a
 * summary; per-campaign failures are recorded and skipped rather than thrown.
 * We deliberately do NOT write a `service_runs` row — its `kind` check
 * constraint does not include a journalists kind.
 */
export async function runJournalists(): Promise<JournalistsSummary> {
  const admin = supabaseAdmin();
  if (!admin) {
    throw new Error("Supabase service-role client is not configured.");
  }

  const summary: JournalistsSummary = { campaigns: [], total: 0, errors: [] };

  const { data: campaignRows, error: campaignsError } = await admin
    .from("campaigns")
    .select("id, slug")
    .eq("status", "active");
  if (campaignsError) {
    throw new Error(`Failed to load campaigns: ${campaignsError.message}`);
  }

  const sinceIso = new Date(
    Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  for (const campaign of (campaignRows ?? []) as CampaignRow[]) {
    try {
      const count = await populateCampaign(admin, campaign, sinceIso);
      summary.campaigns.push({ slug: campaign.slug, journalists: count });
      summary.total += count;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      summary.errors.push(`Campaign ${campaign.slug} failed: ${msg}`);
    }
  }

  return summary;
}

/** Load recent news, aggregate bylines, upsert, and return rows written. */
async function populateCampaign(
  admin: SupabaseClient,
  campaign: CampaignRow,
  sinceIso: string
): Promise<number> {
  const { data: mentions, error } = await admin
    .from("mentions")
    .select("author, sentiment, published_at, raw")
    .eq("campaign_id", campaign.id)
    .eq("media_type", "news")
    .gte("published_at", sinceIso)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(MAX_NEWS_ROWS);
  if (error) {
    throw new Error(`failed to load news mentions — ${error.message}`);
  }

  const aggregates = aggregate((mentions ?? []) as NewsMentionRow[]);

  let written = 0;
  for (const agg of aggregates.values()) {
    await upsertJournalist(admin, campaign.id, agg);
    written++;
  }
  return written;
}

/**
 * Aggregate news rows into one entry per genuine journalist name. Rows with no
 * real byline (all social, all GNews, un-bylined NewsData) are skipped — the
 * outlet is never promoted to a journalist.
 */
function aggregate(rows: NewsMentionRow[]): Map<string, Aggregate> {
  const byName = new Map<string, Aggregate>();

  for (const row of rows) {
    const outlet = extractOutlet(row);
    const name = extractByline(row, outlet);
    if (!name) continue; // no genuine byline → skip (never invent one)

    const key = name.toLowerCase();
    const existing = byName.get(key);
    if (existing) {
      existing.mentionCount++;
      if (typeof row.sentiment === "number") {
        existing.sentimentSum += row.sentiment;
        existing.sentimentCount++;
      }
      if (isLater(row.published_at, existing.lastWroteAt)) {
        existing.lastWroteAt = row.published_at;
      }
      // Outlet follows the most recent byline for this journalist.
      if (outlet && isLater(row.published_at, existing.outletAt)) {
        existing.outlet = outlet;
        existing.outletAt = row.published_at;
      }
    } else {
      byName.set(key, {
        name,
        outlet,
        mentionCount: 1,
        sentimentSum: typeof row.sentiment === "number" ? row.sentiment : 0,
        sentimentCount: typeof row.sentiment === "number" ? 1 : 0,
        lastWroteAt: row.published_at,
        outletAt: outlet ? row.published_at : null,
      });
    }
  }

  return byName;
}

/**
 * Extract the OUTLET name for a news row. NewsData keeps it in
 * `raw.source_name` and also mirrors it onto the mention's `author` column;
 * GNews keeps it in `raw.source.name`. This is a publication, never a person.
 */
function extractOutlet(row: NewsMentionRow): string | null {
  const raw = row.raw ?? {};
  const sourceName = asName(raw["source_name"]);
  if (sourceName) return sourceName;
  const source = raw["source"];
  if (source && typeof source === "object") {
    const gnews = asName((source as Record<string, unknown>)["name"]);
    if (gnews) return gnews;
  }
  // Fallback: the ingest layer copies the outlet onto `author` for news.
  return asName(row.author);
}

/**
 * Extract a genuine journalist byline, or null when there isn't one.
 *
 * The only real byline source in our news payloads is NewsData's `raw.creator`,
 * an array of author names. We take the first clean entry. Everything else —
 * GNews (which has no byline and sets author = source.name = outlet), or a
 * NewsData row with an empty/absent creator — yields null, so the outlet is
 * NEVER mistaken for a journalist. As a final guard we drop any candidate that
 * merely echoes the outlet name.
 */
function extractByline(row: NewsMentionRow, outlet: string | null): string | null {
  const raw = row.raw ?? {};
  const creator = raw["creator"];
  if (!Array.isArray(creator)) return null;

  for (const entry of creator) {
    const name = asName(entry);
    if (!name) continue;
    // Guard against payloads where the "author" is just the outlet.
    if (outlet && name.toLowerCase() === outlet.toLowerCase()) continue;
    return name;
  }
  return null;
}

/**
 * Coerce an unknown into a clean display name, or null. Trims, collapses inner
 * whitespace, and rejects empty strings and the common "null"/"unknown"
 * placeholders NewsData sometimes emits.
 */
function asName(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (lower === "null" || lower === "unknown" || lower === "n/a") return null;
  return trimmed;
}

/** True when `candidate` is a strictly later timestamp than `current`. */
function isLater(candidate: string | null, current: string | null): boolean {
  if (!candidate) return false;
  if (!current) return true;
  return candidate > current;
}

/**
 * Emulated upsert on (campaign_id, name): the table has no unique constraint to
 * conflict on, so we select the existing row and update it, or insert a new one.
 * Counts are recomputed from the lookback window each run, so writing the fresh
 * aggregate (rather than incrementing) keeps the row idempotent.
 */
async function upsertJournalist(
  admin: SupabaseClient,
  campaignId: string,
  agg: Aggregate
): Promise<void> {
  const avgSentiment =
    agg.sentimentCount > 0
      ? Math.round(agg.sentimentSum / agg.sentimentCount)
      : null;

  const values = {
    outlet: agg.outlet,
    mention_count: agg.mentionCount,
    avg_sentiment: avgSentiment,
    last_wrote_at: agg.lastWroteAt,
  };

  const { data: existing, error: selectError } = await admin
    .from("journalists")
    .select("id")
    .eq("campaign_id", campaignId)
    .eq("name", agg.name)
    .limit(1)
    .maybeSingle<JournalistIdRow>();
  if (selectError) {
    throw new Error(`journalist lookup failed for "${agg.name}" — ${selectError.message}`);
  }

  if (existing) {
    const { error: updateError } = await admin
      .from("journalists")
      .update(values)
      .eq("id", existing.id);
    if (updateError) {
      throw new Error(`journalist update failed for "${agg.name}" — ${updateError.message}`);
    }
    return;
  }

  const { error: insertError } = await admin
    .from("journalists")
    .insert({ campaign_id: campaignId, name: agg.name, ...values });
  if (insertError) {
    throw new Error(`journalist insert failed for "${agg.name}" — ${insertError.message}`);
  }
}
