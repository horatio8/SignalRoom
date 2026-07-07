/**
 * Shared types for the multi-source ingest pipeline (§ingest). A
 * NormalizedMention is the platform-agnostic shape every adapter normalizer
 * emits — it maps one-to-one onto the columns the ingest runner writes into the
 * `mentions` table (see supabase/migrations/0001_schema.sql). Adapters never
 * touch Supabase directly; they return NormalizedMention rows and the runner
 * stamps campaign_id + inserts.
 *
 * Sources: ScrapeCreators (social keyword search), EnsembleData (TikTok keyword
 * search — takes over TikTok when a campaign keys it), NewsData (news keyword
 * search, primary for news), and GNews (news gap-filler — runs alongside
 * NewsData but stores only stories NewsData didn't capture). Dedupe is per
 * (campaign_id, source, external_id), so the runner routes each platform to
 * exactly one source to avoid duplicate rows.
 */

/** JSON-serialisable value, mirroring Supabase's jsonb column contract. */
export type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json | undefined };

/** Platforms the ScrapeCreators social sweep covers (X/Facebook are absent). */
export type IngestPlatform =
  | "tiktok"
  | "youtube"
  | "reddit"
  | "threads"
  | "instagram";

/**
 * Every source that can write `mentions` rows through the ingest runner.
 * NewsData is the primary news source; GNews runs alongside it as a GAP-FILLER
 * (when both are keyed, GNews contributes only stories NewsData didn't already
 * capture), so the two never write duplicate news rows under different sources.
 * When only one is keyed, that one runs on its own.
 */
export const INGEST_SOURCES = [
  "scrapecreators",
  "ensembledata",
  "newsdata",
  "gnews",
] as const;

export type IngestSource = (typeof INGEST_SOURCES)[number];

/**
 * Platforms a normalized row can carry: the social sweep platforms plus "news"
 * (NewsData). Kept separate from IngestPlatform so the ScrapeCreators PLATFORMS
 * map stays exhaustive over just the social sweep.
 */
export type MentionPlatform = IngestPlatform | "news";

/** Coarse media class stored on every row (matches the DB check constraint). */
export type MentionMediaType = "social" | "news";

/**
 * A normalized mention, ready to insert. Social rows use media_type "social"
 * (ScrapeCreators, EnsembleData); NewsData rows use platform "news" and
 * media_type "news". The runner fills `campaign_id` (hence the Omit in adapter
 * signatures) and the DB defaults `captured_at`.
 */
export interface NormalizedMention {
  campaign_id: string;
  source: IngestSource;
  platform: MentionPlatform;
  media_type: MentionMediaType;
  external_id: string;
  url: string | null;
  author: string | null;
  author_followers: number | null;
  title: string | null;
  body: string | null;
  published_at: string | null; // ISO 8601, nullable
  raw: Json; // the untouched source item payload
}

/** What a normalizer returns — the runner adds campaign_id before insert. */
export type NormalizedMentionInput = Omit<NormalizedMention, "campaign_id">;

/** Per source×platform×keyword failure, surfaced in the run summary. */
export interface IngestError {
  source: IngestSource;
  platform: MentionPlatform;
  keyword: string; // "*" for batched/whole-campaign failures
  message: string;
}

/** Per-campaign slice of the run summary. */
export interface CampaignSummary {
  slug: string;
  requests: number;
  /** Requests charged to each source this campaign (sums to `requests`). */
  requestsBySource: Record<IngestSource, number>;
  inserted: number;
  /**
   * Best-effort duplicate count. With ignoreDuplicates upserts, Supabase does
   * not report which conflicting rows it skipped, so this is attempted-minus-
   * returned and may be approximate (see runIngest for the honest caveat).
   */
  skippedDuplicates: number;
  /**
   * Rows dropped by the recency filter this campaign: normalized rows whose
   * published_at was non-null AND older than now − INGEST_MAX_AGE_DAYS. Rows
   * with a null published_at are never counted here (age can't be judged, so
   * they are kept). Dropped before persist, so they never reach `mentions`.
   */
  droppedStale: number;
  /**
   * News rows GNews returned this campaign that were dropped BEFORE persist
   * because another source already captured the same story — matched on a
   * normalized URL or title against (a) NewsData rows inserted this run and
   * (b) existing recent `mentions` news rows. Distinct from skippedDuplicates
   * (a DB-level, post-persist count on the unique index): crossSourceSkipped is
   * an application-level pre-persist gap-filler count, so GNews contributes only
   * net-new stories.
   */
  crossSourceSkipped: number;
  errors: IngestError[];
}

/** The full result of one runIngest() invocation. */
export interface Summary {
  campaigns: CampaignSummary[];
  totalRequests: number;
  capped: boolean; // true when INGEST_MAX_REQUESTS stopped the run early
  /**
   * Total rows dropped by the recency filter across every campaign/source this
   * run (sum of each CampaignSummary.droppedStale) — rows whose published_at was
   * older than now − INGEST_MAX_AGE_DAYS. Surfaced so stale-drop volume is
   * visible in the run summary/detail.
   */
  droppedStale: number;
  /**
   * Total GNews rows dropped by the cross-source gap-filler across every
   * campaign this run (sum of each CampaignSummary.crossSourceSkipped) — stories
   * NewsData (this run or in the recent DB window) already covered. Surfaced so
   * gap-filler overlap volume is visible in the run summary/detail.
   */
  crossSourceSkipped: number;
  /**
   * Most-recent credit/unit balance seen per source this run, keyed by source
   * name (e.g. { scrapecreators: 8421 }). Only sources whose API responses
   * report a remaining balance appear — ScrapeCreators always does, EnsembleData
   * when its plan reports remaining units, and NewsData never (no per-call
   * balance), so NewsData is omitted.
   */
  credits: Record<string, number>;
}
