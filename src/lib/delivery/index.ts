/**
 * Email delivery worker (§7 email channel, M3 plain-address recipients). Runs on
 * a cron: emails the briefings that were generated but never sent, and the
 * urgent alerts that fired but were never delivered. Recipients live in
 * `campaign_recipients` (no account required) and opt in per stream via
 * gets_briefing / gets_urgent.
 *
 * Exposed as `runDelivery()` so the cron route (and any backfill) share it.
 * SERVER-ONLY: it uses the service-role Supabase client and the Resend key —
 * never import from a client component.
 *
 * Gated on RESEND_API_KEY: with the key absent the whole run is a no-op skip
 * (not an error), so a deploy with delivery switched off costs nothing.
 *
 * NOTE: unlike the ingest/enrich/sync workers this run writes NO service_runs
 * row — that table's kind check constraint only permits ingest/enrich/
 * sync_airtable. Progress is recorded on the source rows instead (briefings.
 * sent_at, alerts.delivered), which is also what makes the run idempotent: a
 * stamped row is skipped next sweep, and a failed send is left unstamped so it
 * retries.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { deliveryConfigured, sendEmail } from "./resend";

/** Only look back this far so a long backlog can't be re-sent en masse. */
const BRIEFING_LOOKBACK_MS = 2 * 24 * 60 * 60 * 1000; // 2 days
const ALERT_LOOKBACK_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface DeliverySummary {
  /** Number of briefing rows successfully emailed and stamped this run. */
  briefingsSent: number;
  /** Number of urgent alert rows successfully emailed and stamped this run. */
  alertsSent: number;
  /** Present (and the only field that matters) when delivery is switched off. */
  skipped?: string;
  /** Non-fatal per-send / per-row failures, for the JSON response + logs. */
  errors: string[];
}

// ---- Minimal DB row shapes (the repo has no generated Supabase types) ----

interface RecipientRow {
  email: string;
  name: string | null;
}

interface BriefingRow {
  id: string;
  campaign_id: string;
  briefing_date: string;
  kind: string;
  content_md: string;
  stats: Record<string, unknown> | null;
}

interface AlertRow {
  id: string;
  campaign_id: string;
  headline: string | null;
  situation_read: string | null;
  stats_line: string | null;
}

interface CampaignRow {
  id: string;
  name: string;
}

/**
 * Run one delivery pass. Returns a summary; never throws for per-send failures
 * (those are recorded in `errors`), only for a missing service-role client.
 */
export async function runDelivery(): Promise<DeliverySummary> {
  const summary: DeliverySummary = {
    briefingsSent: 0,
    alertsSent: 0,
    errors: [],
  };

  if (!deliveryConfigured()) {
    summary.skipped = "RESEND_API_KEY not set";
    return summary;
  }

  const admin = supabaseAdmin();
  if (!admin) {
    throw new Error("Supabase service-role client is not configured.");
  }

  // Campaign name cache — used in subjects, loaded once per campaign per run.
  const campaignNames = new Map<string, string>();
  const campaignName = async (campaignId: string): Promise<string> => {
    const cached = campaignNames.get(campaignId);
    if (cached !== undefined) return cached;
    const { data } = await admin
      .from("campaigns")
      .select("id, name")
      .eq("id", campaignId)
      .maybeSingle<CampaignRow>();
    const name = data?.name ?? "SignalRoom";
    campaignNames.set(campaignId, name);
    return name;
  };

  // Recipient cache, split by stream — loaded once per campaign per run.
  const briefingRecipients = new Map<string, RecipientRow[]>();
  const urgentRecipients = new Map<string, RecipientRow[]>();
  const loadRecipients = async (
    campaignId: string,
    field: "gets_briefing" | "gets_urgent"
  ): Promise<RecipientRow[]> => {
    const cache = field === "gets_briefing" ? briefingRecipients : urgentRecipients;
    const cached = cache.get(campaignId);
    if (cached) return cached;
    const { data, error } = await admin
      .from("campaign_recipients")
      .select("email, name")
      .eq("campaign_id", campaignId)
      .eq(field, true);
    if (error) {
      summary.errors.push(
        `Failed to load recipients for campaign ${campaignId}: ${error.message}`
      );
      cache.set(campaignId, []);
      return [];
    }
    const rows = (data ?? []) as RecipientRow[];
    cache.set(campaignId, rows);
    return rows;
  };

  await deliverBriefings(admin, summary, campaignName, loadRecipients);
  await deliverAlerts(admin, summary, campaignName, loadRecipients);

  return summary;
}

