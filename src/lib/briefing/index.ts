/**
 * Daily briefing generator (spec §6). For each active campaign it gathers the
 * last 24h of enriched coverage (relevance>=30), the clusters active in that
 * window, and any alerts fired, builds a compact context, and makes ONE
 * Anthropic Messages call to write a concise morning briefing in markdown. The
 * result is upserted into `briefings` keyed by (campaign_id, briefing_date,
 * kind='morning') so re-running a day overwrites rather than duplicates.
 *
 * Exposed as `runBriefing()` so the cron route (and backfill jobs) share it.
 * SERVER-ONLY: it uses the service-role Supabase client and the Anthropic key —
 * never import from a client component.
 *
 * NOTE: unlike the enrichment worker this deliberately does NOT write a
 * service_runs row — that table's `kind` check only allows
 * 'ingest' | 'enrich' | 'sync_airtable'.
 *
 * The Anthropic model is `process.env.BRIEFING_MODEL || "claude-sonnet-5"`
 * (mirrors the enrich default). Delivery (sent_at) is a separate concern and is
 * left null here.
 */

import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { asCampaignType } from "@/lib/campaignType";
import {
  BRIEFING_PROMPT_VERSION,
  buildSystemPrompt,
  buildUserContent,
  type BriefingAlert,
  type BriefingCluster,
  type BriefingContext,
  type NotableMention,
  type PlatformCount,
} from "./prompt";

/** Cap on clusters and notable mentions fed to the model. */
const CLUSTER_CAP = 12;
const NOTABLE_CAP = 6;
const WINDOW_MS = 24 * 60 * 60 * 1000;

// ---- Minimal DB row shapes (the repo has no generated Supabase types) ----

interface CampaignRow {
  id: string;
  slug: string;
  name: string;
  country: string;
  status: string;
  campaign_type?: string | null;
}

interface MentionRow {
  platform: string;
  title: string | null;
  body: string | null;
  url: string | null;
  published_at: string | null;
  relevance: number | null;
  sentiment: number | null;
  reach_score: number | null;
}

interface ClusterRow {
  label: string | null;
  summary: string | null;
  mention_count: number | null;
  avg_sentiment: number | null;
  last_seen: string | null;
}

interface AlertRow {
  severity: string | null;
  headline: string | null;
  stats_line: string | null;
}

export interface BriefingCampaignResult {
  slug: string;
  generated: boolean;
}

export interface Summary {
  campaigns: BriefingCampaignResult[];
  /** How many campaigns produced a briefing this run. */
  generated: number;
}

/**
 * Run one briefing pass. `opts.date` (yyyy-mm-dd) sets the day being covered;
 * absent, it uses today (UTC). Never throws for per-campaign model failures
 * (those yield `generated:false`), only for hard configuration errors.
 */
export async function runBriefing(opts?: { date?: string }): Promise<Summary> {
  const admin = supabaseAdmin();
  if (!admin) {
    throw new Error("Supabase service-role client is not configured.");
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set.");
  }

  const anthropic = new Anthropic({ apiKey });
  const model = process.env.BRIEFING_MODEL || "claude-sonnet-5";

  // Reference instant: end of the given date (UTC) or now. The window is the
  // 24h ending there; the prior window is the 24h before that.
  const reference = opts?.date
    ? new Date(`${opts.date}T23:59:59.999Z`)
    : new Date();
  const briefingDate = opts?.date ?? reference.toISOString().slice(0, 10);
  const windowStart = new Date(reference.getTime() - WINDOW_MS);
  const priorStart = new Date(reference.getTime() - 2 * WINDOW_MS);

  const summary: Summary = { campaigns: [], generated: 0 };

  const campaigns = await loadActiveCampaigns(admin);

  for (const campaign of campaigns) {
    let generated = false;
    try {
      generated = await generateForCampaign(
        admin,
        anthropic,
        model,
        campaign,
        briefingDate,
        windowStart,
        priorStart,
        reference
      );
    } catch (err) {
      // A per-campaign failure must not abort the whole run.
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`[briefing] ${campaign.slug} failed: ${msg}`);
      generated = false;
    }
    summary.campaigns.push({ slug: campaign.slug, generated });
    if (generated) summary.generated += 1;
  }

  return summary;
}

/** Active campaigns, tolerant of the pre-0005 missing campaign_type column. */
async function loadActiveCampaigns(
  admin: SupabaseClient
): Promise<CampaignRow[]> {
  const withType = await admin
    .from("campaigns")
    .select("id, slug, name, country, status, campaign_type")
    .eq("status", "active");
  if (!withType.error) {
    return (withType.data ?? []) as CampaignRow[];
  }
  const noType = await admin
    .from("campaigns")
    .select("id, slug, name, country, status")
    .eq("status", "active");
  return (noType.data ?? []) as CampaignRow[];
}

/**
 * Build context, call the model once, and upsert the briefing. Returns true
 * when a briefing row was written. Skips the model call (and returns false)
 * when the campaign had no coverage in either window.
 */
