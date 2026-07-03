/**
 * Per-campaign bring-your-own-credentials (BYOK) for the SURVEYING/MONITORING
 * tools. A campaign may supply its own key for any of these services; when it
 * doesn't, the adapter falls back to the platform env var. See
 * docs/INTEGRATIONS.md §Per-client credentials and the `campaign_integrations`
 * table (supabase/migrations/0003_campaign_integrations.sql).
 *
 * CLIENT-SAFE: this module carries display metadata + env-var *names* only, no
 * values — client components may import SURVEY_TOOLS freely. The secret-reading
 * resolver (resolveCredentials) lives in src/lib/integrations.server.ts behind
 * a `server-only` import guard so accidental client import fails the build.
 */

export type IntegrationService =
  | "scrapecreators"
  | "ensembledata"
  | "kwatch"
  | "newsdata"
  | "gnews"
  | "apify"
  | "meta_ad_library"
  | "firecrawl"
  | "podcastindex";

export interface SurveyTool {
  id: IntegrationService;
  name: string; // display name, e.g. "KWatch"
  desc: string; // one-liner, sentence case, e.g. "social webhook · seconds"
  envFallback: string; // platform env var name, e.g. "KWATCH_API_KEY"
}

/** The SURVEYING/MONITORING tools that support BYOK, in canonical order. */
export const SURVEY_TOOLS: SurveyTool[] = [
  { id: "scrapecreators", name: "ScrapeCreators", desc: "FB · IG · TikTok · X · YT · Reddit keyword search — primary", envFallback: "SCRAPECREATORS_API_KEY" },
  { id: "ensembledata", name: "EnsembleData", desc: "TikTok keyword search · unit-based", envFallback: "ENSEMBLEDATA_API_KEY" },
  { id: "kwatch", name: "KWatch", desc: "social webhook · optional", envFallback: "KWATCH_API_KEY" },
  { id: "newsdata", name: "NewsData", desc: "news poll · 15 min", envFallback: "NEWSDATA_API_KEY" },
  { id: "gnews", name: "GNews", desc: "news fallback", envFallback: "GNEWS_API_KEY" },
  { id: "apify", name: "Apify", desc: "TikTok + Instagram actors", envFallback: "APIFY_TOKEN" },
  { id: "meta_ad_library", name: "Meta Ad Library", desc: "opponent ads (F1)", envFallback: "META_AD_LIBRARY_TOKEN" },
  { id: "firecrawl", name: "Firecrawl", desc: "group discovery (S11)", envFallback: "FIRECRAWL_API_KEY" },
  { id: "podcastindex", name: "PodcastIndex", desc: "podcast monitoring (F4)", envFallback: "PODCASTINDEX_API_KEY" },
];

// Credential resolution lives in src/lib/integrations.server.ts
// (resolveCredentials) — it reads secrets and is server-only by import guard.
