/**
 * Alert engine (spec §7). Evaluates each campaign's active `alert_rules`
 * against recent `mentions` / `clusters` aggregates and writes `alerts` rows
 * when a rule's condition is met. Deterministic and model-free: the headline,
 * stats_line and situation_read are all computed from the matched data — no
 * Anthropic call — so a run is cheap and repeatable.
 *
 * Exposed as `runAlerts()` so the cron route and any backfill/test job share
 * one path. SERVER-ONLY: it uses the service-role Supabase client (bypasses
 * RLS) — never import from a client component.
 *
 * Rule grammar interpreted here (the shapes seeded in supabase/seed.sql):
 *   when: cluster_velocity | single_mention | opponent | sentiment_shift
 *   threshold: { multiple, reach_percentile, mentions, window_hours,
 *                points, window, volume_multiple }
 *   filters:   { sentiment_below }
 *   scope:     "monitored_groups" (sentiment_shift, group chatter)
 *
 * Cooldown: a rule does not fire again within its cooldown_minutes — we read
 * the latest alerts.fired_at for the rule before inserting. Each rule fires at
 * most one alert per run (the strongest match), which also dedupes the run.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { signed } from "@/lib/ui";

/* ------------------------------------------------------------------ */
/* Tunables                                                            */
/* ------------------------------------------------------------------ */

/** How far back we load mentions so we can compute prior-window baselines. */
const LOAD_WINDOW_HOURS = 48;
/** Default recent window for velocity when a rule omits window_hours. */
const DEFAULT_VELOCITY_WINDOW = 2;
/** Default recent window for opponent / single-mention when unspecified. */
const DEFAULT_RECENT_WINDOW = 6;
/** Floor on recent count so a rule can't fire on statistical noise. */
const MIN_RECENT_COUNT = 3;
/** Minimum sample before a reach percentile is meaningful. */
const MIN_PERCENTILE_SAMPLE = 12;

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type RuleWhen =
  | "cluster_velocity"
  | "single_mention"
  | "opponent"
  | "sentiment_shift";

interface RuleThreshold {
  multiple?: number;
  reach_percentile?: number;
  mentions?: number;
  window_hours?: number;
  points?: number;
  window?: string;
  volume_multiple?: number;
}

interface RuleSpec {
  when?: string;
  scope?: string;
  threshold?: RuleThreshold;
  filters?: { sentiment_below?: number };
}

interface RuleRow {
  id: string;
  name: string | null;
  rule: RuleSpec | null;
  severity: "info" | "watch" | "urgent";
  cooldown_minutes: number | null;
}

interface CampaignRow {
  id: string;
  slug: string;
}

interface MentionRow {
  id: string;
  sentiment: number | null;
  reach_score: number | null;
  cluster_id: string | null;
  message_box_quadrant: string | null;
  entities: unknown;
  author: string | null;
  platform: string | null;
  title: string | null;
  published_at: string | null;
  raw: Record<string, unknown> | null;
}

interface ClusterRow {
  id: string;
  label: string | null;
  mention_count: number | null;
  avg_sentiment: number | null;
}

/** A decided alert, ready for cooldown check + insert. */
interface AlertDraft {
  rule: RuleRow;
  clusterId: string | null;
  headline: string;
  statsLine: string;
  situationRead: string;
}

export interface CampaignAlertResult {
  slug: string;
  evaluated: number;
  fired: number;
}