async function generateForCampaign(
  admin: SupabaseClient,
  anthropic: Anthropic,
  model: string,
  campaign: CampaignRow,
  briefingDate: string,
  windowStart: Date,
  priorStart: Date,
  reference: Date
): Promise<boolean> {
  // Enriched, on-topic, visible, non-duplicate mentions across BOTH windows.
  const { data: mentionData } = await admin
    .from("mentions")
    .select(
      "platform, title, body, url, published_at, relevance, sentiment, reach_score"
    )
    .eq("campaign_id", campaign.id)
    .not("enriched_at", "is", null)
    .is("duplicate_of", null)
    .eq("is_hidden", false)
    .gte("relevance", 30)
    .gte("published_at", priorStart.toISOString())
    .lte("published_at", reference.toISOString());

  const rows = (mentionData ?? []) as MentionRow[];
  const windowStartMs = windowStart.getTime();

  const current: MentionRow[] = [];
  const prior: MentionRow[] = [];
  for (const m of rows) {
    const t = m.published_at ? new Date(m.published_at).getTime() : NaN;
    if (Number.isNaN(t)) continue;
    if (t >= windowStartMs) current.push(m);
    else prior.push(m);
  }

  // Clusters active in the window (touched since windowStart), busiest first.
  const { data: clusterData } = await admin
    .from("clusters")
    .select("label, summary, mention_count, avg_sentiment, last_seen")
    .eq("campaign_id", campaign.id)
    .in("status", ["open", "fading"])
    .gte("last_seen", windowStart.toISOString())
    .order("mention_count", { ascending: false, nullsFirst: false })
    .limit(CLUSTER_CAP);
  const clusterRows = (clusterData ?? []) as ClusterRow[];

  // Alerts fired in the window.
  const { data: alertData } = await admin
    .from("alerts")
    .select("severity, headline, stats_line")
    .eq("campaign_id", campaign.id)
    .gte("fired_at", windowStart.toISOString())
    .lte("fired_at", reference.toISOString());
  const alertRows = (alertData ?? []) as AlertRow[];

  // Nothing at all to say — skip the model call for this campaign.
  if (
    current.length === 0 &&
    prior.length === 0 &&
    clusterRows.length === 0 &&
    alertRows.length === 0
  ) {
    return false;
  }

  const context = buildContext(
    campaign,
    briefingDate,
    current,
    prior,
    clusterRows,
    alertRows
  );

  const message = await anthropic.messages.create({
    model,
    max_tokens: 1200,
    system: buildSystemPrompt(context),
    messages: [{ role: "user", content: buildUserContent(context) }],
  });

  const contentMd = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  if (!contentMd) {
    throw new Error("model returned empty briefing text");
  }

  const stats = {
    volume: context.volume,
    priorVolume: context.priorVolume,
    volumeDelta: context.volume - context.priorVolume,
    sentiment: context.sentiment,
    priorSentiment: context.priorSentiment,
    sentimentDelta:
      context.sentiment !== null && context.priorSentiment !== null
        ? context.sentiment - context.priorSentiment
        : null,
    clusterCount: clusterRows.length,
    alertCount: alertRows.length,
    topPlatforms: context.topPlatforms,
  };

  const { error } = await admin.from("briefings").upsert(
    {
      campaign_id: campaign.id,
      briefing_date: briefingDate,
      kind: "morning",
      content_md: contentMd,
      stats,
      prompt_version: BRIEFING_PROMPT_VERSION,
      model,
    },
    { onConflict: "campaign_id,briefing_date,kind" }
  );
  if (error) {
    throw new Error(`briefing upsert failed: ${error.message}`);
  }
  return true;
}

/** Average of a numeric field over rows, rounded; null when empty. */
function avgSentiment(rows: MentionRow[]): number | null {
  if (rows.length === 0) return null;
  let sum = 0;
  let n = 0;
  for (const r of rows) {
    if (typeof r.sentiment === "number") {
      sum += r.sentiment;
      n += 1;
    }
  }
  if (n === 0) return null;
  return Math.round(sum / n);
}

/** Assemble the compact model-facing context from the raw rows. */
function buildContext(
  campaign: CampaignRow,
  briefingDate: string,
  current: MentionRow[],
  prior: MentionRow[],
  clusterRows: ClusterRow[],
  alertRows: AlertRow[]
): BriefingContext {
  // Platform tallies over the current window, top 4.
  const platformCounts = new Map<string, number>();
  for (const m of current) {
    platformCounts.set(m.platform, (platformCounts.get(m.platform) ?? 0) + 1);
  }
  const topPlatforms: PlatformCount[] = [...platformCounts.entries()]
    .map(([platform, count]) => ({ platform, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);

  const clusters: BriefingCluster[] = clusterRows.map((c) => ({
    label: c.label?.trim() || "(unlabeled story)",
    summary: c.summary,
    mentionCount: c.mention_count ?? 0,
    avgSentiment: c.avg_sentiment ?? 0,
  }));

  const notable: NotableMention[] = [...current]
    .sort((a, b) => (b.reach_score ?? 0) - (a.reach_score ?? 0))
    .slice(0, NOTABLE_CAP)
    .map((m) => ({
      platform: m.platform,
      title:
        m.title?.trim() ||
        (m.body ? m.body.slice(0, 80).trim() : "") ||
        "(untitled mention)",
      reach: m.reach_score ?? 0,
      sentiment: m.sentiment ?? 0,
      url: m.url,
    }));

  const alerts: BriefingAlert[] = alertRows.map((a) => ({
    severity: a.severity ?? "info",
    headline: a.headline?.trim() || "(alert)",
    statsLine: a.stats_line,
  }));

  return {
    campaignName: campaign.name,
    country: campaign.country,
    campaignType: asCampaignType(campaign.campaign_type),
    briefingDate,
    volume: current.length,
    priorVolume: prior.length,
    sentiment: avgSentiment(current),
    priorSentiment: avgSentiment(prior),
    topPlatforms,
    clusters,
    notable,
    alerts,
  };
}
