"use client";

/**
 * Live briefing/alert recipient management (S6 Settings → Delivery card). A
 * sibling of useKeywordManager: same anon-key browser client, same RLS gate.
 *
 * Recipients are plain addresses (M3) — they receive the morning briefing
 * and/or urgent alerts by email and need no account, so they live in
 * `campaign_recipients`, separate from campaign_members (who log in). The
 * delivery worker (src/lib/delivery) reads this list.
 *
 * All four operations go through RLS (migration 0009): every campaign member
 * may read, but insert/update/delete are owner/operator only — a client_viewer's
 * (or signed-out) write is rejected by the policy and surfaces here as the
 * returned error string, never a throw. `ready` is false whenever the Supabase
 * env is absent (createClient() === null) or no session exists, so the card can
 * fall back to a signed-out note.
 *
 * See src/lib/data/keywords.ts for the read+write idiom this mirrors.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { CampaignId } from "@/lib/state";
import { createClient } from "@/lib/supabase/client";

/** One recipient row, trimmed to the columns the card renders. */
export interface LiveRecipient {
  id: string;
  email: string;
  name: string | null;
  gets_briefing: boolean;
  gets_urgent: boolean;
}

/** Which per-recipient stream a toggle flips. */
export type RecipientField = "gets_briefing" | "gets_urgent";

export interface RecipientManager {
  /** True only when a real, RLS-scoped read succeeded under an auth session. */
  ready: boolean;
  recipients: LiveRecipient[];
  /** Insert a recipient; resolves to an error message on failure, null on success. */
  add(
    email: string,
    name: string,
    opts: { briefing: boolean; urgent: boolean }
  ): Promise<string | null>;
  /** Delete a recipient by id; resolves to an error message on failure, null on success. */
  remove(id: string): Promise<string | null>;
  /** Flip gets_briefing/gets_urgent; resolves to an error message on failure, null on success. */
  toggle(id: string, field: RecipientField, value: boolean): Promise<string | null>;
}

/**
 * Live recipient management for a campaign. `ready` is true only when the
 * campaign slug resolved to a uuid, the recipients select returned without
 * error, AND an authenticated session exists — a real member with zero
 * recipients is still ready, so the gate is the session, not the row count. Any
 * other outcome (no client, error, signed out) yields
 * `{ ready: false, recipients: [] }`. The list refreshes on mount and after
 * each successful mutation; there is no poll (writes are the only thing that
 * change it here).
 */
export function useRecipients(campaign: CampaignId): RecipientManager {
  const [state, setState] = useState<{
    ready: boolean;
    recipients: LiveRecipient[];
  }>({ ready: false, recipients: [] });
  // Campaign uuid resolved once from the slug, then reused by every mutation.
  const campaignId = useRef<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const supabase = createClient();
    if (!supabase) {
      campaignId.current = null;
      setState({ ready: false, recipients: [] });
      return;
    }

    // Slug → campaign uuid. maybeSingle() tolerates zero rows (signed out, or
    // RLS hides the campaign) without erroring.
    const { data: camp } = await supabase
      .from("campaigns")
      .select("id")
      .eq("slug", campaign)
      .maybeSingle<{ id: string }>();
    if (!camp) {
      campaignId.current = null;
      setState({ ready: false, recipients: [] });
      return;
    }
    campaignId.current = camp.id;

    const { data, error } = await supabase
      .from("campaign_recipients")
      .select("id, email, name, gets_briefing, gets_urgent")
      .eq("campaign_id", camp.id)
      .order("created_at", { ascending: true });

    // A member with zero recipients is a valid ready state, so gate on the
    // session rather than the row count: signed out, RLS returns zero rows.
    const { data: sess } = await supabase.auth.getSession();
    if (error || !data || !sess.session) {
      setState({ ready: false, recipients: [] });
      return;
    }
    setState({ ready: true, recipients: data as LiveRecipient[] });
  }, [campaign]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = useCallback(
    async (
      email: string,
      name: string,
      opts: { briefing: boolean; urgent: boolean }
    ): Promise<string | null> => {
      const supabase = createClient();
      if (!supabase || !campaignId.current) return null;
      const trimmedName = name.trim();
      const { error } = await supabase.from("campaign_recipients").insert({
        campaign_id: campaignId.current,
        email: email.trim().toLowerCase(),
        name: trimmedName ? trimmedName : null,
        gets_briefing: opts.briefing,
        gets_urgent: opts.urgent,
      });
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
      const { error } = await supabase
        .from("campaign_recipients")
        .delete()
        .eq("id", id);
      if (error) return error.message;
      await load();
      return null;
    },
    [load]
  );

  const toggle = useCallback(
    async (
      id: string,
      field: RecipientField,
      value: boolean
    ): Promise<string | null> => {
      const supabase = createClient();
      if (!supabase) return null;
      const { error } = await supabase
        .from("campaign_recipients")
        .update({ [field]: value })
        .eq("id", id);
      if (error) return error.message;
      await load();
      return null;
    },
    [load]
  );

  return {
    ready: state.ready,
    recipients: state.recipients,
    add,
    remove,
    toggle,
  };
}
