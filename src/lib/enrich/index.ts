/**
 * AI enrichment worker (spec §5 + S12 narrative fields). Pulls un-enriched
 * mentions, scores them with a single forced-tool Anthropic call per batch of
 * 10, and writes back relevance / stance-aware sentiment / entities / topics /
 * narrative theme / message-box quadrant / cluster assignment, plus a cheaply
 * computed reach_score. Clustering is incremental: a mention either joins an
 * open cluster or opens a new one.
 *
 * Exposed as `runEnrichment()` so the cron route and tests/backfill jobs can
 * share it. SERVER-ONLY: it uses the service-role Supabase client and the
 * Anthropic key — never import from a client component.
 *
 * The Anthropic model is `process.env.ENRICH_MODEL || "claude-sonnet-5"`. We
 * force `emit_enrichments` tool use for strict JSON and disable thinking (forced
 * tool choice is incompatible with extended thinking, and we want deterministic,
 * low-latency extraction).
 */

import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { asCampaignType } from "@/lib/campaignType";
import {
  ENRICH_TOOL,
  MODEL_BATCH,
  PROMPT_VERSION,
  buildSystemPrompt,
  buildUserContent,
  parseEnrichments,
  type ClusterDecision,
  type EnrichContext,
  type EnrichKeywords,
  type EnrichMentionInput,
  type MentionEnrichment,
  type OpenClusterRef,
} from "./prompt";

/** How many mentions to scan across all campaigns in one run. */
const DEFAULT_BATCH = 20;
/** Cap on open clusters loaded into context per campaign (most recent first). */
const OPEN_CLUSTER_CAP = 30;

// ---- Minimal DB row shapes (the repo has no generated Supabase types) ----

interface MentionRow {
  id: string;
  campaign_id: string;
  platform: string;
  author: string | null;
  author_followers: number | null;
  title: string | null;
  body: string | null;
  published_at: string | null;
  raw: Record<string, unknown> | null;
}

interface CampaignRow {
  id: string;
  slug: string;
  name: string;
  country: string;
  message_platform: unknown;
  // Optional so the pre-0005 fallback select (which omits it) still type-checks.
  campaign_type?: string | null;
}

interface KeywordRow {
  term: string;
  kind: "candidate" | "opponent" | "issue" | "misspelling";
}

interface ClusterRow {
  id: string;
  label: string | null;
  summary: string | null;
  last_seen: string | null;
  mention_count: number | null;
  avg_sentiment: number | null;
}

/** Mutable open-cluster state we keep in memory so same-run updates compound. */
interface LiveCluster extends OpenClusterRef {
  last_seen: string | null;
  mention_count: number;
  avg_sentiment: number;
}

export interface CampaignSummary {
  slug: string;
  scanned: number;
  enriched: number;
  failed: number;
  clustersCreated: number;
}

export interface EnrichSummary {
  scanned: number;
  enriched: number;
  failed: number;
  clustersCreated: number;
  byCampaign: CampaignSummary[];
  errors: string[];
  /** Anthropic Messages API calls made this run (one per chunk of MODEL_BATCH). */
  modelCalls: number;
  /** Anthropic input+output tokens summed across every model call this run. */
  tokens: number;
}

/**
 * Run one enrichment pass. `batch` bounds how many mentions are scanned.
 * Returns a summary; never throws for per-mention or per-call model failures
 * (those are recorded), only for hard configuration errors.
 */
