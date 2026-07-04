/**
 * Airtable audit mirror (§audit). Every mention recorded in Supabase is mirrored
 * once to an Airtable table so the operator can audit the full record of what was
 * captured from any platform/source. A mention is mirrored when it reaches a
 * TERMINAL enrichment state (enriched_at set OR enrich_failed) — so sentiment and
 * relevance land with it — or after a 2h safety window if enrichment is stuck, so
 * nothing is ever lost. `airtable_synced_at` makes the run idempotent and
 * self-healing: only null-stamped rows are picked up, and only successfully
 * mirrored rows are stamped, so a failed chunk simply retries next run.
 *
 * REST: POST https://api.airtable.com/v0/{baseId}/{tableId} with a Bearer token,
 * body { records: [{ fields }], typecast: true }. Airtable caps a write at 10
 * records/request and 5 requests/sec per base, so we chunk by 10 and pause ~220ms
 * between requests. Fields are written by NAME with typecast:true — the table's
 * fields already exist; null/undefined values are omitted, never sent as null.
 *
 * Exposed as `syncAirtable()` so the cron route and backfill jobs can share it.
 * SERVER-ONLY: it uses the service-role Supabase client and the Airtable token —
 * never import from a client component.
 */

import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

const AIRTABLE_API = "https://api.airtable.com/v0";
const DEFAULT_BASE_ID = "appldd3J5iWvlu2dV";
const DEFAULT_TABLE_ID = "tbls41mIlyJCyjn2Y";
const DEFAULT_MAX_RECORDS = 200;
const REQUEST_TIMEOUT_MS = 25_000;
/** Airtable write cap per request. */
const CHUNK_SIZE = 10;
/** Pause between requests to stay under 5 req/sec per base. */
const RATE_LIMIT_PAUSE_MS = 220;
/** Safety window: mirror a mention this long after capture even if not terminal. */
const SAFETY_WINDOW_MS = 2 * 60 * 60 * 1000;
/** Batch size for the write-back that stamps airtable_synced_at. */
const STAMP_BATCH = 100;
const LOG_PREFIX = "[sync:airtable]";

/** Typed error carrying the HTTP status; a 401 (bad token) aborts the run. */
export class AirtableError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "AirtableError";
    this.status = status;
  }
}

export interface SyncSummary {
  scanned: number;
  synced: number;
  failed: number;
  chunks: number;
  errors: { message: string }[];
  /** Present only when the run was a no-op for a configuration reason. */
  skipped?: string;
}

// ---- DB row shape (the repo has no generated Supabase types) ----

interface MentionRow {
  id: string;
  source: string;
  platform: string;
  media_type: string | null;
  url: string | null;
  author: string | null;
  author_followers: number | null;
  title: string | null;
  body: string | null;
  published_at: string | null;
  captured_at: string | null;
  relevance: number | null;
  sentiment: number | null;
  topics: string[] | null;
  // campaigns!inner(name) — supabase-js returns the joined row as an object or,
  // depending on the relationship, an array. Accept both and narrow.
  campaigns: { name: string | null } | { name: string | null }[] | null;
}

/** Airtable field bag — values are the JSON scalars Airtable accepts. */
type AirtableFields = Record<string, string | number>;

/** True when the Airtable token is present, i.e. the mirror is enabled. */
export function airtableConfigured(): boolean {
  return Boolean(process.env.AIRTABLE_TOKEN);
}

/** Parse AIRTABLE_MAX_RECORDS → positive int, or default. */
function resolveMaxRecords(): number {
  const raw = Number(process.env.AIRTABLE_MAX_RECORDS);
  return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_MAX_RECORDS;
}

/** Pull the campaign name out of the joined row (object or single-element array). */
function campaignName(campaigns: MentionRow["campaigns"]): string | null {
  if (!campaigns) return null;
  const row = Array.isArray(campaigns) ? campaigns[0] : campaigns;
  return row?.name ?? null;
}

/**
 * Map a mention row to the Airtable field bag. Null/undefined values are omitted
 * (never sent as null); numbers are only sent when non-null; typecast handles the
 * remaining coercions on Airtable's side.
 */
function toFields(m: MentionRow): AirtableFields {
  const fields: AirtableFields = {};

  const name =
    (m.title && m.title.trim()) ||
    (m.body ? m.body.slice(0, 100) : "") ||
    "Untitled mention";
  fields["Name"] = name;

  const campaign = campaignName(m.campaigns);
  if (campaign) fields["Campaign"] = campaign;

  fields["Source"] = m.source;
  fields["Platform"] = m.platform;
  if (m.media_type) fields["Media Type"] = m.media_type;
  if (m.url) fields["URL"] = m.url;
  if (m.author) fields["Author"] = m.author;
  if (m.author_followers !== null) fields["Author Followers"] = m.author_followers;
  if (m.body) fields["Body"] = m.body;
  if (m.published_at) fields["Published At"] = m.published_at;
  if (m.captured_at) fields["Captured At"] = m.captured_at;
  if (m.relevance !== null) fields["Relevance"] = m.relevance;
  if (m.sentiment !== null) fields["Sentiment"] = m.sentiment;
  if (m.topics && m.topics.length > 0) fields["Topics"] = m.topics.join(", ");
  fields["Supabase ID"] = m.id;

  return fields;
}

