"use client";

/**
 * S10 Respond — the live draft → approve pipeline over the `responses` table
 * (schema §14). Sibling to keywords.ts: an RLS-scoped browser hook that both
 * reads and writes, returning an error string|null from every mutation rather
 * than throwing.
 *
 * All operations go through the anon-key browser client and are governed by
 * two layers from 0002_rls.sql:
 *   1. RLS — every campaign member may read; insert/update/delete are
 *      owner/operator only. A client_viewer's (or signed-out) write matches
 *      zero rows under the write policy, which we detect via `.select()`
 *      returning an empty set and surface as a denial string.
 *   2. The `responses_approval_gate` trigger — the §14 HARD GATE. When a row
 *      moves draft → approved (or published) the trigger requires a real
 *      auth.uid() and stamps approved_by/approved_at itself. We therefore set
 *      ONLY `status: 'approved'` and never touch approved_by: a worker/anon
 *      caller (auth.uid() null) makes the trigger RAISE, surfaced here as
 *      error.message.
 *
 * `ready` gates on an authenticated session (like keywords.ts's `live`): a real
 * member with zero responses is still ready, so the gate is the session, not
 * the row count. Refreshes on mount, on a 60s poll, and after each successful
 * mutation.
 *
 * NOTE: `responses` carries no created_at column (schema §14) — its only
 * timestamps are approved_at/published_at — so the list is ordered by
 * approved_at (nulls, i.e. unapproved drafts, first) and then bucketed by
 * status in the screen.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { CampaignId } from "@/lib/state";
import { createClient } from "@/lib/supabase/client";

/** The exact status enum from responses.status (0001_schema.sql). */
export type ResponseStatus = "draft" | "approved" | "published" | "spiked";

/** One response row, trimmed + flattened to the fields the board renders. */
export interface LiveResponse {
  id: string;
  /** The response body — maps to responses.chosen (the selected wording). */
  text: string;
  /** Register/kind of response — maps to responses.kind. */
  register: string | null;
  /** What spike/claim this answers — maps to channel_refs.target. */
  target: string | null;
  /** Intended channel — maps to channel_refs.channel (publish is a later phase). */
  channel: string | null;
  status: ResponseStatus;
  /** Stamped by the trigger on approval; the audited §14 sign-off. */
  approved_by: string | null;
  approved_at: string | null;
  published_at: string | null;
}

/** Composer input for a new/edited draft. */
export interface DraftInput {
  text: string;
  register?: string;
  target?: string;
  channel?: string;
}

/** Raw shape selected from `responses`. */
interface ResponseRow {
  id: string;
  kind: string | null;
  chosen: string | null;
  status: ResponseStatus;
  approved_by: string | null;
  approved_at: string | null;
  published_at: string | null;
  channel_refs: { target?: string | null; channel?: string | null } | null;
}

export interface ResponseManager {
  /** True only with a live session + a successful load (mirrors keywords `live`). */
  ready: boolean;
  responses: LiveResponse[];
  /** Insert a status='draft' row. Error message on failure, null on success. */
  createDraft(input: DraftInput): Promise<string | null>;
  /** Edit a draft's text/fields (draft rows only). Error string|null. */
  updateDraft(id: string, fields: DraftInput): Promise<string | null>;
  /**
   * Move a draft to 'approved'. Sets ONLY status — the DB trigger enforces the
   * §14 gate and stamps approved_by = auth.uid(). Error string|null.
   */
  approve(id: string): Promise<string | null>;
  /** Reject a draft: status → 'spiked' (the schema's kill value). Error string|null. */
  reject(id: string): Promise<string | null>;
  /** Delete a draft outright. Error string|null. */
  discard(id: string): Promise<string | null>;
}

const POLL_MS = 60_000;

function toResponse(row: ResponseRow): LiveResponse {
  const refs = row.channel_refs ?? {};
  return {
    id: row.id,
    text: row.chosen ?? "",
    register: row.kind,
    target: refs.target ?? null,
    channel: refs.channel ?? null,
    status: row.status,
    approved_by: row.approved_by,
    approved_at: row.approved_at,
    published_at: row.published_at,
  };
}

/** Structured channel_refs payload from composer fields (null when both empty). */
function toChannelRefs(
  target?: string,
  channel?: string
): { target: string | null; channel: string | null } | null {
  const t = target?.trim() || null;
  const c = channel?.trim() || null;
  return t || c ? { target: t, channel: c } : null;
}