/** Email every recent unsent briefing, then stamp sent_at on success. */
async function deliverBriefings(
  admin: SupabaseClient,
  summary: DeliverySummary,
  campaignName: (id: string) => Promise<string>,
  loadRecipients: (
    id: string,
    field: "gets_briefing" | "gets_urgent"
  ) => Promise<RecipientRow[]>
): Promise<void> {
  const since = new Date(Date.now() - BRIEFING_LOOKBACK_MS).toISOString();
  const { data, error } = await admin
    .from("briefings")
    .select("id, campaign_id, briefing_date, kind, content_md, stats")
    .is("sent_at", null)
    .gte("briefing_date", since.slice(0, 10))
    .order("briefing_date", { ascending: true });

  if (error) {
    summary.errors.push(`Failed to fetch briefings: ${error.message}`);
    return;
  }

  for (const briefing of (data ?? []) as BriefingRow[]) {
    const recipients = await loadRecipients(briefing.campaign_id, "gets_briefing");
    if (recipients.length === 0) {
      // No one opted in — stamp so we don't rescan it every sweep for nothing.
      await stampBriefingSent(admin, briefing.id, summary);
      continue;
    }

    const name = await campaignName(briefing.campaign_id);
    const subject = `${name} — ${briefing.kind === "mini" ? "mini digest" : "morning briefing"} · ${briefing.briefing_date}`;
    const html = briefingHtml(name, briefing);

    // One email addressed to all opted-in recipients.
    const result = await sendEmail({
      to: recipients.map((r) => r.email),
      subject,
      html,
    });
    if (!result.ok) {
      // Leave sent_at null so the next run retries.
      summary.errors.push(`Briefing ${briefing.id} send failed: ${result.error}`);
      continue;
    }

    const stamped = await stampBriefingSent(admin, briefing.id, summary);
    if (stamped) summary.briefingsSent += 1;
  }
}

/** Email every recent undelivered urgent alert, then stamp delivered on success. */
async function deliverAlerts(
  admin: SupabaseClient,
  summary: DeliverySummary,
  campaignName: (id: string) => Promise<string>,
  loadRecipients: (
    id: string,
    field: "gets_briefing" | "gets_urgent"
  ) => Promise<RecipientRow[]>
): Promise<void> {
  const since = new Date(Date.now() - ALERT_LOOKBACK_MS).toISOString();
  // "undelivered" = delivered is null OR the empty object. Postgrest can't OR a
  // null-check against a jsonb-eq cleanly, so pull recent urgent alerts and
  // filter in memory (the 24h urgent window is small).
  const { data, error } = await admin
    .from("alerts")
    .select("id, campaign_id, headline, situation_read, stats_line, delivered")
    .eq("severity", "urgent")
    .gte("fired_at", since)
    .order("fired_at", { ascending: true });

  if (error) {
    summary.errors.push(`Failed to fetch alerts: ${error.message}`);
    return;
  }

  for (const row of (data ?? []) as (AlertRow & {
    delivered: Record<string, unknown> | null;
  })[]) {
    if (!isUndelivered(row.delivered)) continue;

    const recipients = await loadRecipients(row.campaign_id, "gets_urgent");
    if (recipients.length === 0) {
      await stampAlertDelivered(admin, row.id, 0, summary);
      continue;
    }

    const name = await campaignName(row.campaign_id);
    const subject = `Urgent · ${name} — ${row.headline ?? "signal alert"}`;
    const html = alertHtml(name, row);

    const result = await sendEmail({
      to: recipients.map((r) => r.email),
      subject,
      html,
    });
    if (!result.ok) {
      summary.errors.push(`Alert ${row.id} send failed: ${result.error}`);
      continue;
    }

    const stamped = await stampAlertDelivered(
      admin,
      row.id,
      recipients.length,
      summary
    );
    if (stamped) summary.alertsSent += 1;
  }
}

/** delivered is "undelivered" when null or an empty object. */
function isUndelivered(delivered: Record<string, unknown> | null): boolean {
  if (delivered == null) return true;
  return Object.keys(delivered).length === 0;
}

