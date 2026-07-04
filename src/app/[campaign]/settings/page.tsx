"use client";

/**
 * S6 Settings — /[campaign]/settings (operator+)
 * Keywords CRUD + "Push to sources" (KWatch/Apify config push, §4) · podcast
 * shows (F4) · source health grid · delivery (M3/M4) · honest limits (§15.5).
 */

import React from "react";
import { useParams } from "next/navigation";
import { useApp, type CampaignId } from "@/lib/state";
import { dataFor, sourceHealth, type KeywordKind } from "@/lib/data";
import { useKeywordManager, type LiveKeyword } from "@/lib/data/keywords";
import { kindLabel } from "@/lib/campaignType";
import { Switch } from "@/components/ds";
import { cardSurface, displayType, kindTone, monoMeta, overline } from "@/lib/ui";
import { SURVEY_TOOLS } from "@/lib/integrations";

export default function SettingsPage() {
  const { campaign } = useParams<{ campaign: CampaignId }>();
  const { state, set, notify } = useApp();
  const D = dataFor(campaign);

  // Second live surface: when Supabase is live and a session exists, the
  // keywords card manages real `keywords` rows; otherwise it stays in demo mode
  // (fixtures + customKeywords + "Push to sources"), exactly as before.
  const km = useKeywordManager(campaign);
  const [kwKind, setKwKind] = React.useState<KeywordKind>("issue");

  // Which integration's inline key input is open (only one at a time) + its
  // draft text. The saved keys live in the app context (state.byoKeys); this is
  // purely the transient editing surface.
  const [keyOpen, setKeyOpen] = React.useState<string | null>(null);
  const [keyDraft, setKeyDraft] = React.useState("");

  const campaignKeys = state.byoKeys[campaign] ?? {};

  const saveKey = (service: string, name: string) => {
    const val = keyDraft.trim();
    if (!val) return;
    set((s) => ({
      byoKeys: {
        ...s.byoKeys,
        [campaign]: { ...(s.byoKeys[campaign] ?? {}), [service]: val },
      },
    }));
    setKeyOpen(null);
    setKeyDraft("");
    notify(`Client key saved for ${name} — used instead of the platform key on the next run`);
  };

  const removeKey = (service: string, name: string) => {
    set((s) => {
      const next = { ...(s.byoKeys[campaign] ?? {}) };
      delete next[service];
      return { byoKeys: { ...s.byoKeys, [campaign]: next } };
    });
    if (keyOpen === service) {
      setKeyOpen(null);
      setKeyDraft("");
    }
    notify(`Client key removed — ${name} falls back to the platform key`);
  };

  const maskKey = (v: string) => "••••" + v.slice(-4);

  const keywords = [...D.keywords, ...state.customKeywords];
  const recipients = [...D.recipients, ...state.addedRecipients];

  const addKw = () => {
    const term = state.kwInput.trim();
    if (!term) return;
    set((s) => ({
      customKeywords: [...s.customKeywords, { id: "ck" + Date.now(), term, kind: "issue" as const, matches: "—" }],
      kwInput: "",
    }));
    notify("Keyword added — push to sources to sync KWatch + Apify");
  };

  const pushKeywords = () => {
    set({ pushed: true });
    setTimeout(() => set({ pushed: false }), 2500);
  };

  // Live-mode keyword mutations. Each surfaces the manager's error string via a
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

  const addRecipient = () => {
    const email = state.rcInput.trim();
    if (!email) return;
    set((s) => ({ addedRecipients: [...s.addedRecipients, { email, gets: "briefing" }], rcInput: "" }));
    notify("Recipient added — no account needed, delivery starts with the next briefing");
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

  return (
    <div data-screen-label="S6 Settings" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ ...displayType, fontSize: 20, fontWeight: 600 }}>Settings</span>
        <span style={monoMeta}>
          {D.name} · {D.code} · {D.tz}
        </span>
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
              <span style={monoMeta}>
                {km.live
                  ? `${km.rows.filter((r) => r.is_active).length} active`
                  : "12 active · incl. Español group"}
              </span>
              {km.live ? (
                // Polling makes the push obsolete: sources read active keywords
                // every sweep, so there is nothing to push.
                <span style={{ ...monoMeta, marginLeft: "auto" }}>
                  sources poll active keywords · changes apply at the next hourly sweep
                </span>
              ) : (
                <button
                  onClick={pushKeywords}
                  style={{
                    marginLeft: "auto",
                    height: 28,
                    padding: "0 12px",
                    borderRadius: 8,
                    border: "none",
                    background: "var(--accent)",
                    color: "#fff",
                    fontFamily: "var(--font-ui)",
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  {state.pushed ? "✓ Pushed to KWatch + Apify" : "Push to sources"}
                </button>
              )}
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
                  if (e.key === "Enter") km.live ? void addKwLive() : addKw();
                }}
                placeholder='new term — boolean ok: "voss" AND (water OR CAP)'
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
              {km.live && (
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
              )}
              <button
                onClick={() => (km.live ? void addKwLive() : addKw())}
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
            {km.live
              ? km.rows.map((row) => {
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
              : keywords.map((k) => {
              const off = state.kwOff.includes(k.id);
              const kt = kindTone(k.kind);
              return (
                <div
                  key={k.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 16px",
                    borderBottom: "1px solid var(--border-subtle)",
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
                    {k.term}
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
                    {k.kind}
                  </span>
                  <span style={{ ...monoMeta, flex: "none" }}>{k.matches} /24h</span>
                  <Switch
                    checked={!off}
                    onChange={() =>
                      set((s) => ({
                        kwOff: off ? s.kwOff.filter((i) => i !== k.id) : [...s.kwOff, k.id],
                      }))
                    }
                  />
                </div>
              );
            })}
            <div style={{ padding: "10px 16px", fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-tertiary)" }}>
              keyword groups are reusable segments across feed, rules, and reports
            </div>
          </div>

          {/* Podcast shows */}
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
              <span style={{ fontSize: 16, fontWeight: 600 }}>Podcast shows</span>
              <span style={monoMeta}>PodcastIndex → Whisper transcripts</span>
              <button
                style={{
                  marginLeft: "auto",
                  height: 28,
                  padding: "0 12px",
                  borderRadius: 8,
                  border: "1px solid var(--border-default)",
                  background: "var(--surface-raised)",
                  fontFamily: "var(--font-ui)",
                  fontSize: 12,
                  fontWeight: 500,
                  color: "var(--text-primary)",
                  cursor: "pointer",
                }}
              >
                + Add show
              </button>
            </div>
            {D.podcasts.map((p) => (
              <div
                key={p.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 16px",
                  borderBottom: "1px solid var(--border-subtle)",
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: 28,
                    height: 20,
                    borderRadius: 6,
                    background: "var(--surface-raised)",
                    border: "1px solid var(--border-default)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 9.5,
                    fontWeight: 600,
                    color: "var(--text-secondary)",
                    flex: "none",
                  }}
                >
                  POD
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{p.name}</span>
                <span style={monoMeta}>{p.meta}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Source health */}
          <div style={{ ...cardSurface, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>Source health</span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {sourceHealth.map((sh) => (
                <div
                  key={sh.name}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    padding: "10px 12px",
                    borderRadius: 10,
                    background: "var(--surface-raised)",
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: sh.dot, flex: "none" }} />
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, fontWeight: 600 }}>{sh.name}</span>
                    <span
                      style={{
                        marginLeft: "auto",
                        fontSize: 9.5,
                        fontWeight: 600,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        color: sh.fg,
                      }}
                    >
                      {sh.status}
                    </span>
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-tertiary)" }}>{sh.meta}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Delivery */}
          <div style={{ ...cardSurface, padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>Delivery</span>
            <div style={{ display: "flex", gap: 12 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
                <span style={overline}>Briefing hour</span>
                <select style={selectStyle} defaultValue="06:00">
                  <option>06:00</option>
                  <option>05:00</option>
                  <option>07:00</option>
                </select>
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
                <span style={overline}>Second digest</span>
                <select style={selectStyle} defaultValue="16:00 mini-brief">
                  <option>16:00 mini-brief</option>
                  <option>off</option>
                </select>
              </label>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={overline}>Recipients · no account needed</span>
              {recipients.map((rc) => (
                <div key={rc.email} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 12,
                      flex: 1,
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {rc.email}
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-tertiary)" }}>{rc.gets}</span>
                </div>
              ))}
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={state.rcInput}
                  onChange={(e) => set({ rcInput: e.target.value })}
                  placeholder="name@campaign.org"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    height: 28,
                    padding: "0 10px",
                    borderRadius: 8,
                    background: "var(--surface-raised)",
                    border: "1px solid var(--border-default)",
                    fontFamily: "var(--font-ui)",
                    fontSize: 12,
                    color: "var(--text-primary)",
                    outline: "none",
                  }}
                />
                <button
                  onClick={addRecipient}
                  style={{
                    height: 28,
                    padding: "0 10px",
                    borderRadius: 8,
                    border: "1px solid var(--border-default)",
                    background: "var(--surface-raised)",
                    fontFamily: "var(--font-ui)",
                    fontSize: 11.5,
                    fontWeight: 500,
                    color: "var(--text-primary)",
                    cursor: "pointer",
                  }}
                >
                  Add
                </button>
              </div>
            </div>
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
                const stored = campaignKeys[tool.id];
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
                            {maskKey(stored)}
                          </span>
                          <button
                            onClick={() => removeKey(tool.id, tool.name)}
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
                            if (e.key === "Enter") saveKey(tool.id, tool.name);
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
                          onClick={() => saveKey(tool.id, tool.name)}
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
