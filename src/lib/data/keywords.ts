"use client";

/**
 * Second live surface (S6 Settings → keywords). Where useLiveMentions() only
 * reads, this hook also writes: the Settings keywords card manages real rows in
 * the `keywords` table through it.
 *
 * All four operations go through the anon-key browser client and are governed
 * by RLS (0002_rls.sql): every campaign member may read, but insert/update/
 * delete are owner/operator only — a client_viewer's (or signed-out) write is
 * rejected by the policy and surfaces here as the returned error string, never
 * a throw. `live` is false whenever the Supabase env is absent (createClient()
 * === null) or no session exists, so the card falls straight back to its demo
 * fixtures + "Push to sources" flow.
 *
 * There is no push step: the ingest pollers read this table on every sweep
 * (see src/lib/ingest/**), so an added, paused, or removed keyword simply takes
 * effect at the next hourly run.
 *
 * See src/lib/data/live.ts for the read-only sibling and its `live`-flag idiom.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { CampaignId } from "@/lib/state";
import type { KeywordKind } from "./types";
import { createClient } from "@/lib/supabase/client";

/** One editable keyword row, trimmed to the columns the card renders. */
export interface LiveKeyword {
  id: string;
  term: string;
  kind: KeywordKind;
  is_active: boolean;
}

export interface KeywordManager {
  live: boolean;
  rows: LiveKeyword[];
  /** Insert a keyword; resolves to an error message on failure, null on success. */
  add(term: string, kind: KeywordKind): Promise<string | null>;
  /** Delete a keyword by id; resolves to an error message on failure, null on success. */
  remove(id: string): Promise<string | null>;
  /** Flip is_active; resolves to an error message on failure, null on success. */
  toggle(id: string, active: boolean): Promise<string | null>;
}

/**
 * Live keyword management for a campaign. `live` is true only when the campaign
 * slug resolved to a uuid, the keywords select returned without error, AND an
 * authenticated session exists — a real member with zero keywords is still
 * live, so the gate is the session, not the row count. Any other outcome (no
 * client, error, signed out) yields `{ live: false, rows: [] }` so the card
 * keeps its fixtures. The list refreshes on mount and after each successful
 * mutation; there is no poll (writes are the only thing that change it here).
 */
export function useKeywordManager(campaign: CampaignId): KeywordManager {
  const [state, setState] = useState<{ live: boolean; rows: LiveKeyword[] }>({
    live: false,
    rows: [],
  });
  // Campaign uuid resolved once from the slug, then reused by every mutation so
  // we never re-resolve it per write. null until the first successful load.
  const campaignId = useRef<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const supabase = createClient();
    if (!supabase) {
      campaignId.current = null;
      setState({ live: false, rows: [] });
      return;
    }

    // Slug → campaign uuid. maybeSingle() tolerates zero rows (signed out, RLS
    // hides the campaign) without erroring.
    const { data: camp } = await supabase
      .from("campaigns")
      .select("id")
      .eq("slug", campaign)
      .maybeSingle();
    if (!camp) {
      campaignId.current = null;
      setState({ live: false, rows: [] });
      return;
    }
    campaignId.current = (camp as { id: string }).id;

    const { data, error } = await supabase
      .from("keywords")
      .select("id, term, kind, is_active")
      .eq("campaign_id", campaignId.current)
      .order("created_at", { ascending: true });

    // A member with zero keywords is a valid live state, so gate on the session
    // rather than on row count: signed out, RLS returns zero rows without error.
    const { data: sess } = await supabase.auth.getSession();
    if (error || !data || !sess.session) {
      setState({ live: false, rows: [] });
      return;
    }
    setState({ live: true, rows: data as LiveKeyword[] });
  }, [campaign]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = useCallback(
    async (term: string, kind: KeywordKind): Promise<string | null> => {
      const supabase = createClient();
      if (!supabase || !campaignId.current) return null;
      const { error } = await supabase
        .from("keywords")
        .insert({ campaign_id: campaignId.current, term: term.trim(), kind });
      if (error) return error.message;
      await load();
      return null;
    },
    [load]
  );

  const remove = useCallback(
    async (id: string): Promise<string | null> => {
      const supabase = createClient();
      if (!supabase) return null;
      const { error } = await supabase.from("keywords").delete().eq("id", id);
      if (error) return error.message;
      await load();
      return null;
    },
    [load]
  );

  const toggle = useCallback(
    async (id: string, active: boolean): Promise<string | null> => {
      const supabase = createClient();
      if (!supabase) return null;
      const { error } = await supabase
        .from("keywords")
        .update({ is_active: active })
        .eq("id", id);
      if (error) return error.message;
      await load();
      return null;
    },
    [load]
  );

  return { live: state.live, rows: state.rows, add, remove, toggle };
}
