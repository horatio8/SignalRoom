"use client";

/**
 * Live per-campaign BYOK credential management (S6 Settings → Client
 * integrations card). Sibling of src/lib/data/keywords.ts: same anon-key
 * browser-client + RLS idiom, but for the `campaign_integrations` table
 * (supabase/migrations/0003_campaign_integrations.sql).
 *
 * This is the WRITE side that feeds resolveCredentials() in
 * src/lib/integrations.server.ts — a key saved here lands in the campaign's
 * active row, and the resolver (service-role) reads it before the platform env
 * fallback on the next ingest run.
 *
 * RLS on 0003 is STRICTER than the other tables: BOTH read and write are
 * owner/operator only. So an authenticated owner/operator reads+writes this
 * table directly through the browser client and the policy enforces the gate —
 * no service-role route needed. A client_viewer's (or signed-out) save/remove
 * is rejected by the policy and surfaces here as the returned error string,
 * never a throw.
 *
 * SECRET HYGIENE: the full api_key is never kept in React state. `load()`
 * reduces each row's credentials.api_key to a masked hint ("••••" + last4) plus
 * a `hasKey` boolean the moment it arrives; the raw value is dropped. RLS
 * already limits who can read the table, but we avoid surfacing more of the
 * secret than the masked display the card needs.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { IntegrationService } from "@/lib/integrations";
import { createClient } from "@/lib/supabase/client";

/** The masked, secret-free view of one saved credential the card renders. */
export interface KeyHint {
  hasKey: boolean;
  masked: string;
}

export interface CampaignKeys {
  /** True only with a browser client + an authenticated session. */
  ready: boolean;
  /** service → masked hint. Missing entry ⇒ no client key (platform fallback). */
  keys: Record<string, KeyHint>;
  /** Upsert the campaign key for a service; error message on failure, null on success. */
  save(service: IntegrationService, apiKey: string): Promise<string | null>;
  /** Delete the campaign key for a service; error message on failure, null on success. */
  remove(service: IntegrationService): Promise<string | null>;
}

/** "••••" + the last four characters of the stored key (or just "••••"). */
function mask(apiKey: unknown): string {
  const s = typeof apiKey === "string" ? apiKey : "";
  return "••••" + s.slice(-4);
}

/**
 * Live BYOK key management for a campaign. `ready` is true only when the
 * campaign slug resolved to a uuid, the integrations select returned without
 * error, AND an authenticated session exists — mirroring keywords.ts's `live`
 * gate (the session, not the row count). Any other outcome (no client, error,
 * signed out) yields `{ ready: false, keys: {} }` and no-op mutations, so the
 * card falls back to showing every tool on its platform key. The map refreshes
 * on mount and after each successful save/remove.
 */
export function useCampaignKeys(campaign: string): CampaignKeys {
  const [state, setState] = useState<{ ready: boolean; keys: Record<string, KeyHint> }>({
    ready: false,
    keys: {},
  });
  // Campaign uuid resolved once from the slug, reused by every mutation so we
  // never re-resolve it per write. null until the first successful load.
  const campaignId = useRef<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const supabase = createClient();
    if (!supabase) {
      campaignId.current = null;
      setState({ ready: false, keys: {} });
      return;
    }

    // Slug → campaign uuid. maybeSingle() tolerates zero rows (signed out, or
    // RLS hides the campaign) without erroring.
    const { data: camp } = await supabase
      .from("campaigns")
      .select("id")
      .eq("slug", campaign)
      .maybeSingle();
    if (!camp) {
      campaignId.current = null;
      setState({ ready: false, keys: {} });
      return;
    }
    campaignId.current = (camp as { id: string }).id;

    const { data, error } = await supabase
      .from("campaign_integrations")
      .select("service, credentials")
      .eq("campaign_id", campaignId.current)
      .eq("is_active", true);

    // Gate readiness on the session, not the row count: a real owner/operator
    // with zero saved keys is still ready. Signed out, RLS returns zero rows
    // without error, so also require a session before trusting the (empty) map.
    const { data: sess } = await supabase.auth.getSession();
    if (error || !data || !sess.session) {
      setState({ ready: false, keys: {} });
      return;
    }

    // Reduce each row to a masked hint immediately — the raw api_key never
    // enters React state.
    const keys: Record<string, KeyHint> = {};
    for (const row of data as { service: string; credentials: { api_key?: string } | null }[]) {
      keys[row.service] = { hasKey: true, masked: mask(row.credentials?.api_key) };
    }
    setState({ ready: true, keys });
  }, [campaign]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(
    async (service: IntegrationService, apiKey: string): Promise<string | null> => {
      const supabase = createClient();
      if (!supabase || !campaignId.current) return null;
      const trimmed = apiKey.trim();
      if (!trimmed) return null;
      // Unique (campaign_id, service) constraint on 0003 lets us upsert on that
      // pair — a re-saved key replaces the existing row rather than duplicating.
      const { error } = await supabase
        .from("campaign_integrations")
        .upsert(
          {
            campaign_id: campaignId.current,
            service,
            credentials: { api_key: trimmed },
            is_active: true,
          },
          { onConflict: "campaign_id,service" }
        );
      // RLS denial (client_viewer) or a check-constraint rejection surfaces here.
      if (error) return error.message;
      await load();
      return null;
    },
    [load]
  );

  const remove = useCallback(
    async (service: IntegrationService): Promise<string | null> => {
      const supabase = createClient();
      if (!supabase || !campaignId.current) return null;
      // Delete (not is_active=false) so the row is gone and the resolver falls
      // cleanly back to the platform key.
      const { error } = await supabase
        .from("campaign_integrations")
        .delete()
        .eq("campaign_id", campaignId.current)
        .eq("service", service);
      if (error) return error.message;
      await load();
      return null;
    },
    [load]
  );

  return { ready: state.ready, keys: state.keys, save, remove };
}
