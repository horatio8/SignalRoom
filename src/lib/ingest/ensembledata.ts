/**
 * EnsembleData TikTok keyword-search adapter (§ingest). One GET against
 * https://ensembledata.com/apis, auth via a `token` query param on every call,
 * 1 unit per request. We fetch a SINGLE page (no cursor-chasing) — each extra
 * page is another unit and the ingest runner has a hard request cap.
 *
 * EnsembleData takes over TikTok whenever a campaign has its key set: the runner
 * removes "tiktok" from the ScrapeCreators sweep so the two never write
 * duplicate rows under different sources (dedupe is per source, external_id).
 *
 * Errors are plain HTTP codes: 422 validation, 491 token not found, 493
 * subscription expired, 495 all daily units used. 493/495 raise the
 * `outOfUnits` flag so the runner aborts this campaign's remaining EnsembleData
 * calls — the same shape as the ScrapeCreators 402 case, scoped to this source.
 *
 * Every field is optional-chained: the API omits keys freely and one missing
 * field must never throw. `raw` keeps the untouched aweme_info payload so
 * enrichment can reach anything we didn't map.
 *
 * SERVER-ONLY: takes a resolved token; never import from client components.
 */

import type { Json, NormalizedMentionInput } from "./types";

const BASE_URL = "https://ensembledata.com/apis";
const REQUEST_TIMEOUT_MS = 25_000;
const LOG_PREFIX = "[ingest:ensembledata]";

/**
 * Typed error carrying the HTTP status so the runner can react — notably 493
 * (subscription expired) and 495 (daily units exhausted), both of which abort a
 * campaign's remaining EnsembleData calls.
 */
export class EnsembleDataError extends Error {
  readonly status: number;
  readonly outOfUnits: boolean;
  constructor(status: number, message: string) {
    super(message);
    this.name = "EnsembleDataError";
    this.status = status;
    this.outOfUnits = status === 493 || status === 495;
  }
}

/** GET an EnsembleData endpoint, throwing EnsembleDataError on non-200. */
async function edGet(
  token: string,
  path: string,
  params: Record<string, string>
): Promise<Record<string, unknown>> {
  // BASE_URL carries a path segment (/apis), so concatenate rather than resolve
  // against it — new URL(path, base) would drop /apis for an absolute path.
  const url = new URL(`${BASE_URL}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("token", token);

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
    throw new EnsembleDataError(0, `request failed: ${reason}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    // Map the documented error codes to readable messages; 493/495 are distinct
    // (out of units) and surface via the outOfUnits flag.
    const detail =
      res.status === 422
        ? "validation error"
        : res.status === 491
          ? "token not found"
          : res.status === 493
            ? "subscription expired"
            : res.status === 495
              ? "all daily units used"
              : `server responded ${res.status}`;
    throw new EnsembleDataError(res.status, detail);
  }

  const body = (await res.json()) as Record<string, unknown>;
  // Log unit usage when the response carries it (field name varies by plan).
  const units =
    asNum(body["units_charged"]) ??
    asNum(body["unit_count"]) ??
    asNum(body["units"]);
  if (units !== null) {
    console.log(`${LOG_PREFIX} units_charged=${units} (${path})`);
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

// ---- normalizer ---------------------------------------------------------

/**
 * TikTok keyword search: envelope is { data: { nextCursor, data: [ {aweme_info}
 * ] } }. Each post lives on aweme_info; we store that untouched as `raw`.
 */
function normalizeTikTok(body: Record<string, unknown>): NormalizedMentionInput[] {
  const envelope = asObj(body["data"]);
  const list = Array.isArray(envelope["data"])
    ? (envelope["data"] as unknown[])
    : [];
  const out: NormalizedMentionInput[] = [];
  for (const item of list) {
    const info = asObj(asObj(item)["aweme_info"]);
    const externalId = asStr(info["aweme_id"]);
    if (!externalId) continue; // no id → cannot dedupe, skip
    const author = asObj(info["author"]);
    const uniqueId = asStr(author["unique_id"]);
    out.push({
      source: "ensembledata",
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

/**
 * Result of one TikTok search: the normalized rows plus, when the response
 * carries it, the account's remaining unit balance. EnsembleData reports
 * `units_charged` (the cost of THIS call) on every response; a remaining
 * balance is plan-dependent and often absent, so `creditsRemaining` stays
 * undefined unless the response actually exposes it.
 */
export interface TikTokSearchResult {
  rows: NormalizedMentionInput[];
  /** Remaining unit balance, when the response reports one. */
  creditsRemaining?: number;
}

/**
 * Search TikTok for one keyword and return normalized mentions (without
 * campaign_id) plus any remaining unit balance. period "1" = last day,
 * sorting "2" = most recent, single page. Throws EnsembleDataError on non-200.
 * De-duped by aweme_id here (the DB unique index is the durable cross-run
 * dedupe).
 */
export async function searchTikTok(
  token: string,
  keyword: string
): Promise<TikTokSearchResult> {
  const body = await edGet(token, "/tt/keyword/search", {
    name: keyword,
    period: "1",
    sorting: "2",
    cursor: "0",
  });
  const rows = normalizeTikTok(body);

  const seen = new Set<string>();
  const deduped: NormalizedMentionInput[] = [];
  for (const row of rows) {
    if (seen.has(row.external_id)) continue;
    seen.add(row.external_id);
    deduped.push(row);
  }

  // Surface a remaining unit balance only when the response exposes one — this
  // is distinct from units_charged (the cost of this call), which edGet logs.
  const remaining =
    asNum(body["units_remaining"]) ??
    asNum(body["remaining_units"]) ??
    asNum(body["balance"]);
  const creditsRemaining = remaining === null ? undefined : remaining;
  return { rows: deduped, creditsRemaining };
}
