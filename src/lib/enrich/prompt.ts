/**
 * Prompt + tool contract for the AI enrichment worker (spec §5, S12 narrative
 * fields). This module owns everything the model sees and returns: the system
 * prompt (campaign context, keyword lists, message-platform pillars, open
 * clusters, and the scoring rubrics), the forced `emit_enrichments` tool schema
 * that pins the model to strict JSON, and the per-mention validator that turns
 * loosely-typed tool input into typed, clamped results.
 *
 * Kept separate from index.ts so the wording and the schema can be versioned
 * (`PROMPT_VERSION`) and unit-tested without touching the DB orchestration.
 * SERVER-ONLY by association — it is only imported by the worker.
 */

import type Anthropic from "@anthropic-ai/sdk";

/** Bump when the prompt or tool schema changes in a way that affects output. */
export const PROMPT_VERSION = "enrich-v1";

/** How many mentions we hand the model in a single Messages API call. */
export const MODEL_BATCH = 10;

// ---- Context shapes the worker assembles and passes in ----

export interface EnrichKeywords {
  candidate: string[];
  opponent: string[];
  issue: string[];
}

/** An open cluster the model may attach a mention to (by id). */
export interface OpenClusterRef {
  id: string;
  label: string | null;
  summary: string | null;
}

export interface EnrichContext {
  campaignName: string;
  country: string;
  keywords: EnrichKeywords;
  /** Our message-platform pillars, if the campaign has a platform document. */
  pillars: string[];
  openClusters: OpenClusterRef[];
}

/** One mention as presented to the model. `ref` maps the result back to the row. */
export interface EnrichMentionInput {
  ref: number;
  platform: string;
  author: string | null;
  title: string | null;
  body: string | null;
}

// ---- The strict result the model must return per mention ----

export type EntityKind = "person" | "org" | "place" | "issue";
export type MessageBoxQuadrant = "usUs" | "usThem" | "themUs" | "themThem";

export interface EnrichEntity {
  name: string;
  kind: EntityKind;
  salience: number; // 0..1
}

/** Cluster decision: attach to an existing story, open a new one, or none. */
export type ClusterDecision =
  | { existing_id: string }
  | { new_label: string; new_summary: string }
  | null;

export interface MentionEnrichment {
  ref: number;
  relevance: number; // 0..100
  sentiment: number; // -100..100, stance-aware toward our candidate
  entities: EnrichEntity[];
  topics: string[];
  narrative_theme: string | null;
  message_box_quadrant: MessageBoxQuadrant | null;
  cluster: ClusterDecision;
}

const ENTITY_KINDS: EntityKind[] = ["person", "org", "place", "issue"];
const QUADRANTS: MessageBoxQuadrant[] = ["usUs", "usThem", "themUs", "themThem"];

/**
 * The single tool the model is forced to call. We deliberately keep the schema
 * permissive (no `strict: true`) — the null-unions and the cluster one-of are
 * awkward to express as strict JSON schema, and we re-validate every field in
 * `parseEnrichments()` anyway.
 */
export const ENRICH_TOOL: Anthropic.Tool = {
  name: "emit_enrichments",
  description:
    "Return one enrichment object per mention, keyed by the mention's `ref`.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      results: {
        type: "array",
        description: "One entry per mention. Include every ref you were given.",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            ref: { type: "integer", description: "The mention ref you were given." },
            relevance: {
              type: "integer",
              description: "0-100. Is this actually about the campaign? <30 = noise.",
            },
            sentiment: {
              type: "integer",
              description:
                "-100..100, stance-aware toward OUR candidate. Attacks on the opponent are positive for us.",
            },
            entities: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  name: { type: "string" },
                  kind: { type: "string", enum: ENTITY_KINDS },
                  salience: { type: "number", description: "0-1" },
                },
                required: ["name", "kind", "salience"],
              },
            },
            topics: {
              type: "array",
              items: { type: "string" },
              description: "1-4 short lowercase topic tags.",
            },
            narrative_theme: {
              type: ["string", "null"],
              description:
                "Classify against the listed pillars, or null when no pillars were provided.",
            },
            message_box_quadrant: {
              type: ["string", "null"],
              enum: [...QUADRANTS, null],
              description: "Who is talking about whom, or null.",
            },
            cluster: {
              description:
                "One of: {existing_id}, {new_label,new_summary}, or null.",
              type: ["object", "null"],
              properties: {
                existing_id: { type: "string" },
                new_label: { type: "string" },
                new_summary: { type: "string" },
              },
            },
          },
          required: [
            "ref",
            "relevance",
            "sentiment",
            "entities",
            "topics",
            "narrative_theme",
            "message_box_quadrant",
            "cluster",
          ],
        },
      },
    },
    required: ["results"],
  },
};

