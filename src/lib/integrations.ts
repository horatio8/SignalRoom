/**
 * Per-campaign bring-your-own-credentials (BYOK) for the SURVEYING/MONITORING
 * tools. A campaign may supply its own key for any of these services; when it
 * doesn't, the adapter falls back to the platform env var. See
 * docs/INTEGRATIONS.md §Per-client credentials and the `campaign_integrations`
 * table (supabase/migrations/0003_campaign_integrations.sql).
 *
 * SERVER-ONLY: resolveCredentials() reads secrets (platform env + the
 * credentials store) and MUST NOT be imported from client components — doing so
 * would ship keys into the client bundle. The SURVEY_TOOLS catalog below is the
 * only client-safe export (it carries display metadata + env-var *names*, no
 * values). Keep the resolver on the server (route handlers, workers, server
 * actions). If your toolchain supports it, add `import "server-only";` at the
 * top to fail the build on accidental client import.
 */

export type IntegrationService =
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

/** The 7 SURVEYING/MONITORING tools that support BYOK, in canonical order. */
export const SURVEY_TOOLS: SurveyTool[] = [
  { id: "kwatch", name: "KWatch", desc: "social webhook · primary trigger", envFallback: "KWATCH_API_KEY" },
  { id: "newsdata", name: "NewsData", desc: "news poll · 15 min", envFallback: "NEWSDATA_API_KEY" },
  { id: "gnews", name: "GNews", desc: "news fallback", envFallback: "GNEWS_API_KEY" },
  { id: "apify", name: "Apify", desc: "TikTok + Instagram actors", envFallback: "APIFY_TOKEN" },
  { id: "meta_ad_library", name: "Meta Ad Library", desc: "opponent ads (F1)", envFallback: "META_AD_LIBRARY_TOKEN" },
  { id: "firecrawl", name: "Firecrawl", desc: "group discovery (S11)", envFallback: "FIRECRAWL_API_KEY" },
  { id: "podcastindex", name: "PodcastIndex", desc: "podcast monitoring (F4)", envFallback: "PODCASTINDEX_API_KEY" },
];

/** Where a set of resolved credentials came from. */
export interface ResolvedCredentials {
  source: "campaign" | "platform";
  credentials: Record<string, string> | null;
}

/**
 * Resolve the credentials an adapter should use for `service` on `campaignId`.
 *
 * Resolution rule: the campaign's active `campaign_integrations` row wins; when
 * there is none, fall back to the platform env var named in SURVEY_TOOLS. If
 * neither exists, `credentials` is null (source stays "platform") — the caller
 * decides whether that service is skippable or a hard error.
 *
 * PRODUCTION SHAPE: this is the real signature and the platform-env fallback is
 * implemented. The per-campaign lookup is the ONE swap point — the app still
 * runs on the mock data layer (see src/lib/data/index.ts), so the Supabase read
 * is stubbed out and clearly marked below. Wiring it is: query the row with the
 * service-role client (this bypasses RLS; keep it server-only), and if secrets
 * moved to Supabase Vault, resolve `secret_ref` through `vault.decrypted_secrets`
 * instead of reading the plain jsonb column.
 */
export async function resolveCredentials(
  campaignId: string,
  service: IntegrationService
): Promise<ResolvedCredentials> {
  // ---- SWAP POINT: per-campaign BYOK lookup ----
  // Production implementation (service-role, server-only):
  //
  //   const { data } = await supabaseAdmin
  //     .from("campaign_integrations")
  //     .select("credentials")
  //     .eq("campaign_id", campaignId)
  //     .eq("service", service)
  //     .eq("is_active", true)
  //     .maybeSingle();
  //   if (data?.credentials) {
  //     return { source: "campaign", credentials: data.credentials };
  //   }
  //
  // Until the data layer is swapped there is no store to read, so we fall
  // straight through to the platform env fallback. `campaignId` is referenced
  // to keep the production signature honest.
  void campaignId;

  // ---- Platform env fallback (implemented) ----
  const tool = SURVEY_TOOLS.find((t) => t.id === service);
  const value = tool ? process.env[tool.envFallback] : undefined;

  return {
    source: "platform",
    credentials: value ? { api_key: value } : null,
  };
}
