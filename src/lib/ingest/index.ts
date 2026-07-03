/**
 * Ingest runner (§ingest). Orchestrates the ScrapeCreators keyword-search
 * adapter across every active campaign: resolves per-campaign credentials
 * (BYOK, platform-env fallback), loads active keywords, and sweeps a
 * platform×keyword grid sequentially — politeness plus serverless simplicity,
 * and we stay well under any concurrency limit for free. Normalized rows are
 * upserted into `mentions` with ignoreDuplicates so re-polls no-op against the
 * (campaign_id, source, external_id) unique index.
 *
 * Budget guards: a global request cap per run (INGEST_MAX_REQUESTS) stops the
 * sweep cleanly, and a 402 (out of credits) aborts the current campaign's
 * remaining calls — no point burning retries. One bad platform×keyword logs,
 * counts, and continues; it never kills the run.
 *
 * SERVER-ONLY: uses the service-role Supabase client and resolves secrets.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { resolveCredentials } from "@/lib/integrations";
import { searchPlatform, ScrapeCreatorsError } from "./scrapecreators";
import type {
  CampaignSummary,
  IngestError,
  IngestPlatform,
  NormalizedMention,
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
}
interface KeywordRow {
  term: string;
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
    .select("id, slug")
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
      inserted: 0,
      skippedDuplicates: 0,
      errors: [],
    };
    summary.campaigns.push(campaignSummary);

    // ---- credentials (campaign BYOK wins; skip when neither key exists) ----
    const { credentials } = await resolveCredentials(campaign.id, "scrapecreators");
    const apiKey = credentials?.api_key;
    if (!apiKey) {
      console.log(`${LOG_PREFIX} skip ${campaign.slug}: no credentials`);
      campaignSummary.errors.push({
        platform: "reddit",
        keyword: "*",
        message: "no credentials",
      });
      continue;
    }

    // ---- active keywords (cap at 20) ----
    const { data: keywords, error: keywordsError } = await admin
      .from("keywords")
      .select("term")
      .eq("campaign_id", campaign.id)
      .eq("is_active", true);
    if (keywordsError) {
      campaignSummary.errors.push({
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

    // ---- sequential platform × keyword sweep ----
    let campaignAborted = false; // set on 402
    for (const platform of platforms) {
      if (campaignAborted) break;
      for (const keyword of capped) {
        if (summary.totalRequests >= maxRequests) {
          summary.capped = true;
          break;
        }
        summary.totalRequests += 1;
        campaignSummary.requests += 1;

        try {
          const rows = await searchPlatform(apiKey, platform, keyword);
          if (rows.length === 0) continue;

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

          // With ignoreDuplicates, only newly-inserted rows come back in
          // `insertedRows`; conflicting rows are silently skipped. So inserted
          // is exact, and skippedDuplicates is a best-effort attempted-minus-
          // returned (also counts any rows the DB dropped for other reasons).
          const insertedCount = insertedRows?.length ?? 0;
          campaignSummary.inserted += insertedCount;
          campaignSummary.skippedDuplicates += Math.max(
            0,
            toInsert.length - insertedCount
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const ingestError: IngestError = { platform, keyword, message };
          campaignSummary.errors.push(ingestError);
          console.log(
            `${LOG_PREFIX} error ${campaign.slug}/${platform}/${keyword}: ${message}`
          );
          // 402 → out of credits: abort this campaign's remaining calls.
          if (err instanceof ScrapeCreatorsError && err.outOfCredits) {
            console.log(
              `${LOG_PREFIX} ${campaign.slug}: out of credits, aborting campaign`
            );
            campaignAborted = true;
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

  console.log(
    `${LOG_PREFIX} done: ${summary.campaigns.length} campaigns, ${summary.totalRequests} requests, capped=${summary.capped}`
  );
  return summary;
}
