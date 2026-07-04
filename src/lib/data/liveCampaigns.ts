"use client";

/**
 * Live campaign navigation source. Where useLiveMentions() / useKeywordManager()
 * read a single campaign's rows, this hook lists the campaigns the signed-in
 * user can actually see, so the app chrome (campaign switcher + the [campaign]
 * layout gate) can route to real DB campaigns — not just the two fixtures.
 *
 * The read goes through the anon-key browser client and is governed by RLS
 * (0002_rls.sql): rows are scoped to the user's campaign_members. Signed out —
 * or with the Supabase env absent (demo mode, createClient() === null) — the
 * query returns zero rows and the hook yields `{ campaigns: [] }`, so the
 * fixtures remain the only options. Live data is strictly additive.
 *
 * See src/lib/data/live.ts for the read-only idiom this follows.
 */

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { asCampaignType, type CampaignType } from "@/lib/campaignType";

/** One campaign the user can navigate to, trimmed to what the chrome needs. */
export interface LiveCampaign {
  slug: string;
  name: string;
  campaign_type: CampaignType;
}

interface CampaignRow {
  slug: string;
  name: string;
  campaign_type?: string | null;
}

/**
 * The campaigns visible to the signed-in user. `loading` is true until the
 * first read settles; callers use it to avoid a redirect/flash while a lookup
 * is in flight. No client (demo mode) resolves immediately to an empty list.
 * Fetches once on mount — the set of campaigns changes rarely, so there is no
 * poll (unlike the mentions feed).
 */
export function useLiveCampaigns(): { campaigns: LiveCampaign[]; loading: boolean } {
  const [state, setState] = useState<{ campaigns: LiveCampaign[]; loading: boolean }>({
    campaigns: [],
    loading: true,
  });

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) {
      setState({ campaigns: [], loading: false });
      return;
    }

    let cancelled = false;

    const load = async () => {
      // Preferred read includes campaign_type (migration 0005). RLS scopes rows
      // to the user's memberships; signed out → zero rows without error.
      let rows: CampaignRow[] = [];
      const withType = await supabase
        .from("campaigns")
        .select("slug, name, campaign_type")
        .order("name", { ascending: true });

      if (withType.error) {
        // Migration-transition fallback: 0005 not applied yet, so campaign_type
        // does not exist and the select errors. Retry selecting slug + name only
        // and let asCampaignType() default every row to 'candidate', so the
        // switcher and layout still work before the migration lands.
        const noType = await supabase
          .from("campaigns")
          .select("slug, name")
          .order("name", { ascending: true });
        rows = (noType.data as CampaignRow[] | null) ?? [];
      } else {
        rows = (withType.data as CampaignRow[] | null) ?? [];
      }

      if (cancelled) return;
      const campaigns: LiveCampaign[] = rows.map((r) => ({
        slug: r.slug,
        name: r.name,
        campaign_type: asCampaignType(r.campaign_type),
      }));
      setState({ campaigns, loading: false });
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

/**
 * A single live campaign by slug, derived from useLiveCampaigns(). `exists` is
 * false while `loading` — callers must consult `loading` before treating an
 * absent campaign as truly missing (see the [campaign] layout's no-flash gate).
 * `campaign_type` defaults to 'candidate' when the slug isn't a live campaign.
 */
export function useLiveCampaign(slug: string): {
  exists: boolean;
  name: string | null;
  campaign_type: CampaignType;
  loading: boolean;
} {
  const { campaigns, loading } = useLiveCampaigns();
  const match = campaigns.find((c) => c.slug === slug);
  return {
    exists: !!match,
    name: match?.name ?? null,
    campaign_type: match?.campaign_type ?? "candidate",
    loading,
  };
}