/** POST one chunk of records to Airtable, throwing AirtableError on non-2xx. */
async function postChunk(
  token: string,
  baseId: string,
  tableId: string,
  fieldBags: AirtableFields[]
): Promise<void> {
  const url = `${AIRTABLE_API}/${baseId}/${tableId}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        records: fieldBags.map((fields) => ({ fields })),
        typecast: true,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new AirtableError(0, `request failed: ${reason}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const detail =
      res.status === 401
        ? "bad token"
        : res.status === 403
          ? "forbidden (check token scope / base access)"
          : res.status === 422
            ? "unprocessable (check field names / values)"
            : res.status === 429
              ? "rate limited"
              : `server responded ${res.status}`;
    throw new AirtableError(res.status, detail);
  }
}

/** Sleep helper for rate limiting. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run one Airtable mirror pass. Returns a summary; never throws for per-chunk
 * write failures (those are recorded and retried next run) — a 401 aborts the run
 * because every remaining chunk would fail the same way.
 */
export async function syncAirtable(): Promise<SyncSummary> {
  const summary: SyncSummary = {
    scanned: 0,
    synced: 0,
    failed: 0,
    chunks: 0,
    errors: [],
  };

  const admin = supabaseAdmin();
  if (!admin) {
    return { ...summary, skipped: "Supabase service-role client is not configured." };
  }
  const token = process.env.AIRTABLE_TOKEN;
  if (!token) {
    return { ...summary, skipped: "AIRTABLE_TOKEN is not set; Airtable mirror disabled." };
  }

  const baseId = process.env.AIRTABLE_BASE_ID || DEFAULT_BASE_ID;
  const tableId = process.env.AIRTABLE_TABLE_ID || DEFAULT_TABLE_ID;
  const maxRecords = resolveMaxRecords();

  // Rows needing sync: not yet mirrored, and either terminal (enriched or failed)
  // or past the 2h safety window. Oldest first, capped to bound time + rate cost.
  const safetyCutoff = new Date(Date.now() - SAFETY_WINDOW_MS).toISOString();
  const { data, error } = await admin
    .from("mentions")
    .select(
      "id, source, platform, media_type, url, author, author_followers, title, body, published_at, captured_at, relevance, sentiment, topics, campaigns!inner(name)"
    )
    .is("airtable_synced_at", null)
    .or(
      `enriched_at.not.is.null,enrich_failed.is.true,captured_at.lt.${safetyCutoff}`
    )
    .order("captured_at", { ascending: true })
    .limit(maxRecords);

  if (error) {
    throw new Error(`Failed to fetch mentions for Airtable sync: ${error.message}`);
  }

  const rows = (data ?? []) as unknown as MentionRow[];
  summary.scanned = rows.length;
  if (rows.length === 0) {
    console.log(`${LOG_PREFIX} nothing to mirror`);
    return summary;
  }

  // Chunk into groups of 10; POST each; collect ids of successful chunks only.
  const syncedIds: string[] = [];
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    summary.chunks += 1;
    try {
      await postChunk(token, baseId, tableId, chunk.map(toFields));
      for (const m of chunk) syncedIds.push(m.id);
      summary.synced += chunk.length;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      summary.failed += chunk.length;
      summary.errors.push({ message });
      console.log(`${LOG_PREFIX} chunk failed: ${message}`);
      // A bad token fails every chunk identically — stop rather than hammer.
      if (err instanceof AirtableError && err.status === 401) {
        console.log(`${LOG_PREFIX} aborting run: bad token`);
        break;
      }
    }
    // Pause between requests to respect the 5 req/sec per-base limit.
    if (i + CHUNK_SIZE < rows.length) await sleep(RATE_LIMIT_PAUSE_MS);
  }

  // Stamp only the successfully mirrored rows so failures retry next run.
  if (syncedIds.length > 0) {
    const stampedAt = new Date().toISOString();
    for (let i = 0; i < syncedIds.length; i += STAMP_BATCH) {
      const idBatch = syncedIds.slice(i, i + STAMP_BATCH);
      const { error: stampError } = await admin
        .from("mentions")
        .update({ airtable_synced_at: stampedAt })
        .in("id", idBatch);
      if (stampError) {
        // Stamp failure would re-mirror these rows next run (Airtable dupes).
        summary.errors.push({
          message: `Failed to stamp airtable_synced_at: ${stampError.message}`,
        });
        console.log(`${LOG_PREFIX} stamp failed: ${stampError.message}`);
      }
    }
  }

  console.log(
    `${LOG_PREFIX} done: scanned=${summary.scanned} synced=${summary.synced} failed=${summary.failed} chunks=${summary.chunks}`
  );
  return summary;
}