export interface Summary {
  campaigns: CampaignAlertResult[];
  totalFired: number;
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

export async function runAlerts(): Promise<Summary> {
  const admin = supabaseAdmin();
  if (!admin) {
    throw new Error("Supabase service-role client is not configured.");
  }

  const { data: campaignRows, error: campErr } = await admin
    .from("campaigns")
    .select("id, slug")
    .eq("status", "active");
  if (campErr) {
    throw new Error(`Failed to load campaigns: ${campErr.message}`);
  }

  const summary: Summary = { campaigns: [], totalFired: 0 };

  for (const campaign of (campaignRows ?? []) as CampaignRow[]) {
    const result = await evaluateCampaign(admin, campaign);
    summary.campaigns.push(result);
    summary.totalFired += result.fired;
  }

  return summary;
}

/* ------------------------------------------------------------------ */
/* Per-campaign evaluation                                             */
/* ------------------------------------------------------------------ */

async function evaluateCampaign(
  admin: SupabaseClient,
  campaign: CampaignRow
): Promise<CampaignAlertResult> {
  const result: CampaignAlertResult = { slug: campaign.slug, evaluated: 0, fired: 0 };

  const { data: ruleRows, error: ruleErr } = await admin
    .from("alert_rules")
    .select("id, name, rule, severity, cooldown_minutes")
    .eq("campaign_id", campaign.id)
    .eq("is_active", true);
  if (ruleErr || !ruleRows || ruleRows.length === 0) return result;
  const rules = ruleRows as RuleRow[];

  const sinceIso = new Date(Date.now() - LOAD_WINDOW_HOURS * HOUR_MS).toISOString();

  const [mres, cres] = await Promise.all([
    admin
      .from("mentions")
      .select(
        "id, sentiment, reach_score, cluster_id, message_box_quadrant, entities, author, platform, title, published_at, raw"
      )
      .eq("campaign_id", campaign.id)
      .is("duplicate_of", null)
      .eq("is_hidden", false)
      .gte("published_at", sinceIso)
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(4000),
    admin
      .from("clusters")
      .select("id, label, mention_count, avg_sentiment")
      .eq("campaign_id", campaign.id),
  ]);

  const mentions = (!mres.error && mres.data ? (mres.data as MentionRow[]) : []).filter(
    (m) => tsOf(m.published_at) !== null
  );
  const clusters = !cres.error && cres.data ? (cres.data as ClusterRow[]) : [];
  const clusterById = new Map(clusters.map((c) => [c.id, c]));

  for (const rule of rules) {
    result.evaluated += 1;
    const when = rule.rule?.when as RuleWhen | undefined;
    let draft: AlertDraft | null = null;

    if (when === "cluster_velocity") {
      draft = evalClusterVelocity(rule, mentions, clusterById);
    } else if (when === "single_mention") {
      draft = evalSingleMention(rule, mentions);
    } else if (when === "opponent") {
      draft = evalOpponent(rule, mentions);
    } else if (when === "sentiment_shift") {
      draft = evalSentimentShift(rule, mentions);
    }

    if (!draft) continue;

    const fired = await fireIfCool(admin, campaign.id, draft);
    if (fired) result.fired += 1;
  }

  return result;
}

/* ------------------------------------------------------------------ */
/* Rule interpreters                                                   */
/* ------------------------------------------------------------------ */

/**
 * cluster_velocity — a cluster whose recent mention rate spikes.
 *  · threshold.multiple: recent count in the window ≥ multiple × the prior
 *    comparable window (baseline floored at 1), recent ≥ MIN_RECENT_COUNT.
 *  · threshold.mentions (+ window_hours): recent count ≥ mentions.
 * filters.sentiment_below applies to the cluster's recent average sentiment.
 * Fires once for the strongest cluster (highest recent count).
 */
function evalClusterVelocity(
  rule: RuleRow,
  mentions: MentionRow[],
  clusterById: Map<string, ClusterRow>
): AlertDraft | null {
  const th = rule.rule?.threshold ?? {};
  const windowH = th.window_hours ?? DEFAULT_VELOCITY_WINDOW;
  const now = Date.now();
  const recentFloor = now - windowH * HOUR_MS;
  const priorFloor = now - 2 * windowH * HOUR_MS;
  const sentimentBelow = rule.rule?.filters?.sentiment_below;

  // Group recent + prior counts and recent sentiment per cluster.
  interface Agg {
    recent: number;
    prior: number;
    sentSum: number;
    sentN: number;
  }
  const agg = new Map<string, Agg>();
  for (const m of mentions) {
    if (!m.cluster_id) continue;
    const t = tsOf(m.published_at)!;
    let a = agg.get(m.cluster_id);
    if (!a) {
      a = { recent: 0, prior: 0, sentSum: 0, sentN: 0 };
      agg.set(m.cluster_id, a);
    }
    if (t >= recentFloor) {
      a.recent += 1;
      if (m.sentiment != null) {
        a.sentSum += m.sentiment;
        a.sentN += 1;
      }
    } else if (t >= priorFloor) {
      a.prior += 1;
    }
  }

  let best: { id: string; recent: number; mult: number; avg: number } | null = null;
  for (const [id, a] of agg) {
    if (a.recent < MIN_RECENT_COUNT) continue;
    const avg = a.sentN > 0 ? Math.round(a.sentSum / a.sentN) : 0;
    if (sentimentBelow != null && !(avg < sentimentBelow)) continue;

    const mult = a.recent / Math.max(a.prior, 1);
    const passMultiple = th.multiple == null || mult >= th.multiple;
    const passMentions = th.mentions == null || a.recent >= th.mentions;
    if (!passMultiple || !passMentions) continue;

    if (!best || a.recent > best.recent) best = { id, recent: a.recent, mult, avg };
  }
  if (!best) return null;

  const cluster = clusterById.get(best.id);
  const label = cluster?.label?.trim() || "an unlabeled cluster";
  const total = cluster?.mention_count ?? best.recent;
  const multLabel = `${best.mult.toFixed(1)}×`;

  const statsLine = `${multLabel} · ${signed(best.avg)} · reach ${formatReach(
    total
  )}`;
  const headline = th.mentions != null && th.multiple == null
    ? `New narrative forming: "${label}"`
    : `Mention velocity spike on "${label}"`;
  const situationRead =
    `The "${label}" cluster logged ${best.recent} ${plural(best.recent, "mention")} ` +
    `in the last ${windowH} ${plural(windowH, "hour")}, about ${multLabel} its prior ` +
    `rate, with recent average sentiment at ${signed(best.avg)}. It now holds ${total} ` +
    `${plural(total, "mention")} in total.`;

  return { rule, clusterId: best.id, headline, statsLine, situationRead };
}

/**
 * single_mention — a single mention whose reach_score sits in the top
 * reach_percentile of the campaign's recent mentions, with sentiment below
 * filters.sentiment_below. Fires for the single highest-reach qualifier.
 */
function evalSingleMention(rule: RuleRow, mentions: MentionRow[]): AlertDraft | null {
  const th = rule.rule?.threshold ?? {};
  const pct = th.reach_percentile;
  if (pct == null) return null;
  const sentimentBelow = rule.rule?.filters?.sentiment_below;

  const now = Date.now();
  const dayFloor = now - DAY_MS;
  const recentFloor = now - DEFAULT_RECENT_WINDOW * HOUR_MS;

  // Percentile basis: reach scores over the last 24h.
  const basis = mentions
    .filter((m) => tsOf(m.published_at)! >= dayFloor && m.reach_score != null)
    .map((m) => m.reach_score as number);
  if (basis.length < MIN_PERCENTILE_SAMPLE) return null;
  const cutoff = percentile(basis, pct);

  // Candidates: fired only for genuinely recent, big-reach, negative-enough hits.
  let best: MentionRow | null = null;
  for (const m of mentions) {
    if (m.reach_score == null || m.reach_score < cutoff) continue;
    if (tsOf(m.published_at)! < recentFloor) continue;
    if (sentimentBelow != null && !((m.sentiment ?? 0) < sentimentBelow)) continue;
    if (!best || (m.reach_score ?? 0) > (best.reach_score ?? 0)) best = m;
  }
  if (!best) return null;

  const reach = best.reach_score ?? 0;
  const sent = best.sentiment ?? 0;
  const who = best.author?.trim() || best.platform || "an account";
  const statsLine = `reach ${formatReach(reach)} · ${signed(sent)} · p${pct}`;
  const headline = `High-reach post from ${who}`;
  const situationRead =
    `A post from ${who}${best.platform ? ` on ${best.platform}` : ""} reached an ` +
    `estimated ${formatReach(reach)}, in the top ${100 - pct}% of the last 24 hours by ` +
    `reach, with sentiment at ${signed(sent)}.` +
    (best.title?.trim() ? ` It reads: "${truncate(best.title.trim(), 120)}".` : "");

  return { rule, clusterId: best.cluster_id, headline, statsLine, situationRead };
}

/**
 * opponent — opponent-tagged mention volume (message_box_quadrant themThem /
 * themUs, or an entity of kind 'opponent') exceeding multiple × the prior
 * comparable window.
 */
function evalOpponent(rule: RuleRow, mentions: MentionRow[]): AlertDraft | null {
  const th = rule.rule?.threshold ?? {};
  const multiple = th.multiple;
  if (multiple == null) return null;
  const windowH = th.window_hours ?? DEFAULT_RECENT_WINDOW;

  const now = Date.now();
  const recentFloor = now - windowH * HOUR_MS;
  const priorFloor = now - 2 * windowH * HOUR_MS;

  let recent = 0;
  let prior = 0;
  let sentSum = 0;
  let sentN = 0;
  for (const m of mentions) {
    if (!isOpponent(m)) continue;
    const t = tsOf(m.published_at)!;
    if (t >= recentFloor) {
      recent += 1;
      if (m.sentiment != null) {
        sentSum += m.sentiment;
        sentN += 1;
      }
    } else if (t >= priorFloor) {
      prior += 1;
    }
  }
  if (recent < MIN_RECENT_COUNT) return null;
  const mult = recent / Math.max(prior, 1);
  if (mult < multiple) return null;

  const avg = sentN > 0 ? Math.round(sentSum / sentN) : 0;
  const multLabel = `${mult.toFixed(1)}×`;
  const statsLine = `${multLabel} · ${signed(avg)} · ${recent} ${plural(recent, "mention")}`;
  const headline = `Opponent mention volume up ${multLabel}`;
  const situationRead =
    `Opponent-tagged mentions rose to ${recent} in the last ${windowH} ` +
    `${plural(windowH, "hour")}, about ${multLabel} the prior window's ${prior}, with ` +
    `average sentiment at ${signed(avg)}.`;

  return { rule, clusterId: null, headline, statsLine, situationRead };
}

/**
 * sentiment_shift — campaign average sentiment moved ≥ threshold.points over
 * the window vs the prior window. window "day" → 24h vs the prior 24h; any
 * other value falls back to window_hours (default DEFAULT_RECENT_WINDOW).
 * scope "monitored_groups" restricts to group-chatter mentions (raw.group_id).
 * When threshold.volume_multiple is set the recent volume must also rise by
 * that factor.
 */
function evalSentimentShift(rule: RuleRow, mentions: MentionRow[]): AlertDraft | null {
  const th = rule.rule?.threshold ?? {};
  const points = th.points;
  if (points == null) return null;
  const scoped = rule.rule?.scope === "monitored_groups";

  const spanMs = th.window === "day" ? DAY_MS : (th.window_hours ?? DEFAULT_RECENT_WINDOW) * HOUR_MS;
  const now = Date.now();
  const recentFloor = now - spanMs;
  const priorFloor = now - 2 * spanMs;

  let rSum = 0, rN = 0, rVol = 0;
  let pSum = 0, pN = 0, pVol = 0;
  for (const m of mentions) {
    if (scoped && !hasGroup(m)) continue;
    const t = tsOf(m.published_at)!;
    if (t >= recentFloor) {
      rVol += 1;
      if (m.sentiment != null) { rSum += m.sentiment; rN += 1; }
    } else if (t >= priorFloor) {
      pVol += 1;
      if (m.sentiment != null) { pSum += m.sentiment; pN += 1; }
    }
  }
  if (rN === 0 || pN === 0) return null;

  const recentAvg = rSum / rN;
  const priorAvg = pSum / pN;
  const delta = Math.round(recentAvg - priorAvg);
  if (Math.abs(delta) < points) return null;

  if (th.volume_multiple != null) {
    const volMult = rVol / Math.max(pVol, 1);
    if (volMult < th.volume_multiple) return null;
  }

  const windowLabel = th.window === "day" ? "day" : `${th.window_hours ?? DEFAULT_RECENT_WINDOW}h`;
  const direction = delta < 0 ? "slid" : "rose";
  const scopeLabel = scoped ? "Group-chatter sentiment" : "Sentiment";
  const statsLine = `${signed(delta)} pts · ${windowLabel} · ${rVol} ${plural(rVol, "mention")}`;
  const headline = `${scopeLabel} ${direction} ${Math.abs(delta)} points`;
  const situationRead =
    `${scopeLabel} moved from ${signed(Math.round(priorAvg))} to ` +
    `${signed(Math.round(recentAvg))} over the last ${windowLabel} ` +
    `(${signed(delta)} points) across ${rVol} ${plural(rVol, "mention")}.`;

  return { rule, clusterId: null, headline, statsLine, situationRead };
}

/* ------------------------------------------------------------------ */
/* Cooldown + insert                                                   */
/* ------------------------------------------------------------------ */

/**
 * Fire the alert unless the rule fired within its cooldown window. Reads the
 * most recent alerts.fired_at for the rule and compares against cooldown_minutes.
 * Returns true when a row was inserted.
 */
async function fireIfCool(
  admin: SupabaseClient,
  campaignId: string,
  draft: AlertDraft
): Promise<boolean> {
  const cooldownMin = draft.rule.cooldown_minutes ?? 60;

  const { data: last } = await admin
    .from("alerts")
    .select("fired_at")
    .eq("rule_id", draft.rule.id)
    .order("fired_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle<{ fired_at: string | null }>();

  if (last?.fired_at) {
    const firedAt = new Date(last.fired_at).getTime();
    if (!Number.isNaN(firedAt) && Date.now() - firedAt < cooldownMin * 60_000) {
      return false; // still cooling down
    }
  }

  const { error } = await admin.from("alerts").insert({
    campaign_id: campaignId,
    rule_id: draft.rule.id,
    cluster_id: draft.clusterId,
    severity: draft.rule.severity,
    headline: draft.headline,
    situation_read: draft.situationRead,
    stats_line: draft.statsLine,
    delivered: {},
  });
  if (error) {
    console.log(`[alerts] insert failed for rule ${draft.rule.id}: ${error.message}`);
    return false;
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function tsOf(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Is this an opponent-tagged mention? Quadrant or an entity of kind opponent. */
function isOpponent(m: MentionRow): boolean {
  if (m.message_box_quadrant === "themThem" || m.message_box_quadrant === "themUs") {
    return true;
  }
  if (Array.isArray(m.entities)) {
    for (const e of m.entities) {
      if (e && typeof e === "object" && (e as { kind?: unknown }).kind === "opponent") {
        return true;
      }
    }
  }
  return false;
}

/** Group-chatter mention (S11): raw.group_id is set on ingest. */
function hasGroup(m: MentionRow): boolean {
  const g = m.raw?.["group_id"];
  return typeof g === "string" && g.length > 0;
}

/** Linear-interpolated percentile value (p in 0..100) over a numeric array. */
function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
}

/** 210000 → "210k", 1_400_000 → "1.4m". */
function formatReach(n: number): string {
  const v = Math.round(n);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}m`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}k`;
  return `${v}`;
}

function plural(n: number, word: string): string {
  return n === 1 ? word : `${word}s`;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}
