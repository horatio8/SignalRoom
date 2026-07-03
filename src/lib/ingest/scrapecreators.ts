/**
 * ScrapeCreators keyword-search adapter (§ingest). One GET per platform×keyword
 * against https://api.scrapecreators.com, auth via `x-api-key`, 1 credit per
 * request. We fetch a SINGLE page per call — no pagination-chasing, because each
 * follow-up page is another credit and the ingest runner has a hard request cap.
 *
 * Covered: TikTok, YouTube, Reddit, Threads, Instagram reels. Intentionally NOT
 * covered (no such endpoint exists): X/Twitter keyword search, Facebook keyword
 * post search, LinkedIn (deferred).
 *
 * Every normalizer optional-chains every field: the API omits fields freely and
 * a single missing key must never throw. `raw` keeps the untouched item so
 * enrichment can reach anything we didn't map.
 *
 * SERVER-ONLY: takes a resolved api key; never import from client components.
 */

import type {
  IngestPlatform,
  Json,
  NormalizedMentionInput,
} from "./types";

const BASE_URL = "https://api.scrapecreators.com";
const REQUEST_TIMEOUT_MS = 25_000;
const LOG_PREFIX = "[ingest:scrapecreators]";

/**
 * Typed error carrying the HTTP status so the runner can react — notably 402
 * (out of credits) which aborts a campaign's remaining calls.
 */
export class ScrapeCreatorsError extends Error {
  readonly status: number;
  readonly outOfCredits: boolean;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ScrapeCreatorsError";
    this.status = status;
    this.outOfCredits = status === 402;
  }
}

/** GET a ScrapeCreators endpoint, throwing ScrapeCreatorsError on non-200. */
async function scGet(
  apiKey: string,
  path: string,
  params: Record<string, string>
): Promise<Record<string, unknown>> {
  const url = new URL(path, BASE_URL);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: "GET",
      headers: { "x-api-key": apiKey, accept: "application/json" },
      signal: controller.signal,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new ScrapeCreatorsError(0, `request failed: ${reason}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    // Map the documented error codes to readable messages; 402 is distinct.
    const detail =
      res.status === 402
        ? "out of credits"
        : res.status === 401
          ? "bad api key"
          : res.status === 400
            ? "bad request params"
            : `server responded ${res.status}`;
    throw new ScrapeCreatorsError(res.status, detail);
  }

  const body = (await res.json()) as Record<string, unknown>;
  const credits = body["credits_remaining"];
  if (typeof credits === "number") {
    console.log(`${LOG_PREFIX} credits_remaining=${credits} (${path})`);
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
/** Unix seconds → ISO 8601, or null when absent/invalid. */
function unixToIso(v: unknown): string | null {
  const n = asNum(v);
  if (n === null || n <= 0) return null;
  return new Date(n * 1000).toISOString();
}

// ---- per-platform normalizers ------------------------------------------

/** TikTok: GET /v1/tiktok/search/keyword — items on aweme_info. */
function normalizeTikTok(body: Record<string, unknown>): NormalizedMentionInput[] {
  const list = Array.isArray(body["search_item_list"])
    ? (body["search_item_list"] as unknown[])
    : [];
  const out: NormalizedMentionInput[] = [];
  for (const item of list) {
    const info = asObj(asObj(item)["aweme_info"]);
    const externalId = asStr(info["aweme_id"]);
    if (!externalId) continue; // no id → cannot dedupe, skip
    const author = asObj(info["author"]);
    const stats = asObj(info["statistics"]);
    const uniqueId = asStr(author["unique_id"]);
    out.push({
      source: "scrapecreators",
      platform: "tiktok",
      media_type: "social",
      external_id: externalId,
      url: uniqueId
        ? `https://www.tiktok.com/@${uniqueId}/video/${externalId}`
        : null,
      author: asStr(author["nickname"]) ?? uniqueId,
      author_followers: asNum(author["follower_count"]),
      title: null,
      body: asStr(info["desc"]),
      published_at: unixToIso(info["create_time"]),
      raw: info as Json,
    });
  }
  return out;
}

/** YouTube: GET /v1/youtube/search — items in `videos`. */
function normalizeYouTube(body: Record<string, unknown>): NormalizedMentionInput[] {
  const list = Array.isArray(body["videos"]) ? (body["videos"] as unknown[]) : [];
  const out: NormalizedMentionInput[] = [];
  for (const item of list) {
    const v = asObj(item);
    const externalId = asStr(v["id"]);
    if (!externalId) continue;
    const channel = asObj(v["channel"]);
    // publishedTime is a relative string ("2 hours ago") from this endpoint —
    // not a parseable timestamp, so leave published_at null rather than guess.
    out.push({
      source: "scrapecreators",
      platform: "youtube",
      media_type: "social",
      external_id: externalId,
      url: asStr(v["url"]) ?? `https://www.youtube.com/watch?v=${externalId}`,
      author: asStr(channel["title"]) ?? asStr(channel["handle"]),
      author_followers: null,
      title: asStr(v["title"]),
      body: asStr(v["title"]),
      published_at: null,
      raw: v as Json,
    });
  }
  return out;
}