export async function runEnrichment(batch = DEFAULT_BATCH): Promise<EnrichSummary> {
  const admin = supabaseAdmin();
  if (!admin) {
    throw new Error("Supabase service-role client is not configured.");
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set.");
  }

  const anthropic = new Anthropic({ apiKey });
  const model = process.env.ENRICH_MODEL || "claude-sonnet-5";

  const summary: EnrichSummary = {
    scanned: 0,
    enriched: 0,
    failed: 0,
    clustersCreated: 0,
    byCampaign: [],
    errors: [],
    modelCalls: 0,
    tokens: 0,
  };

  // Record one usage/cost row so the UI can show real service usage. Isolated in
  // its own try/catch: a metrics-write failure must never fail the enrich run.
  // Called before every return so even a no-op run is recorded.
  const persistRun = async (): Promise<void> => {
    try {
      const { error: metricsError } = await admin
        .from("service_runs")
        .insert({
          kind: "enrich",
          requests: summary.modelCalls,
          processed: summary.enriched,
          errors: summary.failed,
          tokens: summary.tokens,
          detail: summary,
        });
      if (metricsError) {
        console.log(
          `[enrich] failed to record service_runs row: ${metricsError.message}`
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`[enrich] failed to record service_runs row: ${msg}`);
    }
  };

  // 1) Oldest un-enriched, un-failed mentions across ALL campaigns.
  const { data: mentions, error: fetchErr } = await admin
    .from("mentions")
    .select(
      "id, campaign_id, platform, author, author_followers, title, body, published_at, raw"
    )
    .is("enriched_at", null)
    .eq("enrich_failed", false)
    .order("captured_at", { ascending: true })
    .limit(batch);

  if (fetchErr) {
    throw new Error(`Failed to fetch mentions: ${fetchErr.message}`);
  }
  const rows = (mentions ?? []) as MentionRow[];
  summary.scanned = rows.length;
  if (rows.length === 0) {
    await persistRun();
    return summary;
  }

  // 2) Group by campaign — context is loaded once per campaign.
  const byCampaign = new Map<string, MentionRow[]>();
  for (const m of rows) {
    const list = byCampaign.get(m.campaign_id);
    if (list) list.push(m);
    else byCampaign.set(m.campaign_id, [m]);
  }

  for (const [campaignId, campaignMentions] of byCampaign) {
    const ctxResult = await loadCampaignContext(admin, campaignId);
    if (!ctxResult) {
      summary.errors.push(`Campaign ${campaignId} not found; skipped.`);
      continue;
    }
    const { campaign, context, liveClusters } = ctxResult;

    const perCampaign: CampaignSummary = {
      slug: campaign.slug,
      scanned: campaignMentions.length,
      enriched: 0,
      failed: 0,
      clustersCreated: 0,
    };

    // 3) One Anthropic call per chunk of MODEL_BATCH mentions.
    for (let i = 0; i < campaignMentions.length; i += MODEL_BATCH) {
      const chunk = campaignMentions.slice(i, i + MODEL_BATCH);
      await processChunk(
        admin,
        anthropic,
        model,
        context,
        liveClusters,
        chunk,
        perCampaign,
        summary
      );
    }

    summary.enriched += perCampaign.enriched;
    summary.failed += perCampaign.failed;
    summary.clustersCreated += perCampaign.clustersCreated;
    summary.byCampaign.push(perCampaign);
  }

  await persistRun();
  return summary;
}

/** Load campaign row, active keywords, pillars, and open clusters. */
async function loadCampaignContext(
  admin: SupabaseClient,
  campaignId: string
): Promise<{
  campaign: CampaignRow;
  context: EnrichContext;
  liveClusters: LiveCluster[];
} | null> {
  // Prefer campaign_type (migration 0005). On a missing-column error retry
  // without it and default to 'candidate' (migration-transition fallback), so
  // enrichment keeps working before 0005 is applied.
  let campaign: CampaignRow | null = null;
  const withType = await admin
    .from("campaigns")
    .select("id, slug, name, country, message_platform, campaign_type")
    .eq("id", campaignId)
    .maybeSingle<CampaignRow>();
  if (withType.error) {
    const noType = await admin
      .from("campaigns")
      .select("id, slug, name, country, message_platform")
      .eq("id", campaignId)
      .maybeSingle<CampaignRow>();
    campaign = noType.data ?? null;
  } else {
    campaign = withType.data ?? null;
  }
  if (!campaign) return null;

  const { data: keywordRows } = await admin
    .from("keywords")
    .select("term, kind")
    .eq("campaign_id", campaignId)
    .eq("is_active", true);

  const keywords: EnrichKeywords = { candidate: [], opponent: [], issue: [] };
  for (const k of (keywordRows ?? []) as KeywordRow[]) {
    if (k.kind === "candidate") keywords.candidate.push(k.term);
    else if (k.kind === "opponent") keywords.opponent.push(k.term);
    else if (k.kind === "issue") keywords.issue.push(k.term);
    // 'misspelling' terms map to entities via ingest, not scoring context.
  }

  const { data: clusterRows } = await admin
    .from("clusters")
    .select("id, label, summary, last_seen, mention_count, avg_sentiment")
    .eq("campaign_id", campaignId)
    .eq("status", "open")
    .order("last_seen", { ascending: false, nullsFirst: false })
    .limit(OPEN_CLUSTER_CAP);

  const liveClusters: LiveCluster[] = ((clusterRows ?? []) as ClusterRow[]).map(
    (c) => ({
      id: c.id,
      label: c.label,
      summary: c.summary,
      last_seen: c.last_seen,
      mention_count: c.mention_count ?? 0,
      avg_sentiment: c.avg_sentiment ?? 0,
    })
  );

  const context: EnrichContext = {
    campaignName: campaign.name,
    country: campaign.country,
    campaignType: asCampaignType(campaign.campaign_type),
    keywords,
    pillars: extractPillars(campaign.message_platform),
    openClusters: liveClusters.map((c) => ({
      id: c.id,
      label: c.label,
      summary: c.summary,
    })),
  };

  return { campaign, context, liveClusters };
}

/** Enrich one chunk (<= MODEL_BATCH). On API failure, leave mentions untouched. */
async function processChunk(
  admin: SupabaseClient,
  anthropic: Anthropic,
  model: string,
  context: EnrichContext,
  liveClusters: LiveCluster[],
  chunk: MentionRow[],
  perCampaign: CampaignSummary,
  summary: EnrichSummary
): Promise<void> {
  // ref = 1-based index within the chunk; maps model output back to the row.
  const inputs: EnrichMentionInput[] = chunk.map((m, idx) => ({
    ref: idx + 1,
    platform: m.platform,
    author: m.author,
    title: m.title,
    body: m.body,
  }));

  let results: Map<number, MentionEnrichment>;
  try {
    // Count the call before awaiting: an attempted call is a call made, so the
    // metrics `requests` reflects every batch we hit the model with.
    summary.modelCalls += 1;
    const message = await anthropic.messages.create({
      model,
      max_tokens: 8000,
      thinking: { type: "disabled" },
      system: buildSystemPrompt(context),
      tools: [ENRICH_TOOL],
      tool_choice: { type: "tool", name: "emit_enrichments" },
      messages: [{ role: "user", content: buildUserContent(inputs) }],
    });
    // Accumulate Anthropic token spend (input + output) for the usage metrics.
    summary.tokens += message.usage.input_tokens + message.usage.output_tokens;
    const toolBlock = message.content.find((b) => b.type === "tool_use");
    if (!toolBlock || toolBlock.type !== "tool_use") {
      throw new Error("model did not return an emit_enrichments tool call");
    }
    results = parseEnrichments(toolBlock.input);
  } catch (err) {
    // Whole-call failure: mark nothing, record the error, move on.
    const msg = err instanceof Error ? err.message : String(err);
    summary.errors.push(`Enrichment call failed for ${perCampaign.slug}: ${msg}`);
    return;
  }

  // Per-mention write-back.
  for (let idx = 0; idx < chunk.length; idx++) {
    const mention = chunk[idx];
    const result = results.get(idx + 1);
    if (!result) {
      await markFailed(admin, mention.id);
      perCampaign.failed++;
      continue;
    }

    try {
      const clusterId = await resolveCluster(
        admin,
        mention,
        result.cluster,
        result.sentiment,
        liveClusters,
        perCampaign
      );

      const { error } = await admin
        .from("mentions")
        .update({
          enriched_at: new Date().toISOString(),
          prompt_version: PROMPT_VERSION,
          relevance: result.relevance,
          sentiment: result.sentiment,
          entities: result.entities,
          topics: result.topics,
          narrative_theme: result.narrative_theme,
          message_box_quadrant: result.message_box_quadrant,
          reach_score: reachScore(mention),
          cluster_id: clusterId,
          enrich_failed: false,
        })
        .eq("id", mention.id);
      if (error) throw new Error(error.message);
      perCampaign.enriched++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      summary.errors.push(`Write-back failed for mention ${mention.id}: ${msg}`);
      await markFailed(admin, mention.id);
      perCampaign.failed++;
    }
  }
}

/**
 * Resolve a cluster decision into a cluster id (or null), inserting or updating
 * cluster rows as needed.
 *
 * NOTE: this uses plain supabase-js reads/writes, so two concurrent runs could
 * race on mention_count / avg_sentiment or double-insert a same-label cluster.
 * That small drift is acceptable here — the cron is single-flighted in practice
 * and clusters are recomputed downstream. Within a single run we dedupe new
 * labels and mutate the in-memory cluster state so counts stay consistent.
 */
async function resolveCluster(
  admin: SupabaseClient,
  mention: MentionRow,
  decision: ClusterDecision,
  sentiment: number,
  liveClusters: LiveCluster[],
  perCampaign: CampaignSummary
): Promise<string | null> {
  if (!decision) return null;
  const nowIso = new Date().toISOString();
  const seen = mention.published_at ?? nowIso;

  if ("existing_id" in decision) {
    // Only honour ids we actually provided to the model.
    const cluster = liveClusters.find((c) => c.id === decision.existing_id);
    if (!cluster) return null;
    await bumpCluster(admin, cluster, seen, sentiment);
    return cluster.id;
  }

  // new_label — dedupe against clusters created earlier in this same run.
  const label = decision.new_label;
  const existing = liveClusters.find(
    (c) => (c.label ?? "").toLowerCase() === label.toLowerCase()
  );
  if (existing) {
    await bumpCluster(admin, existing, seen, sentiment);
    return existing.id;
  }

  const { data, error } = await admin
    .from("clusters")
    .insert({
      campaign_id: mention.campaign_id,
      label,
      summary: decision.new_summary,
      first_seen: seen,
      last_seen: seen,
      mention_count: 1,
      avg_sentiment: sentiment,
      status: "open",
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) {
    throw new Error(`cluster insert failed: ${error?.message ?? "no id"}`);
  }

  const live: LiveCluster = {
    id: data.id,
    label,
    summary: decision.new_summary,
    last_seen: seen,
    mention_count: 1,
    avg_sentiment: sentiment,
  };
  liveClusters.push(live);
  perCampaign.clustersCreated++;
  return data.id;
}

/**
 * Attach a mention to an existing cluster: bump last_seen to the later of the
 * two timestamps, increment mention_count, and recompute the running average
 * sentiment incrementally: avg = round((avg*count + s) / (count+1)).
 */
async function bumpCluster(
  admin: SupabaseClient,
  cluster: LiveCluster,
  seen: string,
  sentiment: number
): Promise<void> {
  const newLastSeen =
    cluster.last_seen && cluster.last_seen > seen ? cluster.last_seen : seen;
  const newCount = cluster.mention_count + 1;
  const newAvg = Math.round(
    (cluster.avg_sentiment * cluster.mention_count + sentiment) / newCount
  );

  await admin
    .from("clusters")
    .update({
      last_seen: newLastSeen,
      mention_count: newCount,
      avg_sentiment: newAvg,
    })
    .eq("id", cluster.id);

  cluster.last_seen = newLastSeen;
  cluster.mention_count = newCount;
  cluster.avg_sentiment = newAvg;
}

/** Mark a mention as failed without touching enriched_at. */
async function markFailed(admin: SupabaseClient, id: string): Promise<void> {
  await admin.from("mentions").update({ enrich_failed: true }).eq("id", id);
}

/**
 * reach_score — cheap, no-model heuristic: author_followers (0 when unknown)
 * plus a log-scaled engagement bonus mined from the raw payload. The log keeps
 * a viral post from dwarfing follower reach entirely.
 *   reach = followers + round(50 * log10(1 + engagement))
 */
function reachScore(mention: MentionRow): number {
  const followers = mention.author_followers ?? 0;
  const engagement = rawEngagement(mention.raw);
  const bonus = engagement > 0 ? Math.round(50 * Math.log10(1 + engagement)) : 0;
  return followers + bonus;
}

/** Sum whatever like/share/comment/view counts the source payload exposes. */
function rawEngagement(raw: Record<string, unknown> | null): number {
  if (!raw) return 0;
  const keys = [
    "likes",
    "like_count",
    "likeCount",
    "favorite_count",
    "favoriteCount",
    "shares",
    "share_count",
    "shareCount",
    "retweet_count",
    "retweetCount",
    "reposts",
    "comments",
    "comment_count",
    "commentCount",
    "replies",
    "reply_count",
    "views",
    "view_count",
    "viewCount",
  ];
  let total = 0;
  for (const k of keys) {
    const v = raw[k];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) total += v;
  }
  return total;
}

/**
 * Pull pillar labels out of the campaign's message_platform jsonb. The document
 * shape isn't fixed, so we look for a `pillars` array of strings or objects
 * carrying a name/label/title. Returns [] when there is no platform document —
 * the model then emits null narrative_theme.
 */
function extractPillars(messagePlatform: unknown): string[] {
  if (!messagePlatform || typeof messagePlatform !== "object") return [];
  const mp = messagePlatform as Record<string, unknown>;
  const raw = mp.pillars ?? mp.ourPillars ?? mp.themes;
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const p of raw) {
    if (typeof p === "string" && p.trim()) {
      out.push(p.trim());
    } else if (p && typeof p === "object") {
      const o = p as Record<string, unknown>;
      const label = o.name ?? o.label ?? o.title ?? o.theme;
      if (typeof label === "string" && label.trim()) out.push(label.trim());
    }
  }
  return out;
}
