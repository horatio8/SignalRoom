"use client";

/**
 * S6 Settings — /[campaign]/settings (operator+)
 * Live Keywords CRUD (useKeywordManager) + Client integrations (BYOK) are real.
 * Podcast shows, source health, and delivery aren't wired to live data yet, so
 * they show honest placeholders. Honest limits (§15.5) stays.
 */

import React from "react";
import { useParams } from "next/navigation";
import { useApp } from "@/lib/state";
import type { KeywordKind } from "@/lib/data";
import { useKeywordManager, type LiveKeyword } from "@/lib/data/keywords";
import { useRecipients, type LiveRecipient, type RecipientField } from "@/lib/data/liveRecipients";
import { useCampaignKeys } from "@/lib/data/campaignKeys";
import { kindLabel } from "@/lib/campaignType";
import { Switch } from "@/components/ds";
import { EmptyState } from "@/components/app/EmptyState";
import { cardSurface, displayType, kindTone, monoMeta, overline } from "@/lib/ui";
import { SURVEY_TOOLS, type IntegrationService } from "@/lib/integrations";
import { useServiceUsage, WIRED_SOURCES, formatCompact, relTimeAgo } from "@/lib/data/serviceUsage";

export default function SettingsPage() {
  const { campaign } = useParams<{ campaign: string }>();
  const { state, set, notify } = useApp();

  // Live surface: the keywords card manages real `keywords` rows through the
  // manager (RLS-scoped read + owner/operator writes).
  const km = useKeywordManager(campaign);
  const [kwKind, setKwKind] = React.useState<KeywordKind>("issue");

  // Live source health for the right-column card (wired ingest sources only).
  const usage = useServiceUsage();

  // Live delivery recipients: the Delivery card manages real
  // `campaign_recipients` rows through this hook (RLS owner/operator writes).
  const rec = useRecipients(campaign);
  const [recEmail, setRecEmail] = React.useState("");
  const [recName, setRecName] = React.useState("");
  const [recBriefing, setRecBriefing] = React.useState(true);
  const [recUrgent, setRecUrgent] = React.useState(true);

  const addRecipient = async () => {
    const email = recEmail.trim();
    if (!email) return;
    // RLS denial (client_viewer) or a unique/constraint rejection surfaces here.
    const err = await rec.add(email, recName, {
      briefing: recBriefing,
      urgent: recUrgent,
    });
    if (err) return notify(err);
    notify("Recipient added — emails send once RESEND_API_KEY is configured");
    setRecEmail("");
    setRecName("");
    setRecBriefing(true);
    setRecUrgent(true);
  };

  const toggleRecipient = async (row: LiveRecipient, field: RecipientField) => {
    const next = !row[field];
    const err = await rec.toggle(row.id, field, next);
    if (err) return notify(err);
    const label = field === "gets_briefing" ? "briefing" : "urgent";
    notify(next ? `Recipient opted in to ${label}` : `Recipient opted out of ${label}`);
  };

  const removeRecipient = async (id: string) => {
    const err = await rec.remove(id);
    if (err) return notify(err);
    notify("Recipient removed");
  };

  // Live BYOK: the Client-integrations card reads + writes real
  // `campaign_integrations` rows through this hook (RLS owner/operator only).
  const ck = useCampaignKeys(campaign);

  // Which integration's inline key input is open (only one at a time) + its
  // draft text. Purely the transient editing surface; the saved keys live in the
  // DB via useCampaignKeys.
  const [keyOpen, setKeyOpen] = React.useState<string | null>(null);
  const [keyDraft, setKeyDraft] = React.useState("");

  const saveKey = async (service: IntegrationService, name: string) => {
    const val = keyDraft.trim();
    if (!val) return;
    // RLS denial (client_viewer) or a constraint rejection surfaces as err here.
    const err = await ck.save(service, val);
    if (err) return notify(err);
    setKeyOpen(null);
    setKeyDraft("");
    notify(`Client key saved for ${name} — used before the platform key on the next run`);
  };

  const removeKey = async (service: IntegrationService, name: string) => {
    const err = await ck.remove(service);
    if (err) return notify(err);
    if (keyOpen === service) {
      setKeyOpen(null);
      setKeyDraft("");
    }
    notify(`Client key removed — ${name} falls back to the platform key`);
  };

  // Live keyword mutations. Each surfaces the manager's error string via a
  // toast (RLS denials land here for client_viewers), or a short confirmation on
  // success. The list refresh is owned by the manager.
  const addKwLive = async () => {
    const term = state.kwInput.trim();
    if (!term) return;
    const err = await km.add(term, kwKind);
    if (err) return notify(err);
    notify("Keyword added — applies at the next ingest sweep");
    set({ kwInput: "" });
  };

  const toggleKwLive = async (row: LiveKeyword) => {
    const err = await km.toggle(row.id, !row.is_active);
    if (err) return notify(err);
    notify(row.is_active ? "Keyword paused" : "Keyword resumed");
  };

  const removeKwLive = async (id: string) => {
    const err = await km.remove(id);
    if (err) return notify(err);
    notify("Keyword removed");
  };

  const selectStyle: React.CSSProperties = {
    height: 32,
    padding: "0 10px",
    borderRadius: 10,
    background: "var(--surface-raised)",
    border: "1px solid var(--border-default)",
    fontFamily: "var(--font-ui)",
    fontSize: 12.5,
    color: "var(--text-primary)",
    outline: "none",
  };

  // Small on/off pill for a recipient's per-stream opt-in (briefing / urgent).
  const streamChipStyle = (on: boolean): React.CSSProperties => ({
    flex: "none",
    height: 26,
    padding: "0 10px",
    borderRadius: 8,
    border: `1px solid ${on ? "var(--accent-border)" : "var(--border-default)"}`,
    background: on ? "var(--accent-subtle)" : "var(--surface-panel)",
    color: on ? "var(--accent-text)" : "var(--text-tertiary)",
    fontFamily: "var(--font-ui)",
    fontSize: 11,
    fontWeight: 500,
    cursor: "pointer",
  });

  return (
    <div data-screen-label="S6 Settings" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ ...displayType, fontSize: 20, fontWeight: 600 }}>Settings</span>
        <span style={monoMeta}>{campaign}</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 12, alignItems: "start" }}>
        {/* Left column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Keywords */}
          <div style={{ ...cardSurface, overflow: "hidden" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "14px 16px",
                borderBottom: "1px solid var(--border-subtle)",
              }}
            >
              <span style={{ fontSize: 16, fontWeight: 600 }}>Keywords</span>
              <span style={monoMeta}>{km.rows.filter((r) => r.is_active).length} active</span>
              {/* Sources read active keywords every sweep, so there's nothing to push. */}
              <span style={{ ...monoMeta, marginLeft: "auto" }}>
                sources poll active keywords · changes apply at the next hourly sweep
              </span>
            </div>
            <div
              style={{
                display: "flex",
                gap: 8,
                padding: "12px 16px",
                borderBottom: "1px solid var(--border-subtle)",
                background: "var(--surface-raised)",
              }}
            >
              <input
                value={state.kwInput}
                onChange={(e) => set({ kwInput: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void addKwLive();
                }}
                placeholder='new term — boolean ok: "candidate" AND (water OR CAP)'
                style={{
                  flex: 1,
                  minWidth: 0,
                  height: 30,
                  padding: "0 12px",
                  borderRadius: 8,
                  background: "var(--surface-panel)",
                  border: "1px solid var(--border-default)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  color: "var(--text-primary)",
                  outline: "none",
                }}
              />
              <select
                value={kwKind}
                onChange={(e) => setKwKind(e.target.value as KeywordKind)}
                style={{ ...selectStyle, height: 30, flex: "none" }}
              >
                {/* Values stay the DB enums; labels adapt to the campaign type
                    (issue campaigns relabel candidate→campaign, opponent→opposition). */}
                <option value="candidate">{kindLabel("candidate", km.campaignType)}</option>
                <option value="opponent">{kindLabel("opponent", km.campaignType)}</option>
                <option value="issue">{kindLabel("issue", km.campaignType)}</option>
                <option value="misspelling">{kindLabel("misspelling", km.campaignType)}</option>
              </select>
              <button
                onClick={() => void addKwLive()}
                style={{
                  height: 30,
                  padding: "0 12px",
                  borderRadius: 8,
                  border: "1px solid var(--border-default)",
                  background: "var(--surface-panel)",
                  fontFamily: "var(--font-ui)",
                  fontSize: 12,
                  fontWeight: 500,
                  color: "var(--text-primary)",
                  cursor: "pointer",
                }}
              >
                Add keyword
              </button>
            </div>
            {km.rows.length === 0 ? (
              <EmptyState
                title="No keywords yet"
                note="Add a term above; sources pick it up at the next hourly sweep."
              />
            ) : (
              km.rows.map((row) => {
                  const kt = kindTone(row.kind);
                  return (
                    <div
                      key={row.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "10px 16px",
                        borderBottom: "1px solid var(--border-subtle)",
                        // Paused keywords dim like other inactive rows.
                        opacity: row.is_active ? 1 : 0.45,
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 12.5,
                          flex: 1,
                          minWidth: 0,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {row.term}
                      </span>
                      <span
                        style={{
                          flex: "none",
                          fontSize: 11,
                          fontWeight: 500,
                          padding: "2px 8px",
                          borderRadius: 6,
                          background: kt.kindBg,
                          color: kt.kindFg,
                        }}
                      >
                        {kindLabel(row.kind, km.campaignType)}
                      </span>
                      {/* Match counts arrive later from mentions aggregates; "—" until then. */}
                      <span style={{ ...monoMeta, flex: "none" }}>—</span>
                      <Switch checked={row.is_active} onChange={() => void toggleKwLive(row)} />
                      <button
                        onClick={() => void removeKwLive(row.id)}
                        style={{
                          flex: "none",
                          border: "none",
                          background: "none",
                          padding: 0,
                          fontFamily: "var(--font-ui)",
                          fontSize: 11,
                          color: "var(--text-tertiary)",
                          textDecoration: "underline",
                          cursor: "pointer",
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  );
                })
            )}
            <div style={{ padding: "10px 16px", fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-tertiary)" }}>
              keyword groups are reusable segments across feed, rules, and reports
            </div>
          </div>

          {/* Podcast shows — not wired to live data yet */}
          <div style={{ ...cardSurface }}>
            <EmptyState
              title="Podcast shows"
              note="Not available yet — podcast tracking (PodcastIndex → Whisper transcripts) isn't wired to live data."
            />
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Source health — compact live view of the wired ingest sources.
              Full usage (rows, credits, spend) lives on the Admin screen. */}
          <div style={{ ...cardSurface, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 16, fontWeight: 600 }}>Source health</span>
              <span style={{ ...monoMeta, marginLeft: "auto" }}>ingest {relTimeAgo(usage.latestByKind.ingest?.created_at)}</span>
            </div>
            {/* The wired sources are static knowledge — always listed, with an
                idle dot and "—" requests until the first ingest sweep lands. */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {WIRED_SOURCES.map((id) => {
                const src = usage.perSource[id];
                const tool = SURVEY_TOOLS.find((t) => t.id === id);
                const hasIngest = !!usage.latestByKind.ingest;
                // idle = no ingest runs; degraded = a recent error; else healthy.
                const dot = !hasIngest
                  ? "var(--text-tertiary)"
                  : src.lastError
                    ? "var(--warn)"
                    : "var(--pos)";
                return (
                  <div key={id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: dot, flex: "none" }} />
                    <span style={{ fontSize: 12.5, fontWeight: 500, flex: 1, minWidth: 0 }}>
                      {tool?.name ?? id}
                    </span>
                    <span style={{ ...monoMeta }}>{relTimeAgo(usage.latestByKind.ingest?.created_at)}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--text-secondary)", width: 52, textAlign: "right" }}>
                      {hasIngest ? formatCompact(src.requestsToday) : "—"}
                    </span>
                  </div>
                );
              })}
              <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>
                requests today · full usage on the Admin screen
              </span>
            </div>
          </div>

          {/* Delivery — live recipient management (campaign_recipients). */}
          <div style={{ ...cardSurface, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 16, fontWeight: 600 }}>Delivery</span>
              <span style={monoMeta}>{rec.recipients.length} recipients</span>
              <span style={{ ...monoMeta, marginLeft: "auto" }}>briefing · urgent</span>
            </div>
            <span style={{ fontSize: 11.5, lineHeight: 1.5, color: "var(--text-secondary)" }}>
              Recipients receive the morning briefing and/or urgent alerts by email — no account needed.
              Emails send once RESEND_API_KEY is configured.
            </span>

            {/* Add row: email + optional name, with per-stream opt-ins. */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={recEmail}
                  onChange={(e) => setRecEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void addRecipient();
                  }}
                  placeholder="email@campaign.org"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    height: 30,
                    padding: "0 12px",
                    borderRadius: 8,
                    background: "var(--surface-panel)",
                    border: "1px solid var(--border-default)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    color: "var(--text-primary)",
                    outline: "none",
                  }}
                />
                <input
                  value={recName}
                  onChange={(e) => setRecName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void addRecipient();
                  }}
                  placeholder="name (optional)"
                  style={{
                    width: 120,
                    flex: "none",
                    height: 30,
                    padding: "0 12px",
                    borderRadius: 8,
                    background: "var(--surface-panel)",
                    border: "1px solid var(--border-default)",
                    fontFamily: "var(--font-ui)",
                    fontSize: 12,
                    color: "var(--text-primary)",
                    outline: "none",
                  }}
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setRecBriefing((v) => !v)}
                  style={streamChipStyle(recBriefing)}
                >
                  briefing
                </button>
                <button
                  type="button"
                  onClick={() => setRecUrgent((v) => !v)}
                  style={streamChipStyle(recUrgent)}
                >
                  urgent
                </button>
                <button
                  onClick={() => void addRecipient()}
                  style={{
                    marginLeft: "auto",
                    height: 30,
                    padding: "0 12px",
                    borderRadius: 8,
                    border: "1px solid var(--border-default)",
                    background: "var(--surface-panel)",
                    fontFamily: "var(--font-ui)",
                    fontSize: 12,
                    fontWeight: 500,
                    color: "var(--text-primary)",
                    cursor: "pointer",
                  }}
                >
                  Add recipient
                </button>
              </div>
            </div>

            {/* Recipient list. */}
            {rec.recipients.length === 0 ? (
              <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
                No recipients yet — add an address above.
              </span>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {rec.recipients.map((row) => (
                  <div
                    key={row.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 12px",
                      borderRadius: 10,
                      background: "var(--surface-raised)",
                      border: "1px solid var(--border-subtle)",
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 12,
                          color: "var(--text-primary)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {row.email}
                      </span>
                      {row.name && (
                        <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{row.name}</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => void toggleRecipient(row, "gets_briefing")}
                      style={streamChipStyle(row.gets_briefing)}
                    >
                      briefing
                    </button>
                    <button
                      type="button"
                      onClick={() => void toggleRecipient(row, "gets_urgent")}
                      style={streamChipStyle(row.gets_urgent)}
                    >
                      urgent
                    </button>
                    <button
                      onClick={() => void removeRecipient(row.id)}
                      style={{
                        flex: "none",
                        border: "none",
                        background: "none",
                        padding: 0,
                        fontFamily: "var(--font-ui)",
                        fontSize: 11,
                        color: "var(--text-tertiary)",
                        textDecoration: "underline",
                        cursor: "pointer",
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Client integrations */}
          <div style={{ ...cardSurface, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 16, fontWeight: 600 }}>Client integrations</span>
              <span style={{ ...monoMeta, marginLeft: "auto" }}>client keys override platform keys</span>
            </div>
            <span style={{ fontSize: 11.5, lineHeight: 1.5, color: "var(--text-secondary)" }}>
              Campaigns can bring their own credentials for the surveying tools. Stored per campaign, encrypted at rest —
              used before the platform key.
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {SURVEY_TOOLS.map((tool) => {
                const hint = ck.keys[tool.id];
                const stored = !!hint?.hasKey;
                const open = keyOpen === tool.id;
                return (
                  <div
                    key={tool.id}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      padding: "10px 12px",
                      borderRadius: 10,
                      background: "var(--surface-raised)",
                      border: "1px solid var(--border-subtle)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 600 }}>{tool.name}</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-tertiary)" }}>
                          {tool.desc}
                        </span>
                      </div>
                      <span
                        style={{
                          flex: "none",
                          fontSize: 10,
                          fontWeight: 500,
                          padding: "2px 8px",
                          borderRadius: 6,
                          background: stored ? "var(--pos-subtle)" : "var(--surface-raised)",
                          color: stored ? "var(--pos-text)" : "var(--text-secondary)",
                        }}
                      >
                        {stored ? "client key" : "platform key"}
                      </span>
                      {stored ? (
                        <>
                          <span
                            style={{
                              flex: "none",
                              fontFamily: "var(--font-mono)",
                              fontSize: 10.5,
                              color: "var(--text-tertiary)",
                            }}
                          >
                            {hint?.masked}
                          </span>
                          <button
                            onClick={() => void removeKey(tool.id, tool.name)}
                            style={{
                              flex: "none",
                              border: "none",
                              background: "none",
                              padding: 0,
                              fontFamily: "var(--font-ui)",
                              fontSize: 11,
                              color: "var(--text-tertiary)",
                              textDecoration: "underline",
                              cursor: "pointer",
                            }}
                          >
                            Remove
                          </button>
                        </>
                      ) : (
                        !open && (
                          <button
                            onClick={() => {
                              setKeyOpen(tool.id);
                              setKeyDraft("");
                            }}
                            style={{
                              flex: "none",
                              border: "none",
                              background: "none",
                              padding: 0,
                              fontFamily: "var(--font-ui)",
                              fontSize: 11,
                              color: "var(--accent-text)",
                              textDecoration: "underline",
                              cursor: "pointer",
                            }}
                          >
                            Add key
                          </button>
                        )
                      )}
                    </div>
                    {open && !stored && (
                      <div style={{ display: "flex", gap: 8 }}>
                        <input
                          autoFocus
                          value={keyDraft}
                          onChange={(e) => setKeyDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void saveKey(tool.id, tool.name);
                            if (e.key === "Escape") {
                              setKeyOpen(null);
                              setKeyDraft("");
                            }
                          }}
                          placeholder={tool.envFallback}
                          style={{
                            flex: 1,
                            minWidth: 0,
                            height: 28,
                            padding: "0 10px",
                            borderRadius: 8,
                            background: "var(--surface-panel)",
                            border: "1px solid var(--border-default)",
                            fontFamily: "var(--font-mono)",
                            fontSize: 12,
                            color: "var(--text-primary)",
                            outline: "none",
                          }}
                        />
                        <button
                          onClick={() => void saveKey(tool.id, tool.name)}
                          style={{
                            height: 28,
                            padding: "0 12px",
                            borderRadius: 8,
                            border: "none",
                            background: "var(--accent)",
                            color: "#fff",
                            fontFamily: "var(--font-ui)",
                            fontSize: 11.5,
                            fontWeight: 500,
                            cursor: "pointer",
                          }}
                        >
                          Save
                        </button>
                        <button
                          onClick={() => {
                            setKeyOpen(null);
                            setKeyDraft("");
                          }}
                          aria-label="Cancel"
                          style={{
                            height: 28,
                            width: 28,
                            borderRadius: 8,
                            border: "1px solid var(--border-default)",
                            background: "var(--surface-raised)",
                            fontFamily: "var(--font-ui)",
                            fontSize: 12,
                            color: "var(--text-secondary)",
                            cursor: "pointer",
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Honest limits */}
          <div
            style={{
              borderRadius: 14,
              background: "var(--surface-sunken)",
              border: "1px solid var(--border-subtle)",
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <span style={overline}>Our honest limits</span>
            <span style={{ fontSize: 12, lineHeight: 1.6, color: "var(--text-secondary)" }}>
              Hot retention 24 months, then archived. Paywalled content: headline + snippet only. Syndicated copies
              collapsed and counted, not listed. Broadcast TV/radio not monitored — never claimed.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
