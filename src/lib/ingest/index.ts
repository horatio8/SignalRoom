/**
 * Ingest runner (§ingest). Orchestrates three keyword-search sources across
 * every active campaign, resolving per-campaign credentials (BYOK, platform-env
 * fallback) and loading active keywords once, shared by all sources. Normalized
 * rows are upserted into `mentions` with ignoreDuplicates so re-polls no-op
 * against the (campaign_id, source, external_id) unique index.
 *
 * SOURCE ROUTING — dedupe is per (campaign_id, source, external_id), so each
 * platform must be owned by exactly one source or the same post lands twice
 * under different sources. Per campaign:
 *   • ScrapeCreators sweeps the social platform×keyword grid as today.
 *   • EnsembleData, when the campaign keys it, TAKES OVER TikTok: "tiktok" is
 *     removed from the ScrapeCreators sweep and polled via EnsembleData instead.
 *   • NewsData, when keyed, runs ONE batched OR query per campaign (all keywords
 *     in a single request) — the news credit saver, and the PRIMARY news source.
 *   • GNews is the news GAP-FILLER: when keyed it runs ALONGSIDE NewsData, but
 *     before persisting its rows the runner drops any story already captured for
 *     the campaign — matched on a normalized URL or title against the NewsData
 *     rows just fetched this run AND the campaign's recent `mentions` news rows.
 *     Only net-new GNews stories are stored (counted as crossSourceSkipped when
 *     dropped). When only ONE news source is keyed, that one runs on its own.
 *
 * SOURCE SELECTION — runIngest accepts an optional { only?: IngestSource[] } to
 * restrict which sources run; sources outside `only` are skipped entirely (no
 * credentials resolved, no requests). The GNews gap-filler still dedupes against
 * existing DB news even in an only:['gnews'] backfill, so it never re-stores what
 * NewsData already persisted.
 *
 * RECENCY FILTER — every source's normalized rows pass through a recency gate
 * before persist: any row whose published_at is non-null AND older than now −
 * INGEST_MAX_AGE_DAYS (default 30) is dropped and counted (droppedStale). Rows
 * with a null published_at are kept (age can't be judged). The same window is
 * pushed into the news adapters' native date filters (NewsData timeframe, GNews
 * from) so the APIs return less stale junk in the first place.
 *
 * Budget guards: a global request cap per run (INGEST_MAX_REQUESTS) stops the
 * run cleanly and is shared across all sources. Out-of-credit signals are scoped
 * to their own source — ScrapeCreators 402, EnsembleData 493/495, NewsData 429,
 * and GNews 429 each abort only that source's remaining calls for the campaign,
 * never the others. One bad request logs, counts, and continues; it never kills
 * the run.
 *
 * SERVER-ONLY: uses the service-role Supabase client and resolves secrets.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { resolveCredentials } from "@/lib/integrations.server";
import { searchPlatform, ScrapeCreatorsError } from "./scrapecreators";
import { searchTikTok, EnsembleDataError } from "./ensembledata";
import { searchNews, NewsDataError } from "./newsdata";
import { searchNews as searchGNews, GNewsError } from "./gnews";
import type {
  CampaignSummary,
  IngestError,
  IngestPlatform,
  IngestSource,
  NormalizedMention,
  NormalizedMentionInput,
  Summary,
} from "./types";

const LOG_PREFIX = "[ingest]";
const DEFAULT_PLATFORMS: IngestPlatform[] = [
  "reddit",
  "youtube",
  "tiktok",
  "threads",
  "instagram",
];
const ALL_PLATFORMS = new Set<IngestPlatform>(DEFAULT_PLATFORMS);
const KEYWORD_CAP = 20;
const DEFAULT_MAX_REQUESTS = 60;
const DEFAULT_MAX_AGE_DAYS = 30;
const MS_PER_DAY = 86_400_000;

/** Parse INGEST_PLATFORMS (comma list) → validated platform set, or default. */
function resolvePlatforms(): IngestPlatform[] {
  const raw = process.env.INGEST_PLATFORMS;
  if (!raw) return DEFAULT_PLATFORMS;
  const parsed = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is IngestPlatform => ALL_PLATFORMS.has(s as IngestPlatform));
  return parsed.length ? parsed : DEFAULT_PLATFORMS;
}

