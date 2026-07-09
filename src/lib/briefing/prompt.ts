/**
 * Prompt contract for the daily briefing generator (spec §6). This module owns
 * everything the model sees and the shape of the compact context the worker
 * assembles from a campaign's last-24h enriched data. Kept separate from
 * index.ts so the wording can be versioned (`BRIEFING_PROMPT_VERSION`) and
 * reasoned about without the DB orchestration.
 *
 * Unlike the enrichment worker this makes an ordinary (un-forced) Messages call
 * and asks for markdown prose — the analyst's morning read — so there is no
 * tool schema here, only the system prompt and the user-content renderer.
 *
 * SERVER-ONLY by association — only imported by the worker.
 */

import type { CampaignType } from "@/lib/campaignType";

/** Bump when the prompt changes in a way that affects output. */
export const BRIEFING_PROMPT_VERSION = "brief-v1";

/** One cluster (story) summarised for the briefing context. */
export interface BriefingCluster {
  label: string;
  summary: string | null;
  mentionCount: number;
  avgSentiment: number;
}

/** A high-reach mention worth surfacing by name. */
export interface NotableMention {
  platform: string;
  title: string;
  reach: number;
  sentiment: number;
  url: string | null;
}

/** Platform volume tally. */
export interface PlatformCount {
  platform: string;
  count: number;
}

/** An alert fired inside the window. */
export interface BriefingAlert {
  severity: string;
  headline: string;
  statsLine: string | null;
}

/** The compact, model-facing context the worker builds per campaign. */
export interface BriefingContext {
  campaignName: string;
  country: string;
  campaignType: CampaignType;
  /** ISO date (yyyy-mm-dd) this briefing covers. */
  briefingDate: string;
  /** Mentions (relevance>=30) in the last 24h and the 24h before that. */
  volume: number;
  priorVolume: number;
  /** Average stance-aware sentiment (−100..100) for each window; null if empty. */
  sentiment: number | null;
  priorSentiment: number | null;
  topPlatforms: PlatformCount[];
  clusters: BriefingCluster[];
  notable: NotableMention[];
  alerts: BriefingAlert[];
}

/** Signed integer, e.g. +12 / −4, or "n/a" for null. */
function signedOrNa(v: number | null): string {
  if (v === null) return "n/a";
  return v > 0 ? `+${v}` : `${v}`;
}

/**
 * System prompt: role, voice, structure, and the campaign-type framing. Issue
 * campaigns are reframed around the cause rather than a candidate.
 */
export function buildSystemPrompt(ctx: BriefingContext): string {
  const issue = ctx.campaignType === "issue";
  const subject = issue
    ? `the cause "${ctx.campaignName}"`
    : `the campaign "${ctx.campaignName}"`;
  const framing = issue
    ? "This is an ISSUE campaign: frame everything around the cause, its goals, and its opposition — there is no candidate."
    : "This is a CANDIDATE campaign: frame everything around our candidate versus the opponent.";

  return [
    `You are the morning analyst for an election-monitoring platform, writing the daily briefing for ${subject} (${ctx.country}).`,
    framing,
    "",
    "Write a concise morning briefing in GitHub-flavoured markdown with exactly these sections, in order:",
    "1. A 2-3 sentence situation summary (plain paragraph, no heading).",
    "2. `## Top narratives` — a bulleted list of the day's leading stories, each one line, grounded in the clusters provided.",
    "3. `## Sentiment` — one or two sentences on how stance-aware sentiment moved versus the prior day.",
    "4. `## Watch items` — 2-3 bulleted, forward-looking things to monitor next.",
    "",
    "Rules: be factual and specific to the data given — never invent numbers, stories, or names. Use sentence case for all prose and headings-content. No emoji. No preamble or sign-off. Keep the whole briefing under ~250 words. If the day was quiet, say so plainly rather than padding.",
  ].join("\n");
}

/** Render the assembled context as a single compact user message. */
export function buildUserContent(ctx: BriefingContext): string {
  const lines: string[] = [];
  lines.push(`Briefing date: ${ctx.briefingDate}`);
  lines.push(
    `Volume (relevance>=30): last 24h = ${ctx.volume}, prior 24h = ${ctx.priorVolume}.`
  );
  lines.push(
    `Average sentiment (−100..100, stance toward our side): last 24h = ${signedOrNa(
      ctx.sentiment
    )}, prior 24h = ${signedOrNa(ctx.priorSentiment)}.`
  );

  if (ctx.topPlatforms.length) {
    lines.push(
      "Top platforms: " +
        ctx.topPlatforms.map((p) => `${p.platform} (${p.count})`).join(", ") +
        "."
    );
  } else {
    lines.push("Top platforms: none.");
  }

  lines.push("");
  lines.push("Story clusters active in the window (label · mentions · avg sentiment):");
  if (ctx.clusters.length) {
    for (const c of ctx.clusters) {
      lines.push(
        `- ${c.label} · ${c.mentionCount} · ${signedOrNa(c.avgSentiment)}` +
          (c.summary ? ` — ${c.summary}` : "")
      );
    }
  } else {
    lines.push("- (no active clusters)");
  }

  lines.push("");
  lines.push("Most notable mentions (platform · reach · sentiment · title):");
  if (ctx.notable.length) {
    for (const m of ctx.notable) {
      lines.push(
        `- ${m.platform} · reach ${m.reach} · ${signedOrNa(m.sentiment)} · ${m.title}`
      );
    }
  } else {
    lines.push("- (none)");
  }

  lines.push("");
  if (ctx.alerts.length) {
    lines.push("Alerts fired in the window (severity · headline · stats):");
    for (const a of ctx.alerts) {
      lines.push(
        `- ${a.severity} · ${a.headline}` + (a.statsLine ? ` · ${a.statsLine}` : "")
      );
    }
  } else {
    lines.push("Alerts fired in the window: none.");
  }

  lines.push("");
  lines.push("Write the briefing now.");
  return lines.join("\n");
}