/** Stamp briefings.sent_at = now(). Returns true when the write succeeded. */
async function stampBriefingSent(
  admin: SupabaseClient,
  id: string,
  summary: DeliverySummary
): Promise<boolean> {
  const { error } = await admin
    .from("briefings")
    .update({ sent_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    summary.errors.push(`Briefing ${id} sent_at stamp failed: ${error.message}`);
    return false;
  }
  return true;
}

/** Stamp alerts.delivered = { email: { at, count } }. Returns true on success. */
async function stampAlertDelivered(
  admin: SupabaseClient,
  id: string,
  count: number,
  summary: DeliverySummary
): Promise<boolean> {
  const { error } = await admin
    .from("alerts")
    .update({
      delivered: { email: { at: new Date().toISOString(), count } },
    })
    .eq("id", id);
  if (error) {
    summary.errors.push(`Alert ${id} delivered stamp failed: ${error.message}`);
    return false;
  }
  return true;
}

// ---- HTML rendering ----

const HTML_WRAP_OPEN =
  '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:640px;margin:0 auto;color:#1a1a1a;line-height:1.55;">';
const HTML_WRAP_CLOSE = "</div>";

/** Full briefing email: campaign header, the rendered markdown body, a footer. */
function briefingHtml(campaign: string, briefing: BriefingRow): string {
  const momentum =
    briefing.stats && typeof briefing.stats === "object"
      ? statsLine(briefing.stats)
      : "";
  return (
    HTML_WRAP_OPEN +
    `<p style="font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:#888;margin:0 0 4px;">${escapeHtml(campaign)}</p>` +
    `<h1 style="font-size:20px;margin:0 0 12px;">${briefing.kind === "mini" ? "Mini digest" : "Morning briefing"} · ${escapeHtml(briefing.briefing_date)}</h1>` +
    (momentum
      ? `<p style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;color:#555;margin:0 0 16px;">${escapeHtml(momentum)}</p>`
      : "") +
    mdToHtml(briefing.content_md) +
    briefingFooter() +
    HTML_WRAP_CLOSE
  );
}

/** Urgent alert email: severity label, headline, situation read, stats line. */
function alertHtml(
  campaign: string,
  alert: AlertRow
): string {
  return (
    HTML_WRAP_OPEN +
    `<p style="font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:#c0392b;font-weight:600;margin:0 0 4px;">Urgent · ${escapeHtml(campaign)}</p>` +
    `<h1 style="font-size:20px;margin:0 0 12px;">${escapeHtml(alert.headline ?? "Signal alert")}</h1>` +
    (alert.situation_read
      ? `<p style="font-size:15px;margin:0 0 16px;">${escapeHtml(alert.situation_read)}</p>`
      : "") +
    (alert.stats_line
      ? `<p style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:14px;color:#333;margin:0 0 16px;">${escapeHtml(alert.stats_line)}</p>`
      : "") +
    briefingFooter() +
    HTML_WRAP_CLOSE
  );
}

function briefingFooter(): string {
  return '<hr style="border:none;border-top:1px solid #eee;margin:24px 0 12px;"><p style="font-size:11px;color:#aaa;margin:0;">Sent by SignalRoom. You are on this campaign\'s recipient list.</p>';
}

/** Pull a short momentum/summary line out of the briefing stats jsonb, if any. */
function statsLine(stats: Record<string, unknown>): string {
  const line = stats.momentum ?? stats.line ?? stats.summary;
  return typeof line === "string" ? line : "";
}

/**
 * Minimal markdown → HTML. Handles `#`/`##`/`###` headings, `-`/`*` bullet
 * lists, and paragraphs, with inline `**bold**` and `*italic*`. Deliberately
 * small — briefing bodies are model-generated with a known shape, and email
 * clients want simple, inline-safe HTML.
 */
export function mdToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];

  const flushParagraph = (): void => {
    if (paragraph.length === 0) return;
    out.push(
      `<p style="margin:0 0 12px;">${inline(paragraph.join(" "))}</p>`
    );
    paragraph = [];
  };
  const flushList = (): void => {
    if (listItems.length === 0) return;
    out.push(
      `<ul style="margin:0 0 12px;padding-left:20px;">${listItems
        .map((li) => `<li style="margin:0 0 4px;">${inline(li)}</li>`)
        .join("")}</ul>`
    );
    listItems = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      const size = level === 1 ? 18 : level === 2 ? 16 : 14;
      out.push(
        `<h${level} style="font-size:${size}px;margin:16px 0 8px;">${inline(heading[2])}</h${level}>`
      );
    } else if (bullet) {
      flushParagraph();
      listItems.push(bullet[1]);
    } else if (line.trim() === "") {
      flushParagraph();
      flushList();
    } else {
      flushList();
      paragraph.push(line.trim());
    }
  }
  flushParagraph();
  flushList();
  return out.join("");
}

/** Inline formatting: escape first, then apply bold/italic on the safe text. */
function inline(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

/** HTML-escape a plain string for safe interpolation into email markup. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
