/**
 * Mock data access layer. In production this module is the swap point:
 * replace dataFor() with RLS-scoped Supabase queries returning the same
 * view-model shapes (see docs/BACKEND.md).
 */

import type { CampaignId } from "@/lib/state";
import type { CampaignData } from "./types";
import { voss } from "./voss";
import { marsh } from "./marsh";

export * from "./types";
export * from "./shared";

export const CAMPAIGNS: { id: CampaignId; label: string }[] = [
  { id: "voss", label: "Voss for Senate · US-AZ" },
  { id: "marsh", label: "Marsh for Mayor · AU-NSW" },
];

export function isCampaignId(v: string): v is CampaignId {
  return v === "voss" || v === "marsh";
}

export function dataFor(c: CampaignId): CampaignData {
  return c === "marsh" ? marsh : voss;
}
