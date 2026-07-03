/**
 * NewsData.io keyword-search adapter (§ingest). Batched GET(s) per campaign
 * against https://newsdata.io/api/1/latest, auth via an `apikey` query param.
 *
 * The credit saver: instead of one request per keyword, we OR every active
 * keyword into a single `q` ("kw1" OR "kw2" OR …) so a campaign poll costs one
 * credit. `q` must stay ≤512 chars once URL-encoded, so when the OR string
 * overflows we split it across the fewest requests that still fit — the runner
 * treats the whole thing as one logical news poll regardless of the split.
 *
 * When the campaign has a country ('AU'|'US') we add country=au/us; language is
 * always en. Rows the API flags as duplicate are skipped. pubDate parsing is
 * defensive: NewsData returns UTC by default, so UTC/missing zones become ISO
 * 8601 with a "Z"; a named non-UTC zone we can't resolve is read best-effort.
 *
 * Every field is optional-chained; `raw` keeps the untouched article payload.
 *
 * SERVER-ONLY: takes a resolved api key; never import from client components.
 */

import type { Json, NormalizedMentionInput } from "./types";

const BASE_URL = "https://newsdata.io";
const SEARCH_PATH = "/api/1/latest";
const REQUEST_TIMEOUT_MS = 25_000;
const MAX_Q_ENCODED = 512; // q ≤ 512 chars once URL-encoded
const PAGE_SIZE = "10";
const LOG_PREFIX = "[ingest:newsdata]";

/**
 * Typed error carrying the HTTP status so the runner can react — notably 429
 * (rate limited), which on the free tier means the campaign is out of credits.
 */
export class NewsDataError extends Error {
  readonly status: number;
  readonly outOfCredits: boolean;
  constructor(status: number, message: string) {
    super(message);
    this.name = "NewsDataError";
    this.status = status;
    this.outOfCredits = status === 429;
  }
}

/** GET the NewsData latest endpoint, throwing NewsDataError on non-200. */
async function ndGet(
  params: Record<string, string>
): Promise<Record<string, unknown>> {
  const url = new URL(SEARCH_PATH, BASE_URL);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: "GET",
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new NewsDataError(0, `request failed: ${reason}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    // Map the documented error codes; 429 is distinct (out of credits on free).
    const detail =
      res.status === 401
        ? "bad api key"
        : res.status === 429
          ? "rate limited (out of credits)"
          : res.status === 400
            ? "bad request params"
            : `server responded ${res.status}`;
    throw new NewsDataError(res.status, detail);
  }

  const body = (await res.json()) as Record<string, unknown>;
  const remaining =
    asNum(body["remainingCredits"]) ?? asNum(body["creditsRemaining"]);
  if (remaining !== null) {
    console.log(`${LOG_PREFIX} remainingCredits=${remaining}`);
  }
  return body;
}

// ---- helpers ------------------------------------------------------------

/** Coerce an unknown to a plain record, or an empty object. */
function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}
/** Coerce an unknown to a string, or null when absent/non-scalar. */
function asStr(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return null;
}
/** Coerce an unknown to a finite number, or null. */
function asNum(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Parse NewsData's "YYYY-MM-DD HH:MM:SS" pubDate (in the pubDateTZ zone) into
 * ISO 8601. UTC/missing zones become "…T…Z" (parsed as UTC). A named non-UTC
 * zone can't be resolved without an offset table, so we parse the bare
 * timestamp in the runtime zone as a best effort — `raw` keeps the original.
 */
function parsePubDate(pubDate: unknown, pubDateTZ: unknown): string | null {
  const raw = asStr(pubDate);
  if (!raw) return null;
  const tz = asStr(pubDateTZ);
  const asUtc = !tz || tz.trim().toUpperCase() === "UTC";
  const base = raw.trim().replace(" ", "T");
  const parsed = new Date(asUtc ? `${base}Z` : base);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * Build one or more `q` values from the campaign keywords, each a quoted OR
 * chain that stays ≤512 chars once URL-encoded. Normally this is a single
 * query; it only splits when a campaign has enough (or long enough) keywords to
 * overflow the URL budget.
 */
function buildQueries(keywords: string[]): string[] {
  const quoted = keywords
    .map((k) => k.trim())
    .filter((k) => k.length > 0)
    // Strip embedded quotes so the OR grammar stays valid.
    .map((k) => `"${k.replace(/"/g, "")}"`);

  const batches: string[] = [];
  let current = "";
  for (const term of quoted) {
    const candidate = current ? `${current} OR ${term}` : term;
    if (encodeURIComponent(candidate).length <= MAX_Q_ENCODED) {
      current = candidate;
      continue;
    }
    // candidate overflows: flush what we have, then restart with this term.
    if (current) batches.push(current);
    current = term;
    // Pathological: a single quoted term already exceeds the budget — send it
    // solo (NewsData will cope) rather than silently drop the keyword.
    if (encodeURIComponent(current).length > MAX_Q_ENCODED) {
      batches.push(current);
      current = "";
    }
  }
  if (current) batches.push(current);
  return batches;
}

// ---- normalizer ---------------------------------------------------------

/** Normalize one NewsData `results` page; skips API-flagged duplicates. */
function normalizeNews(body: Record<string, unknown>): NormalizedMentionInput[] {
  const list = Array.isArray(body["results"])
    ? (body["results"] as unknown[])
    : [];
  const out: NormalizedMentionInput[] = [];
  for (const item of list) {
    const a = asObj(item);
    if (a["duplicate"] === true) continue; // skip syndicated duplicates
    const externalId = asStr(a["article_id"]);
    if (!externalId) continue; // no id → cannot dedupe, skip
    out.push({
      source: "newsdata",
      platform: "news",
      media_type: "news",
      external_id: externalId,
      url: asStr(a["link"]),
      author: asStr(a["source_name"]),
      author_followers: null,
      title: asStr(a["title"]),
      body: asStr(a["description"]), // ignore full content
      published_at: parsePubDate(a["pubDate"], a["pubDateTZ"]),
      raw: a as Json,
    });
  }
  return out;
}

/**
 * Search news for a campaign's keywords in one batched OR query (splitting only
 * when the query would exceed the URL budget) and return normalized mentions
 * (without campaign_id). `country` is the campaign country ('AU'|'US'); it is
 * lowercased to the NewsData country code. Throws NewsDataError on non-200.
 */
export async function searchNews(
  apiKey: string,
  keywords: string[],
  country?: string
): Promise<NormalizedMentionInput[]> {
  const queries = buildQueries(keywords);
  const out: NormalizedMentionInput[] = [];
  const seen = new Set<string>();

  for (const q of queries) {
    const params: Record<string, string> = {
      apikey: apiKey,
      q,
      language: "en",
      size: PAGE_SIZE,
      removeduplicate: "1",
    };
    if (country) params.country = country.toLowerCase();

    const body = await ndGet(params);
    for (const row of normalizeNews(body)) {
      if (seen.has(row.external_id)) continue;
      seen.add(row.external_id);
      out.push(row);
    }
  }
  return out;
}
