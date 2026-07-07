/**
 * GNews keyword-search adapter (§ingest). Batched GET(s) per campaign against
 * https://gnews.io/api/v4/search, auth via an `apikey` query param. GNews is the
 * NEWS FALLBACK: the runner only reaches for it when a campaign has no NewsData
 * key, so the two never write duplicate news rows under different sources.
 *
 * The credit saver mirrors NewsData: instead of one request per keyword, we OR
 * every active keyword into a single `q` ("kw1" OR "kw2" OR …) so a campaign
 * poll costs one request. GNews's query budget is tighter than NewsData's, so we
 * keep the encoded `q` conservative (≤ ~200 chars) and split across the fewest
 * requests that still fit — the runner treats the whole thing as one logical
 * news poll regardless of the split. Free tier is ~100 requests/day.
 *
 * When the campaign has a country ('AU'|'US') we add country=au/us; language is
 * always en and max=10. When a recency window is supplied we pass &from={ISO} so
 * the API returns only recent items.
 *
 * GNews has NO stable article id, so the article `url` is the external_id (the
 * dedupe key); the DB unique index handles repeats. publishedAt is already
 * ISO 8601. Every field is optional-chained; `raw` keeps the untouched article.
 *
 * SERVER-ONLY: takes a resolved api key; never import from client components.
 */

import type { Json, NormalizedMentionInput } from "./types";

const BASE_URL = "https://gnews.io";
const SEARCH_PATH = "/api/v4/search";
const REQUEST_TIMEOUT_MS = 25_000;
// GNews's q budget is tighter than NewsData's (512); keep it conservative.
const MAX_Q_ENCODED = 200;
const MAX_ARTICLES = "10";
const LOG_PREFIX = "[ingest:gnews]";

/**
 * Typed error carrying the HTTP status so the runner can react — notably 429
 * (rate/quota exceeded), which on the free tier (~100 req/day) means the
 * campaign is out of daily requests. 401/403 are a bad/blocked key.
 */
export class GNewsError extends Error {
  readonly status: number;
  readonly outOfCredits: boolean;
  constructor(status: number, message: string) {
    super(message);
    this.name = "GNewsError";
    this.status = status;
    this.outOfCredits = status === 429;
  }
}

/** GET the GNews search endpoint, throwing GNewsError on non-200. */
async function gnGet(
  params: Record<string, string>
): Promise<{ body: Record<string, unknown>; res: Response }> {
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
    throw new GNewsError(0, `request failed: ${reason}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    // Map the documented error codes; 429 is distinct (quota exhausted).
    const detail =
      res.status === 401 || res.status === 403
        ? "bad api key"
        : res.status === 429
          ? "rate/quota exceeded (out of credits)"
          : res.status === 400
            ? "bad request params"
            : `server responded ${res.status}`;
    throw new GNewsError(res.status, detail);
  }

  const body = (await res.json()) as Record<string, unknown>;
  return { body, res };
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
 * Parse GNews's ISO 8601 publishedAt (e.g. "2024-01-01T12:00:00Z") into a
 * normalized ISO string; null when absent or unparseable — `raw` keeps the
 * original either way.
 */
function parsePublishedAt(v: unknown): string | null {
  const raw = asStr(v);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * Surface a remaining-quota reading only when the response body or headers
 * actually expose one. GNews generally does NOT report remaining quota, so this
 * is usually undefined — we never fabricate a balance.
 */
function readRemaining(
  body: Record<string, unknown>,
  res: Response
): number | undefined {
  const fromBody =
    asNum(body["remainingRequests"]) ??
    asNum(body["remaining"]) ??
    asNum(body["creditsRemaining"]);
  if (fromBody !== null) return fromBody;
  const header =
    res.headers.get("x-ratelimit-remaining") ??
    res.headers.get("x-requests-remaining");
  if (header !== null) {
    const n = Number(header);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/**
 * Build one or more `q` values from the campaign keywords, each a quoted OR
 * chain that stays ≤ MAX_Q_ENCODED once URL-encoded. Normally this is a single
 * query; it only splits when a campaign has enough (or long enough) keywords to
 * overflow GNews's tighter query budget.
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
    // solo (GNews will cope/truncate) rather than silently drop the keyword.
    if (encodeURIComponent(current).length > MAX_Q_ENCODED) {
      batches.push(current);
      current = "";
    }
  }
  if (current) batches.push(current);
  return batches;
}

// ---- normalizer ---------------------------------------------------------

/** Normalize one GNews `articles` page; url is both external_id and url. */
function normalizeNews(body: Record<string, unknown>): NormalizedMentionInput[] {
  const list = Array.isArray(body["articles"])
    ? (body["articles"] as unknown[])
    : [];
  const out: NormalizedMentionInput[] = [];
  for (const item of list) {
    const a = asObj(item);
    // GNews has no stable article id → the url IS the dedupe key.
    const url = asStr(a["url"]);
    if (!url) continue; // no url → cannot dedupe, skip
    const source = asObj(a["source"]);
    out.push({
      source: "gnews",
      platform: "news",
      media_type: "news",
      external_id: url,
      url,
      author: asStr(source["name"]),
      author_followers: null,
      title: asStr(a["title"]),
      body: asStr(a["description"]), // ignore full content
      published_at: parsePublishedAt(a["publishedAt"]),
      raw: a as Json,
    });
  }
  return out;
}

/**
 * Result of one GNews poll: normalized rows plus, when the response happens to
 * expose one, a remaining-quota reading. GNews normally omits quota, so
 * `creditsRemaining` is usually undefined — matching the {rows, creditsRemaining}
 * contract ScrapeCreators/EnsembleData return.
 */
export interface NewsSearchResult {
  rows: NormalizedMentionInput[];
  /** Remaining request/quota balance, when the response exposes one. */
  creditsRemaining?: number;
}

/**
 * Search news for a campaign's keywords in one batched OR query (splitting only
 * when the query would exceed GNews's URL budget) and return normalized mentions
 * (without campaign_id) plus any remaining quota. `country` is the campaign
 * country ('AU'|'US'), lowercased to the GNews country code; `fromIso` is an
 * optional recency floor passed through as GNews's `from` param. Throws
 * GNewsError on non-200.
 */
export async function searchNews(
  apiKey: string,
  keywords: string[],
  country?: string,
  fromIso?: string
): Promise<NewsSearchResult> {
  const queries = buildQueries(keywords);
  const out: NormalizedMentionInput[] = [];
  const seen = new Set<string>();
  let creditsRemaining: number | undefined;

  for (const q of queries) {
    const params: Record<string, string> = {
      apikey: apiKey,
      q,
      lang: "en",
      max: MAX_ARTICLES,
    };
    if (country) params.country = country.toLowerCase();
    if (fromIso) params.from = fromIso;

    const { body, res } = await gnGet(params);
    const remaining = readRemaining(body, res);
    if (remaining !== undefined) {
      creditsRemaining = remaining;
      console.log(`${LOG_PREFIX} remainingRequests=${remaining}`);
    }
    for (const row of normalizeNews(body)) {
      if (seen.has(row.external_id)) continue;
      seen.add(row.external_id);
      out.push(row);
    }
  }
  return { rows: out, creditsRemaining };
}
