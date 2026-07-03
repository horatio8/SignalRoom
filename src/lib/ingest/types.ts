/**
 * Shared types for the ScrapeCreators ingest pipeline (§ingest). A
 * NormalizedMention is the platform-agnostic shape every adapter normalizer
 * emits — it maps one-to-one onto the columns the ingest runner writes into the
 * `mentions` table (see supabase/migrations/0001_schema.sql). Adapters never
 * touch Supabase directly; they return NormalizedMention rows and the runner
 * stamps campaign_id + inserts.
 */

/** JSON-serialisable value, mirroring Supabase's jsonb column contract. */
export type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json | undefined };

/** Platforms this adapter covers (X/Facebook are intentionally absent). */
export type IngestPlatform =
  | "tiktok"
  | "youtube"
  | "reddit"
  | "threads"
  | "instagram";

/**
 * A normalized social mention, ready to insert. `source` is always
 * "scrapecreators" and `media_type` is always "social" for this adapter — the
 * runner fills `campaign_id` (hence the Omit in the adapter signature) and the
 * DB defaults `captured_at`.
 */
export interface NormalizedMention {
  campaign_id: string;
  source: "scrapecreators";
  platform: IngestPlatform;
  media_type: "social";
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

/** Per platform×keyword failure, surfaced in the run summary. */
export interface IngestError {
  platform: IngestPlatform;
  keyword: string;
  message: string;
}

/** Per-campaign slice of the run summary. */
export interface CampaignSummary {
  slug: string;
  requests: number;
  inserted: number;
  /**
   * Best-effort duplicate count. With ignoreDuplicates upserts, Supabase does
   * not report which conflicting rows it skipped, so this is attempted-minus-
   * returned and may be approximate (see runIngest for the honest caveat).
   */
  skippedDuplicates: number;
  errors: IngestError[];
}

/** The full result of one runIngest() invocation. */
export interface Summary {
  campaigns: CampaignSummary[];
  totalRequests: number;
  capped: boolean; // true when INGEST_MAX_REQUESTS stopped the run early
}