/** Assemble the system prompt: context + rubrics. Kept tight and deterministic. */
export function buildSystemPrompt(ctx: EnrichContext): string {
  const kw = (list: string[]) => (list.length ? list.join(", ") : "(none)");

  const clustersBlock = ctx.openClusters.length
    ? ctx.openClusters
        .map(
          (c) =>
            `- id=${c.id} · label=${c.label ?? "(unlabeled)"} · ${
              c.summary ?? "(no summary)"
            }`
        )
        .join("\n")
    : "(no open clusters)";

  const pillarsBlock = ctx.pillars.length
    ? ctx.pillars.map((p) => `- ${p}`).join("\n")
    : "(no message-platform pillars — set narrative_theme to null)";

  return [
    `You are the enrichment engine for an election-monitoring platform. You score social and news mentions for the campaign "${ctx.campaignName}" (${ctx.country}).`,
    "",
    "OUR CANDIDATE keywords: " + kw(ctx.keywords.candidate),
    "OPPONENT keywords: " + kw(ctx.keywords.opponent),
    "TRACKED ISSUE keywords: " + kw(ctx.keywords.issue),
    "",
    "OUR MESSAGE-PLATFORM PILLARS:",
    pillarsBlock,
    "",
    "OPEN STORY CLUSTERS (attach a mention only to an id listed here):",
    clustersBlock,
    "",
    "For each mention, call emit_enrichments with exactly one result per ref. Scoring rubrics:",
    "- relevance (0-100): how much this is genuinely about our candidate, the opponent, or a tracked issue. Below 30 means noise/off-topic.",
    "- sentiment (-100..100): STANCE toward OUR candidate, not raw tone. Praise of us or attacks on the opponent are positive; attacks on us or praise of the opponent are negative. Neutral/factual is near 0.",
    "- entities: the notable people/orgs/places/issues named, each with kind (person|org|place|issue) and salience 0-1.",
    "- topics: 1-4 short lowercase tags.",
    "- narrative_theme: the single closest pillar label above, or null if no pillars are listed.",
    "- message_box_quadrant: usUs (we talk about us), usThem (we talk about them), themUs (they talk about us), themThem (they talk about them), or null if it doesn't fit.",
    "- cluster: {existing_id} to attach to an open cluster above; {new_label,new_summary} to open a new story when it clearly belongs to none; null when it isn't part of any story.",
    "Be precise and deterministic. Do not invent cluster ids.",
  ].join("\n");
}

/** Render the mentions as a single compact user message. */
export function buildUserContent(mentions: EnrichMentionInput[]): string {
  const trunc = (s: string | null, n: number) =>
    s ? (s.length > n ? s.slice(0, n) + "…" : s) : "";
  return mentions
    .map((m) => {
      const parts = [
        `[ref ${m.ref}] platform=${m.platform}` +
          (m.author ? ` author=${m.author}` : ""),
      ];
      const title = trunc(m.title, 200);
      const body = trunc(m.body, 800);
      if (title) parts.push(`title: ${title}`);
      if (body) parts.push(`body: ${body}`);
      if (!title && !body) parts.push("(no text)");
      return parts.join("\n");
    })
    .join("\n\n");
}

// ---- Validation: loose tool input -> typed, clamped results ----

const clampInt = (v: unknown, lo: number, hi: number): number | null => {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return Math.max(lo, Math.min(hi, Math.round(v)));
};

const clampFloat = (v: unknown, lo: number, hi: number): number => {
  if (typeof v !== "number" || !Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
};

function validEntities(v: unknown): EnrichEntity[] {
  if (!Array.isArray(v)) return [];
  const out: EnrichEntity[] = [];
  for (const e of v) {
    if (!e || typeof e !== "object") continue;
    const o = e as Record<string, unknown>;
    if (typeof o.name !== "string" || !o.name.trim()) continue;
    const kind = ENTITY_KINDS.includes(o.kind as EntityKind)
      ? (o.kind as EntityKind)
      : "issue";
    out.push({
      name: o.name.trim(),
      kind,
      salience: Math.round(clampFloat(o.salience, 0, 1) * 100) / 100,
    });
  }
  return out;
}

function validCluster(v: unknown): ClusterDecision {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.existing_id === "string" && o.existing_id.trim()) {
    return { existing_id: o.existing_id.trim() };
  }
  if (typeof o.new_label === "string" && o.new_label.trim()) {
    return {
      new_label: o.new_label.trim(),
      new_summary:
        typeof o.new_summary === "string" ? o.new_summary.trim() : "",
    };
  }
  return null;
}

/**
 * Parse the tool `input` into a map keyed by ref. Any entry that is malformed
 * or missing its required numeric scores is dropped — the caller marks those
 * refs `enrich_failed`. Throws only if the top-level shape is unusable (which
 * the caller treats as a whole-call failure).
 */
export function parseEnrichments(input: unknown): Map<number, MentionEnrichment> {
  const map = new Map<number, MentionEnrichment>();
  if (!input || typeof input !== "object") return map;
  const results = (input as Record<string, unknown>).results;
  if (!Array.isArray(results)) return map;

  for (const r of results) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const ref = clampInt(o.ref, 0, Number.MAX_SAFE_INTEGER);
    const relevance = clampInt(o.relevance, 0, 100);
    const sentiment = clampInt(o.sentiment, -100, 100);
    // ref and both core scores are mandatory; missing -> skip (marked failed).
    if (ref === null || relevance === null || sentiment === null) continue;

    const topics = Array.isArray(o.topics)
      ? o.topics
          .filter((t): t is string => typeof t === "string" && !!t.trim())
          .map((t) => t.trim().toLowerCase())
          .slice(0, 4)
      : [];

    const quadrant = QUADRANTS.includes(o.message_box_quadrant as MessageBoxQuadrant)
      ? (o.message_box_quadrant as MessageBoxQuadrant)
      : null;

    map.set(ref, {
      ref,
      relevance,
      sentiment,
      entities: validEntities(o.entities),
      topics,
      narrative_theme:
        typeof o.narrative_theme === "string" && o.narrative_theme.trim()
          ? o.narrative_theme.trim()
          : null,
      message_box_quadrant: quadrant,
      cluster: validCluster(o.cluster),
    });
  }
  return map;
}