/** Parse INGEST_MAX_REQUESTS → positive int, or default. */
function resolveMaxRequests(): number {
  const raw = Number(process.env.INGEST_MAX_REQUESTS);
  return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_MAX_REQUESTS;
}

/** Parse INGEST_MAX_AGE_DAYS → positive int (days), or default (30). */
function resolveMaxAgeDays(): number {
  const raw = Number(process.env.INGEST_MAX_AGE_DAYS);
  return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_MAX_AGE_DAYS;
}

/**
 * Cross-source news dedupe keys (§ingest CHANGE 1). Two news items are treated
 * as the same story when they share a normalized URL OR a normalized title.
 * This catches same-URL syndication and identical headlines reprinted across
 * outlets — it does NOT catch every semantically-duplicate story rewritten with
 * a different headline on a different domain. That would need a similarity model;
 * URL/title matching is a cheap, deterministic way to minimize obvious
 * redundancy between NewsData (primary) and the GNews gap-filler.
 */

/**
 * Normalize a URL to a comparison key: lowercase, strip protocol (and any
 * protocol-relative `//`), strip a leading `www.`, drop the query string and
 * fragment, and strip trailing slashes. Returns null when nothing remains.
 */
function normalizeUrlKey(url: string | null | undefined): string | null {
  if (!url) return null;
  let s = url.trim().toLowerCase();
  if (!s) return null;
  const hash = s.indexOf("#");
  if (hash !== -1) s = s.slice(0, hash); // strip fragment
  const query = s.indexOf("?");
  if (query !== -1) s = s.slice(0, query); // strip query string
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, ""); // strip scheme://
  s = s.replace(/^\/\//, ""); // strip protocol-relative //
  s = s.replace(/^www\./, ""); // strip leading www.
  s = s.replace(/\/+$/, ""); // strip trailing slash(es)
  return s.length ? s : null;
}

/**
 * Normalize a title to a comparison key: lowercase, collapse internal runs of
 * whitespace to a single space, and trim. Returns null when nothing remains.
 */
function normalizeTitleKey(title: string | null | undefined): string | null {
  if (!title) return null;
  const s = title.toLowerCase().replace(/\s+/g, " ").trim();
  return s.length ? s : null;
}

/**
 * Add a captured news item's normalized URL and title keys to a dedupe set.
 * Keys are namespaced (`u:` / `t:`) so a URL can never collide with a title.
 */
function addCapturedNewsKeys(
  set: Set<string>,
  item: { url?: string | null; title?: string | null }
): void {
  const u = normalizeUrlKey(item.url);
  if (u) set.add(`u:${u}`);
  const t = normalizeTitleKey(item.title);
  if (t) set.add(`t:${t}`);
}

/** True when the item's normalized URL OR title already appears in the set. */
function isNewsAlreadyCaptured(
  set: Set<string>,
  item: { url?: string | null; title?: string | null }
): boolean {
  const u = normalizeUrlKey(item.url);
  if (u && set.has(`u:${u}`)) return true;
  const t = normalizeTitleKey(item.title);
  if (t && set.has(`t:${t}`)) return true;
  return false;
}

interface CampaignRow {
  id: string;
  slug: string;
  country: string | null;
}
interface KeywordRow {
  term: string;
}

/** NewsData country param, or undefined when the campaign has no valid one. */
function newsCountry(country: string | null): string | undefined {
  return country === "AU" || country === "US" ? country : undefined;
}

/**
 * Best-effort human-readable message for any thrown value. Error → .message;
 * a plain object carrying a string `message` (e.g. a Supabase PostgrestError) →
 * that message plus its `code`/`details` when present; any other object → JSON;
 * else String(). Prevents "[object Object]" from masking real failures.
 */
