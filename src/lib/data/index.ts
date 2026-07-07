/**
 * Data-layer barrel. The synthetic per-campaign fixtures (voss/marsh) are gone —
 * the app reads real campaigns from Supabase through the live hooks
 * (live.ts / liveAnalytics.ts / keywords.ts / liveCampaigns.ts). What remains
 * here are the view-model TYPES those hooks map into, plus the non-campaign
 * scaffolding the onboarding wizard renders (shared.ts).
 */

export * from "./types";
export * from "./shared";
