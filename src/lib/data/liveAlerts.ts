"use client";

/**
 * Live reads for the Alerts screen (S5) — fired `alerts` plus the active
 * `alert_rules` for a campaign. Follows the read-only idiom of live.ts /
 * liveAnalytics.ts: the anon-key browser client is governed by RLS
 * (0002_rls.sql), reads are scoped to campaign members via
 * campaigns!inner(slug). Signed out — or with the Supabase env absent (demo
 * mode, createClient() === null) — the queries return zero rows, `live` stays
 * false, and the screen shows its empty state. Live data is strictly additive.
 *
 * Fetches once on mount, then polls every 60s until unmount.
 */

import { useEffect, useState } from "react";
import type { CampaignId } from "@/lib/state";
import { createClient } from "@/lib/supabase/client";

const POLL_MS = 60_000;

export type Severity = "info" | "watch" | "urgent";

/** One fired alert row, shaped for the screen. */
export interface LiveAlert {
  id: string;
  severity: Severity;
  headline: string;
  statsLine: string | null;
  situationRead: string | null;
  firedAt: string | null;
}

/** One active rule row (the detector set). */
export interface LiveRule {
  id: string;
  name: string;
  severity: Severity;
  cooldownMinutes: number;
}

export interface LiveAlerts {
  /** True only when the alerts query succeeded AND returned ≥ 1 row. */
  live: boolean;
  alerts: LiveAlert[];
  rules: LiveRule[];
}

interface AlertDbRow {
  id: string;
  severity: string | null;
  headline: string | null;
  stats_line: string | null;
  situation_read: string | null;
  fired_at: string | null;
}

interface RuleDbRow {
  id: string;
  name: string | null;
  severity: string | null;
  cooldown_minutes: number | null;
}

const EMPTY: LiveAlerts = { live: false, alerts: [], rules: [] };

/** Coerce any DB severity into the fixed 3-level language; default info. */
function asSeverity(s: string | null): Severity {
  return s === "urgent" ? "urgent" : s === "watch" ? "watch" : "info";
}

function toAlert(row: AlertDbRow): LiveAlert {
  return {
    id: row.id,
    severity: asSeverity(row.severity),
    headline: row.headline?.trim() || "Alert",
    statsLine: row.stats_line,
    situationRead: row.situation_read,
    firedAt: row.fired_at,
  };
}

function toRule(row: RuleDbRow): LiveRule {
  return {
    id: row.id,
    name: row.name?.trim() || "Unnamed rule",
    severity: asSeverity(row.severity),
    cooldownMinutes: row.cooldown_minutes ?? 60,
  };
}

/**
 * Live alerts + active rules for a campaign. `live` is true only when the
 * alerts query succeeded AND returned ≥ 1 row; any other outcome yields the
 * empty shape so the screen shows its "no alerts yet" state. The rules read is
 * best-effort and returned regardless of `live`.
 */
export function useLiveAlerts(campaign: CampaignId): LiveAlerts {
  const [state, setState] = useState<LiveAlerts>(EMPTY);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) {
      setState(EMPTY);
      return;
    }

    let cancelled = false;

    const load = async () => {
      const [ares, rres] = await Promise.all([
        supabase
          .from("alerts")
          .select(
            "id, severity, headline, stats_line, situation_read, fired_at, campaigns!inner(slug)"
          )
          .eq("campaigns.slug", campaign)
          .order("fired_at", { ascending: false, nullsFirst: false })
          .limit(50),
        supabase
          .from("alert_rules")
          .select("id, name, severity, cooldown_minutes, campaigns!inner(slug)")
          .eq("campaigns.slug", campaign)
          .eq("is_active", true),
      ]);

      if (cancelled) return;

      const rules =
        !rres.error && rres.data
          ? (rres.data as unknown as RuleDbRow[]).map(toRule)
          : [];

      if (ares.error || !ares.data || ares.data.length === 0) {
        setState({ live: false, alerts: [], rules });
        return;
      }

      const alerts = (ares.data as unknown as AlertDbRow[]).map(toAlert);
      setState({ live: true, alerts, rules });
    };

    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [campaign]);

  return state;
}