function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const o = err as Record<string, unknown>;
    if (typeof o.message === "string") {
      const parts = [o.message];
      if (typeof o.code === "string") parts.push(`(${o.code})`);
      if (typeof o.details === "string" && o.details) parts.push(o.details);
      return parts.join(" ");
    }
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return String(err);
}

/**
 * Run one ingest pass across all active campaigns. Returns a structured
 * summary; throws only when Supabase admin is unconfigured (nothing to do).
 *
 * `opts.only` restricts which sources run: when set (and non-empty), sources not
 * listed are skipped entirely — no credentials resolved, no requests. Undefined
 * (or empty) runs all sources as usual.
 */
export async function runIngest(opts?: {
  only?: IngestSource[];
}): Promise<Summary> {
  const admin = supabaseAdmin();
  if (!admin) {
    throw new Error(
      "ingest not configured: Supabase service role client unavailable"
    );
  }

  // Which sources are allowed to run this pass. null → all sources.
  const only =
    opts?.only && opts.only.length ? new Set<IngestSource>(opts.only) : null;
  const sourceEnabled = (s: IngestSource): boolean => !only || only.has(s);
  if (only) {
    console.log(
      `${LOG_PREFIX} source filter active: only [${[...only].join(", ")}]`
    );
  }

  const platforms = resolvePlatforms();
  const maxRequests = resolveMaxRequests();
  const maxAgeDays = resolveMaxAgeDays();
  // Recency floor shared by the filter and pushed into the news adapters' native
  // date params so the APIs return fewer stale items in the first place.
  const staleCutoffMs = Date.now() - maxAgeDays * MS_PER_DAY;
  const fromIso = new Date(staleCutoffMs).toISOString();

  const { data: campaigns, error: campaignsError } = await admin
    .from("campaigns")
    .select("id, slug, country")
    .eq("status", "active");
  if (campaignsError) {
    throw new Error(`ingest: failed to load campaigns — ${campaignsError.message}`);
  }

  const summary: Summary = {
    campaigns: [],
    totalRequests: 0,
    capped: false,
    droppedStale: 0,
    crossSourceSkipped: 0,
    credits: {},
  };

  for (const campaign of (campaigns ?? []) as CampaignRow[]) {
    if (summary.totalRequests >= maxRequests) {
      summary.capped = true;
      break;
    }

    const campaignSummary: CampaignSummary = {
      slug: campaign.slug,
      requests: 0,
      requestsBySource: {
        scrapecreators: 0,
        ensembledata: 0,
        newsdata: 0,
        gnews: 0,
      },
      inserted: 0,
      skippedDuplicates: 0,
      droppedStale: 0,
      crossSourceSkipped: 0,
      errors: [],
    };
    summary.campaigns.push(campaignSummary);

    // ---- credentials for the enabled sources (campaign BYOK wins per service).
    //      A source excluded by `only` resolves no credentials and stays null,
    //      so it runs no requests. ----
    const keyFor = async (s: IngestSource): Promise<string | null> => {
      if (!sourceEnabled(s)) return null;
      const creds = await resolveCredentials(campaign.id, s);
      return creds.credentials?.api_key ?? null;
    };
    const [scKey, edKey, ndKey, gnKey] = await Promise.all([
      keyFor("scrapecreators"),
      keyFor("ensembledata"),
      keyFor("newsdata"),
      keyFor("gnews"),
    ]);
    if (!scKey && !edKey && !ndKey && !gnKey) {
      console.log(`${LOG_PREFIX} skip ${campaign.slug}: no credentials`);
      campaignSummary.errors.push({
        source: "scrapecreators",
        platform: "reddit",
        keyword: "*",
        message: "no credentials",
      });
      continue;
    }

    // ---- active keywords (cap at 20), shared by every source ----
    const { data: keywords, error: keywordsError } = await admin
      .from("keywords")
      .select("term")
      .eq("campaign_id", campaign.id)
      .eq("is_active", true);
    if (keywordsError) {
      campaignSummary.errors.push({
        source: "scrapecreators",
        platform: "reddit",
        keyword: "*",
        message: `failed to load keywords — ${keywordsError.message}`,
      });
      continue;
    }
    const terms = ((keywords ?? []) as KeywordRow[])
      .map((k) => k.term)
      .filter((t): t is string => typeof t === "string" && t.length > 0);
    if (terms.length > KEYWORD_CAP) {
      console.log(
        `${LOG_PREFIX} ${campaign.slug}: ${terms.length} active keywords, capping at ${KEYWORD_CAP}`
      );
    }
    const capped = terms.slice(0, KEYWORD_CAP);

    // ---- source routing: EnsembleData takes over TikTok when keyed ----
    const useEnsembleForTikTok = edKey !== null;
    const scPlatforms = useEnsembleForTikTok
      ? platforms.filter((p) => p !== "tiktok")
      : platforms;
    if (useEnsembleForTikTok && platforms.includes("tiktok")) {
      console.log(
        `${LOG_PREFIX} ${campaign.slug}: routing tiktok → ensembledata (removed from scrapecreators sweep)`
      );
    }

    // Upsert normalized rows and update the campaign's insert/duplicate counts.
    // With ignoreDuplicates, only newly-inserted rows return, so `inserted` is
    // exact and `skippedDuplicates` is a best-effort attempted-minus-returned
    // (also counts any rows the DB dropped for other reasons).
    const persist = async (rows: NormalizedMentionInput[]): Promise<void> => {
      if (rows.length === 0) return;
      // Recency gate (applies to EVERY source): drop rows whose published_at is
      // non-null AND older than the cutoff. Null published_at is kept — age is
      // unknowable, so enrichment/feed decide. Dropped rows never reach the DB.
      const fresh: NormalizedMentionInput[] = [];
      for (const r of rows) {
        if (r.published_at !== null) {
          const t = new Date(r.published_at).getTime();
          if (!Number.isNaN(t) && t < staleCutoffMs) {
            campaignSummary.droppedStale += 1;
            summary.droppedStale += 1;
            continue;
          }
        }
        fresh.push(r);
      }
      if (fresh.length === 0) return;
      const toInsert: NormalizedMention[] = fresh.map((r) => ({
        ...r,
        campaign_id: campaign.id,
      }));
      const { data: insertedRows, error: insertError } = await admin
        .from("mentions")
        .upsert(toInsert, {
          onConflict: "campaign_id,source,external_id",
          ignoreDuplicates: true,
        })
        .select("id");
      if (insertError) throw insertError;
      const insertedCount = insertedRows?.length ?? 0;
      campaignSummary.inserted += insertedCount;
      campaignSummary.skippedDuplicates += Math.max(
        0,
        toInsert.length - insertedCount
      );
    };

    // Record a source failure, log it, and report whether it was out-of-credits.
    const recordError = (
      source: IngestSource,
      platform: IngestError["platform"],
      keyword: string,
      err: unknown
    ): boolean => {
      // Serialize richly: Supabase PostgrestErrors are plain objects, not Error
      // instances, so `String(err)` would collapse them to "[object Object]" and
      // hide the real cause (e.g. an ON CONFLICT mismatch). Prefer .message, then
      // a JSON dump, before falling back to String().
      const message = errMessage(err);
      campaignSummary.errors.push({ source, platform, keyword, message });
      console.log(
        `${LOG_PREFIX} error ${campaign.slug}/${source}/${platform}/${keyword}: ${message}`
      );
      return (
        (err instanceof ScrapeCreatorsError && err.outOfCredits) ||
        (err instanceof EnsembleDataError && err.outOfUnits) ||
        (err instanceof NewsDataError && err.outOfCredits) ||
        (err instanceof GNewsError && err.outOfCredits)
      );
    };

    // ---- ScrapeCreators: social platform × keyword sweep (minus TikTok when
    //      EnsembleData owns it) ----
    let scAborted = false; // set on 402
    if (scKey) {
      for (const platform of scPlatforms) {
        if (scAborted) break;
        for (const keyword of capped) {
          if (summary.totalRequests >= maxRequests) {
            summary.capped = true;
            break;
          }
          summary.totalRequests += 1;
          campaignSummary.requests += 1;
          campaignSummary.requestsBySource.scrapecreators += 1;
          try {
            // Capture the credit balance before persisting so a downstream
            // insert error can't lose the just-observed usage reading.
            const result = await searchPlatform(scKey, platform, keyword);
            if (typeof result.creditsRemaining === "number") {
              summary.credits.scrapecreators = result.creditsRemaining;
            }
            await persist(result.rows);
          } catch (err) {
            if (recordError("scrapecreators", platform, keyword, err)) {
              console.log(
                `${LOG_PREFIX} ${campaign.slug}: scrapecreators out of credits, aborting source`
              );
              scAborted = true;
              break;
            }
          }
        }
        if (summary.totalRequests >= maxRequests) {
          summary.capped = true;
          break;
        }
      }
    }

    // ---- EnsembleData: TikTok keyword sweep (owns TikTok when keyed) ----
    let edAborted = false; // set on 493/495
    if (edKey) {
      for (const keyword of capped) {
        if (edAborted) break;
        if (summary.totalRequests >= maxRequests) {
          summary.capped = true;
          break;
        }
        summary.totalRequests += 1;
        campaignSummary.requests += 1;
        campaignSummary.requestsBySource.ensembledata += 1;
        try {
          const result = await searchTikTok(edKey, keyword);
          if (typeof result.creditsRemaining === "number") {
            summary.credits.ensembledata = result.creditsRemaining;
          }
          await persist(result.rows);
        } catch (err) {
          if (recordError("ensembledata", "tiktok", keyword, err)) {
            console.log(
              `${LOG_PREFIX} ${campaign.slug}: ensembledata out of units, aborting source`
            );
            edAborted = true;
            break;
          }
        }
      }
    }

    // ---- News sweep: NewsData primary, GNews gap-filler (one OR query each) --
    // When both are keyed, NewsData runs first (primary) and GNews runs after as
    // a gap-filler that stores only stories NewsData didn't already capture —
    // matched on a normalized URL/title against this run's NewsData rows AND the
    // campaign's recent DB news. When only one is keyed, that one runs alone.
    const useNewsData = ndKey !== null;
    const useGNews = gnKey !== null;
    if (capped.length > 0 && (useNewsData || useGNews)) {
      const country = newsCountry(campaign.country);
      // Normalized keys of news already captured for THIS campaign, seeded from
      // NewsData rows fetched this run and (for the GNews pass) the campaign's
      // recent DB news. GNews rows matching any key are dropped as redundant.
      const capturedNewsKeys = new Set<string>();

      // --- NewsData (primary) ---
      if (ndKey) {
        if (summary.totalRequests >= maxRequests) {
          summary.capped = true;
        } else {
          summary.totalRequests += 1;
          campaignSummary.requests += 1;
          campaignSummary.requestsBySource.newsdata += 1;
          try {
            // NewsData returns a bare array; timeframe derived from fromIso.
            const ndRows = await searchNews(ndKey, capped, country, fromIso);
            // Seed the dedupe set from every NewsData row fetched this run (even
            // ones the recency gate later drops) so GNews won't re-add them.
            for (const r of ndRows) addCapturedNewsKeys(capturedNewsKeys, r);
            await persist(ndRows);
          } catch (err) {
            // A 429 out-of-credits is already isolated: the single batched call
            // is NewsData's only news work for the campaign, nothing to abort.
            recordError("newsdata", "news", "*", err);
          }
        }
      }

      // --- GNews (gap-filler) ---
      if (gnKey) {
        if (summary.totalRequests >= maxRequests) {
          summary.capped = true;
        } else {
          // Seed the dedupe set with the campaign's recent DB news (url + title
          // only) so the gap-filler also skips stories captured on prior runs,
          // not just this run's NewsData insert. A query failure here is
          // non-fatal — it just means weaker dedupe, so GNews still runs.
          try {
            const { data: recentNews, error: recentNewsError } = await admin
              .from("mentions")
              .select("url, title")
              .eq("campaign_id", campaign.id)
              .eq("media_type", "news")
              .gte("captured_at", fromIso);
            if (recentNewsError) {
              console.log(
                `${LOG_PREFIX} ${campaign.slug}: could not load recent news for dedupe — ${recentNewsError.message}`
              );
            } else {
              for (const r of (recentNews ?? []) as {
                url: string | null;
                title: string | null;
              }[]) {
                addCapturedNewsKeys(capturedNewsKeys, r);
              }
            }
          } catch (err) {
            console.log(
              `${LOG_PREFIX} ${campaign.slug}: could not load recent news for dedupe — ${errMessage(err)}`
            );
          }

          summary.totalRequests += 1;
          campaignSummary.requests += 1;
          campaignSummary.requestsBySource.gnews += 1;
          try {
            // GNews returns {rows, creditsRemaining}; from={ISO} for recency.
            const result = await searchGNews(gnKey, capped, country, fromIso);
            if (typeof result.creditsRemaining === "number") {
              summary.credits.gnews = result.creditsRemaining;
            }
            // Keep only net-new stories: drop any GNews row whose normalized URL
            // or title was already captured (this run's NewsData or recent DB
            // news). Net-new rows are added to the set too, so identical stories
            // within the same GNews batch collapse to one.
            const netNew: NormalizedMentionInput[] = [];
            let covered = 0;
            for (const row of result.rows) {
              if (isNewsAlreadyCaptured(capturedNewsKeys, row)) {
                covered += 1;
                continue;
              }
              addCapturedNewsKeys(capturedNewsKeys, row);
              netNew.push(row);
            }
            campaignSummary.crossSourceSkipped += covered;
            summary.crossSourceSkipped += covered;
            console.log(
              `${LOG_PREFIX} ${campaign.slug}: gnews: ${netNew.length} net-new, ${covered} already covered by newsdata`
            );
            await persist(netNew);
          } catch (err) {
            // A 429 out-of-credits is already isolated: the single batched call
            // is GNews's only news work for the campaign, nothing to abort.
            recordError("gnews", "news", "*", err);
          }
        }
      }
    }

    // ---- per-campaign recency summary ----
    if (campaignSummary.droppedStale > 0) {
      console.log(
        `${LOG_PREFIX} ${campaign.slug}: dropped ${campaignSummary.droppedStale} stale rows older than ${maxAgeDays}d`
      );
    }
  }

  console.log(
    `${LOG_PREFIX} done: ${summary.campaigns.length} campaigns, ${summary.totalRequests} requests, capped=${summary.capped}, droppedStale=${summary.droppedStale}, crossSourceSkipped=${summary.crossSourceSkipped}`
  );

  // ---- record run metrics (§service_runs) ----
  // Persist one usage/cost row so the UI can show real service usage. This is
  // isolated in its own try/catch: a metrics-write failure must never fail or
  // break the ingest run itself, which has already done its real work.
  const processed = summary.campaigns.reduce((n, c) => n + c.inserted, 0);
  const errorCount = summary.campaigns.reduce((n, c) => n + c.errors.length, 0);
  try {
    const { error: metricsError } = await admin.from("service_runs").insert({
      kind: "ingest",
      requests: summary.totalRequests,
      processed,
      errors: errorCount,
      tokens: null,
      detail: summary,
    });
    if (metricsError) {
      console.log(
        `${LOG_PREFIX} failed to record service_runs row: ${metricsError.message}`
      );
    }
  } catch (err) {
    console.log(
      `${LOG_PREFIX} failed to record service_runs row: ${errMessage(err)}`
    );
  }

  return summary;
}
