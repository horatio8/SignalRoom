/**
 * Campaign type — the discriminator between candidate campaigns and
 * ISSUE-BASED campaigns (a cause/movement with no candidate). Backed by
 * campaigns.campaign_type (migration 0005). This module is the single source
 * of truth for the type union, the tolerant normalizer used everywhere a raw
 * DB value is read, and the display-only terminology adaptation.
 *
 * DISPLAY ONLY: the keywords.kind enum ('candidate' | 'opponent' | 'issue' |
 * 'misspelling') is shared across both modes and is never rewritten. In an
 * issue campaign kind 'candidate' means "our side" (the cause) and 'opponent'
 * means "the opposition"; kindLabel() relabels those two for the UI while the
 * stored value stays the DB enum. Pure module (no "use client") so both client
 * components and the server enrichment worker can import it.
 */

import type { KeywordKind } from "@/lib/data/types";

export type CampaignType = "candidate" | "issue";

const CAMPAIGN_TYPES: CampaignType[] = ["candidate", "issue"];

/**
 * Normalize a raw DB value (or an undefined column, pre-0005) to a CampaignType.
 * Anything unrecognized — including a missing column during the migration
 * transition — falls back to 'candidate', preserving legacy behaviour.
 */
export function asCampaignType(v: unknown): CampaignType {
  return CAMPAIGN_TYPES.includes(v as CampaignType) ? (v as CampaignType) : "candidate";
}

/** Issue-mode relabels for the two "sided" kinds; others are unchanged. */
const ISSUE_KIND_LABELS: Partial<Record<KeywordKind, string>> = {
  candidate: "campaign",
  opponent: "opposition",
};

/**
 * Display label for a keyword kind, adapted to the campaign type. For 'issue'
 * campaigns: candidate → "campaign", opponent → "opposition"; issue and
 * misspelling are unchanged. For 'candidate' campaigns every label is the kind
 * itself (byte-identical to the raw enum).
 */
export function kindLabel(kind: KeywordKind, campaignType: CampaignType): string {
  if (campaignType === "issue") return ISSUE_KIND_LABELS[kind] ?? kind;
  return kind;
}