/**
 * Live response pipeline for a campaign. Any non-ready outcome (no client,
 * error, signed out) yields `{ ready: false, responses: [] }` so the screen
 * falls back to its "runs on live data" state — there are no fixtures here.
 */
export function useResponses(campaign: CampaignId): ResponseManager {
  const [state, setState] = useState<{ ready: boolean; responses: LiveResponse[] }>({
    ready: false,
    responses: [],
  });
  // Campaign uuid resolved once from the slug, then reused by every mutation.
  const campaignId = useRef<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const supabase = createClient();
    if (!supabase) {
      campaignId.current = null;
      setState({ ready: false, responses: [] });
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
      setState({ ready: false, responses: [] });
      return;
    }
    campaignId.current = (camp as { id: string }).id;

    const { data, error } = await supabase
      .from("responses")
      .select(
        "id, kind, chosen, status, approved_by, approved_at, published_at, channel_refs"
      )
      .eq("campaign_id", campaignId.current)
      // No created_at on responses; approved_at is the only creation-adjacent
      // timestamp. nullsFirst floats pending drafts to the top.
      .order("approved_at", { ascending: false, nullsFirst: true });

    // Gate on the session, not row count: a member with zero responses is
    // still ready. Signed out, RLS returns zero rows without error.
    const { data: sess } = await supabase.auth.getSession();
    if (error || !data || !sess.session) {
      setState({ ready: false, responses: [] });
      return;
    }
    setState({ ready: true, responses: (data as ResponseRow[]).map(toResponse) });
  }, [campaign]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const createDraft = useCallback(
    async (input: DraftInput): Promise<string | null> => {
      const supabase = createClient();
      if (!supabase || !campaignId.current) return null;
      const { error } = await supabase.from("responses").insert({
        campaign_id: campaignId.current,
        status: "draft",
        chosen: input.text.trim(),
        kind: input.register?.trim() || null,
        channel_refs: toChannelRefs(input.target, input.channel),
      });
      if (error) return error.message;
      await load();
      return null;
    },
    [load]
  );

  const updateDraft = useCallback(
    async (id: string, fields: DraftInput): Promise<string | null> => {
      const supabase = createClient();
      if (!supabase) return null;
      const { data, error } = await supabase
        .from("responses")
        .update({
          chosen: fields.text.trim(),
          kind: fields.register?.trim() || null,
          channel_refs: toChannelRefs(fields.target, fields.channel),
        })
        .eq("id", id)
        // Only drafts are editable; once approved the wording is locked.
        .eq("status", "draft")
        .select("id");
      if (error) return error.message;
      if (!data || data.length === 0)
        return "Edit denied — only draft rows are editable, and only by owner/operator.";
      await load();
      return null;
    },
    [load]
  );

  const approve = useCallback(
    async (id: string): Promise<string | null> => {
      const supabase = createClient();
      if (!supabase) return null;
      // §14 HARD GATE. We set ONLY status; the responses_approval_gate trigger
      // requires auth.uid() and stamps approved_by/approved_at. A signed-out
      // caller makes the trigger RAISE (→ error.message); a client_viewer is
      // filtered by the RLS write policy (→ 0 rows → denial message below).
      const { data, error } = await supabase
        .from("responses")
        .update({ status: "approved" })
        .eq("id", id)
        .eq("status", "draft")
        .select("id, approved_by");
      if (error) return error.message;
      if (!data || data.length === 0)
        return "Approval denied — approving is owner/operator only and needs a live session (the §14 gate).";
      await load();
      return null;
    },
    [load]
  );

  const reject = useCallback(
    async (id: string): Promise<string | null> => {
      const supabase = createClient();
      if (!supabase) return null;
      const { data, error } = await supabase
        .from("responses")
        .update({ status: "spiked" })
        .eq("id", id)
        .eq("status", "draft")
        .select("id");
      if (error) return error.message;
      if (!data || data.length === 0)
        return "Reject denied — spiking a draft is owner/operator only.";
      await load();
      return null;
    },
    [load]
  );

  const discard = useCallback(
    async (id: string): Promise<string | null> => {
      const supabase = createClient();
      if (!supabase) return null;
      const { error } = await supabase
        .from("responses")
        .delete()
        .eq("id", id)
        .eq("status", "draft");
      if (error) return error.message;
      await load();
      return null;
    },
    [load]
  );

  return {
    ready: state.ready,
    responses: state.responses,
    createDraft,
    updateDraft,
    approve,
    reject,
    discard,
  };
}