/** Reddit: GET /v1/reddit/search — native post objects in `posts`. */
function normalizeReddit(body: Record<string, unknown>): NormalizedMentionInput[] {
  const list = Array.isArray(body["posts"]) ? (body["posts"] as unknown[]) : [];
  const out: NormalizedMentionInput[] = [];
  for (const item of list) {
    const p = asObj(item);
    const externalId = asStr(p["name"]); // t3_…
    if (!externalId) continue;
    const permalink = asStr(p["permalink"]);
    out.push({
      source: "scrapecreators",
      platform: "reddit",
      media_type: "social",
      external_id: externalId,
      url: permalink ? `https://www.reddit.com${permalink}` : null,
      author: asStr(p["author"]),
      author_followers: null,
      title: asStr(p["title"]),
      body: asStr(p["selftext"]),
      published_at: asStr(p["created_at_iso"]), // already ISO 8601
      raw: p as Json,
    });
  }
  return out;
}

/** Threads: GET /v1/threads/search — max 10 posts, no pagination. */
function normalizeThreads(body: Record<string, unknown>): NormalizedMentionInput[] {
  // Response shape varies; accept `posts` or a bare array under `data`.
  const list = Array.isArray(body["posts"])
    ? (body["posts"] as unknown[])
    : Array.isArray(body["data"])
      ? (body["data"] as unknown[])
      : [];
  const out: NormalizedMentionInput[] = [];
  for (const item of list) {
    const p = asObj(item);
    const externalId = asStr(p["id"]) ?? asStr(p["pk"]);
    if (!externalId) continue;
    const user = asObj(p["user"]);
    const caption = asObj(p["caption"]);
    const username = asStr(user["username"]);
    // URL needs a post `code`; the docs warn it is not reliably derivable, so
    // build it only when a code is present, else null.
    const code = asStr(p["code"]);
    out.push({
      source: "scrapecreators",
      platform: "threads",
      media_type: "social",
      external_id: externalId,
      url:
        code && username
          ? `https://www.threads.net/@${username}/post/${code}`
          : null,
      author: username,
      author_followers: null,
      title: null,
      body: asStr(caption["text"]),
      published_at: unixToIso(p["taken_at"]),
      raw: p as Json,
    });
  }
  return out;
}

/** Instagram reels: GET /v2/instagram/reels/search — items in `reels`|`posts`. */
function normalizeInstagram(body: Record<string, unknown>): NormalizedMentionInput[] {
  const list = Array.isArray(body["reels"])
    ? (body["reels"] as unknown[])
    : Array.isArray(body["posts"])
      ? (body["posts"] as unknown[])
      : [];
  const out: NormalizedMentionInput[] = [];
  for (const item of list) {
    const r = asObj(item);
    const shortcode = asStr(r["shortcode"]);
    if (!shortcode) continue;
    const owner = asObj(r["owner"]);
    const caption = r["caption"];
    // caption may be a string or an object with `.text`.
    const captionText =
      typeof caption === "string" ? caption : asStr(asObj(caption)["text"]);
    out.push({
      source: "scrapecreators",
      platform: "instagram",
      media_type: "social",
      external_id: shortcode,
      url: asStr(r["url"]) ?? `https://www.instagram.com/reel/${shortcode}/`,
      author: asStr(owner["username"]) ?? asStr(owner["full_name"]),
      author_followers: asNum(owner["follower_count"]),
      title: null,
      body: captionText,
      published_at: unixToIso(r["taken_at"]),
      raw: r as Json,
    });
  }
  return out;
}

// ---- endpoint dispatch --------------------------------------------------

/** Per-platform request config + normalizer. */
const PLATFORMS: Record<
  IngestPlatform,
  {
    path: string;
    params: (keyword: string) => Record<string, string>;
    normalize: (body: Record<string, unknown>) => NormalizedMentionInput[];
  }
> = {
  tiktok: {
    path: "/v1/tiktok/search/keyword",
    params: (q) => ({ query: q, date_posted: "yesterday", sort_by: "date-posted" }),
    normalize: normalizeTikTok,
  },
  youtube: {
    path: "/v1/youtube/search",
    params: (q) => ({ query: q, uploadDate: "today", type: "videos" }),
    normalize: normalizeYouTube,
  },
  reddit: {
    path: "/v1/reddit/search",
    params: (q) => ({ query: q, sort: "new", timeframe: "day" }),
    normalize: normalizeReddit,
  },
  threads: {
    path: "/v1/threads/search",
    params: (q) => ({ query: q }),
    normalize: normalizeThreads,
  },
  instagram: {
    path: "/v2/instagram/reels/search",
    params: (q) => ({ query: q, date_posted: "last-day", page: "1" }),
    normalize: normalizeInstagram,
  },
};

/**
 * Search one platform for one keyword and return normalized mentions (without
 * campaign_id). Single page, one credit. Throws ScrapeCreatorsError on non-200;
 * TikTok is de-duped by aweme_id here since the docs warn of intra-response
 * duplicates (the DB unique index is the durable dedupe across runs).
 */
export async function searchPlatform(
  apiKey: string,
  platform: IngestPlatform,
  keyword: string
): Promise<NormalizedMentionInput[]> {
  const cfg = PLATFORMS[platform];
  const body = await scGet(apiKey, cfg.path, cfg.params(keyword));
  const rows = cfg.normalize(body);

  // Drop intra-response duplicate external_ids (TikTok especially).
  const seen = new Set<string>();
  const deduped: NormalizedMentionInput[] = [];
  for (const row of rows) {
    if (seen.has(row.external_id)) continue;
    seen.add(row.external_id);
    deduped.push(row);
  }
  return deduped;
}
