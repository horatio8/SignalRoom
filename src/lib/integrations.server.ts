import "server-only";

/**
 * Server half of the BYOK integration layer: credential resolution. Split from
 * src/lib/integrations.ts (the client-safe catalog) so client components can
 * import SURVEY_TOOLS without webpack pulling the service-role Supabase client
 * — and its `server-only` guard — into their bundle.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { SURVEY_TOOLS, type IntegrationService } from "@/lib/integrations";

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
 * The per-campaign lookup reads `campaign_integrations` with the service-role
 * client (bypasses RLS). When Supabase isn't configured (local demo) it falls
 * straight through to the platform env fallback. If secrets move to Supabase
 * Vault, resolve `secret_ref` through `vault.decrypted_secrets` instead of
 * reading the plain jsonb column.
 */
export async function resolveCredentials(
  campaignId: string,
  service: IntegrationService
): Promise<ResolvedCredentials> {
  // ---- Per-campaign BYOK lookup (campaign key wins) ----
  const admin = supabaseAdmin();
  if (admin) {
    const { data } = await admin
      .from("campaign_integrations")
      .select("credentials")
      .eq("campaign_id", campaignId)
      .eq("service", service)
      .eq("is_active", true)
      .maybeSingle();
    if (data?.credentials) {
      return { source: "campaign", credentials: data.credentials };
    }
  }

  // ---- Platform env fallback ----
  const tool = SURVEY_TOOLS.find((t) => t.id === service);
  const value = tool ? process.env[tool.envFallback] : undefined;

  return {
    source: "platform",
    credentials: value ? { api_key: value } : null,
  };
}
