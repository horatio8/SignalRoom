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
 *     in a single request) — the news credit saver.
 *
 * Budget guards: a global request cap per run (INGEST_MAX_REQUESTS) stops the
 * run cleanly and is shared across all three sources. Out-of-credit signals are
 * scoped to their own source — ScrapeCreators 402, EnsembleData 493/495, and
 * NewsData 429 each abort only that source's remaining calls for the campaign,
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
 * Run one ingest pass across all active campaigns. Returns a structured
 * summary; throws only when Supabase admin is unconfigured (nothing to do).
 */
export async function runIngest(): Promise<Summary> {
  const admin = supabaseAdmin();
  if (!admin) {
    throw new Error(
      "ingest not configured: Supabase service role client unavailable"
    );
  }

  const platforms = resolvePlatforms();
  const maxRequests = resolveMaxRequests();

  const { data: campaigns, error: campaignsError } = await admin
    .from("campaigns")
    .select("id, slug, country")
    .eq("status", "active");
  if (campaignsError) {
    throw new Error(`ingest: failed to load campaigns — ${campaignsError.message}`);
  }

  const summary: Summary = { campaigns: [], totalRequests: 0, capped: false };

  for (const campaign of (campaigns ?? []) as CampaignRow[]) {
    if (summary.totalRequests >= maxRequests) {
      summary.capped = true;
      break;
    }

    const campaignSummary: CampaignSummary = {
      slug: campaign.slug,
      requests: 0,
      requestsBySource: { scrapecreators: 0, ensembledata: 0, newsdata: 0 },
      inserted: 0,
      skippedDuplicates: 0,
      errors: [],
    };
    summary.campaigns.push(campaignSummary);

    // ---- credentials for all three sources (campaign BYOK wins per service) ----
    const [scCreds, edCreds, ndCreds] = await Promise.all([
      resolveCredentials(campaign.id, "scrapecreators"),
      resolveCredentials(campaign.id, "ensembledata"),
      resolveCredentials(campaign.id, "newsdata"),
    ]);
    const scKey = scCreds.credentials?.api_key ?? null;
    const edKey = edCreds.credentials?.api_key ?? null;
    const ndKey = ndCreds.credentials?.api_key ?? null;
    if (!scKey && !edKey && !ndKey) {
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
      const toInsert: NormalizedMention[] = rows.map((r) => ({
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
      const message = err instanceof Error ? err.message : String(err);
      campaignSummary.errors.push({ source, platform, keyword, message });
      console.log(
        `${LOG_PREFIX} error ${campaign.slug}/${source}/${platform}/${keyword}: ${message}`
      );
      return (
        (err instanceof ScrapeCreatorsError && err.outOfCredits) ||
        (err instanceof EnsembleDataError && err.outOfUnits) ||
        (err instanceof NewsDataError && err.outOfCredits)
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
            await persist(await searchPlatform(scKey, platform, keyword));
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
          await persist(await searchTikTok(edKey, keyword));
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

    // ---- NewsData: one batched OR query per campaign ----
    if (ndKey && capped.length > 0) {
      if (summary.totalRequests >= maxRequests) {
        summary.capped = true;
      } else {
        summary.totalRequests += 1;
        campaignSummary.requests += 1;
        campaignSummary.requestsBySource.newsdata += 1;
        try {
          await persist(
            await searchNews(ndKey, capped, newsCountry(campaign.country))
          );
        } catch (err) {
          // A 429 out-of-credits is already isolated: the single batched call
          // is this source's only work for the campaign, so there is nothing
          // further to abort.
          recordError("newsdata", "news", "*", err);
        }
      }
    }
  }

  console.log(
    `${LOG_PREFIX} done: ${summary.campaigns.length} campaigns, ${summary.totalRequests} requests, capped=${summary.capped}`
  );
  return summary;
}
