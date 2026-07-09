"use client";

/**
 * S11 Organic reach — live group management (/[campaign]/reach, operator+).
 *
 * The read-only live hooks (live.ts, liveNarrative.ts) only pull rows; this one,
 * like keywords.ts, also writes: the Reach screen manages real rows in the
 * `organic_groups` table (0001_schema.sql) through it.
 *
 * Every operation goes through the anon-key browser client and is governed by
 * RLS (0002_rls.sql): every campaign member may read, but insert/update/delete
 * are owner/operator only — a client_viewer's (or signed-out) write is rejected
 * by the policy and surfaces here as the returned error string, never a throw.
 * `ready` is false whenever the Supabase env is absent (createClient() === null)
 * or no session exists, so the screen falls straight back to its empty state.
 *
 * The list refreshes on mount, on a 60s poll (share-kit sends and the runbook's
 * Airtable ↔ Postgres mirror can change rows out of band), and after each
 * successful mutation. `monitored` groups have their member-visible chatter
 * pulled into the enrichment pipeline (raw.group_id on the resulting mentions);
 * this screen manages that flag and the join lifecycle, not the discovery step.
 *
 * See src/lib/data/keywords.ts for the RLS-scoped write idiom this mirrors.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { CampaignId } from "@/lib/state";
import { createClient } from "@/lib/supabase/client";

/** organic_groups.platform — the four surfaces S11 tracks (0001_schema.sql). */
export type GroupPlatform = "facebook" | "x" | "reddit" | "discord";

/**
 * organic_groups.join_status — the full runbook lifecycle (0001_schema.sql).
 * Wider than types.ts's JoinStatus (which omits 'do_not_post') because this hook
 * writes the DB column directly and must honor every allowed value.
 */
export type GroupJoinStatus =
  | "none"
  | "requested"
  | "joined"
  | "rejected"
  | "do_not_post";

const POLL_MS = 60_000;

/** DB `platform` value → PlatformChip key (see PF_ICONS in src/lib/ui.ts). */
const PLATFORM_CHIP: Record<string, string> = {
  facebook: "FB",
  x: "X",
  reddit: "RD",
  discord: "DIS",
};

/** Resolve a DB platform to its PlatformChip key (uppercase fallback). */
export function groupChip(platform: string): string {
  return PLATFORM_CHIP[platform] ?? platform.toUpperCase();
}

/** One editable group row, trimmed to the columns the Reach cards render. */
export interface LiveGroup {
  id: string;
  platform: string;
  name: string;
  url: string | null;
  /** Display string ("12.8k") — organic_groups.members is text, not a count. */
  members: string | null;
  category: string | null;
  region: string | null;
  /** Runbook 1–5 relevance score (null until scored). */
  relevance: number | null;
  privacy: string | null;
  allows_political: string | null;
  join_status: GroupJoinStatus;
  monitored: boolean;
  last_posted: string | null;
  cadence: string | null;
}

/** The fields the "Add group" affordance collects. */
export interface AddGroupInput {
  platform: GroupPlatform;
  name: string;
  url: string;
  /** Member count as the runbook's display string ("12.8k"); maps to `members`. */
  members: string;
}

export interface GroupsManager {
  /** True only when the campaign resolved, the select succeeded, AND a session exists. */
  ready: boolean;
  groups: LiveGroup[];
  /** Insert a group; resolves to an error message on failure, null on success. */
  addGroup(input: AddGroupInput): Promise<string | null>;
  /** Flip the monitored flag; resolves to an error message on failure, null on success. */
  setMonitored(id: string, monitored: boolean): Promise<string | null>;
  /** Set the join lifecycle status; resolves to an error message on failure, null on success. */
  setJoinStatus(id: string, status: GroupJoinStatus): Promise<string | null>;
  /** Delete a group by id; resolves to an error message on failure, null on success. */
  removeGroup(id: string): Promise<string | null>;
}

/** The columns we select from `organic_groups` for the Reach screen. */
const SELECT_COLUMNS =
  "id, platform, name, url, members, category, region, relevance, privacy, allows_political, join_status, monitored, last_posted, cadence";

/**
 * Live organic-group management for a campaign. `ready` gates on the session,
 * not the row count: a real member with zero groups is still ready (so the
 * screen shows its "add your first group" empty state rather than falling back
 * to a demo). Any other outcome (no client, error, signed out) yields
 * `{ ready: false, groups: [] }`. Fetches on mount, polls every 60s, and
 * reloads after each successful mutation.
 */
export function useGroups(campaign: CampaignId): GroupsManager {
  const [state, setState] = useState<{ ready: boolean; groups: LiveGroup[] }>({
    ready: false,
    groups: [],
  });
  // Campaign uuid resolved once from the slug, then reused by every insert so we
  // never re-resolve it per write. null until the first successful load.
  const campaignId = useRef<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const supabase = createClient();
    if (!supabase) {
      campaignId.current = null;
      setState({ ready: false, groups: [] });
      return;
    }

    // Slug → campaign uuid. maybeSingle() tolerates zero rows (signed out, RLS
    // hides the campaign) without erroring.
    const { data: camp } = await supabase
      .from("campaigns")
      .select("id")
      .eq("slug", campaign)
      .maybeSingle();
    const resolved = (camp as { id: string } | null) ?? null;
    if (!resolved) {
      campaignId.current = null;
      setState({ ready: false, groups: [] });
      return;
    }
    campaignId.current = resolved.id;

    const { data, error } = await supabase
      .from("organic_groups")
      .select(SELECT_COLUMNS)
      .eq("campaign_id", resolved.id)
      .order("relevance", { ascending: false, nullsFirst: false })
      .order("first_seen", { ascending: true });

    // A member with zero groups is a valid ready state, so gate on the session
    // rather than row count: signed out, RLS returns zero rows without error.
    const { data: sess } = await supabase.auth.getSession();
    if (error || !data || !sess.session) {
      setState({ ready: false, groups: [] });
      return;
    }
    setState({ ready: true, groups: data as unknown as LiveGroup[] });
  }, [campaign]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!cancelled) await load();
    };
    void run();
    const timer = setInterval(() => void run(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [load]);

  const addGroup = useCallback(
    async (input: AddGroupInput): Promise<string | null> => {
      const supabase = createClient();
      if (!supabase || !campaignId.current) return null;
      const url = input.url.trim();
      const members = input.members.trim();
      const { error } = await supabase.from("organic_groups").insert({
        campaign_id: campaignId.current,
        platform: input.platform,
        name: input.name.trim(),
        url: url || null,
        members: members || null,
        join_status: "none",
        monitored: false,
      });
      if (error) return error.message;
      await load();
      return null;
    },
    [load]
  );

  const setMonitored = useCallback(
    async (id: string, monitored: boolean): Promise<string | null> => {
      const supabase = createClient();
      if (!supabase) return null;
      const { error } = await supabase
        .from("organic_groups")
        .update({ monitored })
        .eq("id", id);
      if (error) return error.message;
      await load();
      return null;
    },
    [load]
  );

  const setJoinStatus = useCallback(
    async (id: string, status: GroupJoinStatus): Promise<string | null> => {
      const supabase = createClient();
      if (!supabase) return null;
      const { error } = await supabase
        .from("organic_groups")
        .update({ join_status: status })
        .eq("id", id);
      if (error) return error.message;
      await load();
      return null;
    },
    [load]
  );

  const removeGroup = useCallback(
    async (id: string): Promise<string | null> => {
      const supabase = createClient();
      if (!supabase) return null;
      const { error } = await supabase.from("organic_groups").delete().eq("id", id);
      if (error) return error.message;
      await load();
      return null;
    },
    [load]
  );

  return {
    ready: state.ready,
    groups: state.groups,
    addGroup,
    setMonitored,
    setJoinStatus,
    removeGroup,
  };
}
