"use client";

/**
 * S6 Settings — /[campaign]/settings (operator+)
 * Keywords CRUD + "Push to sources" (KWatch/Apify config push, §4) · podcast
 * shows (F4) · source health grid · delivery (M3/M4) · honest limits (§15.5).
 */

import React from "react";
import { useParams } from "next/navigation";
import { useApp, type CampaignId } from "@/lib/state";
import { dataFor, sourceHealth } from "@/lib/data";
import { Switch } from "@/components/ds";
import { cardSurface, displayType, kindTone, monoMeta, overline } from "@/lib/ui";

export default function SettingsPage() {
  const { campaign } = useParams<{ campaign: CampaignId }>();
  const { state, set, notify } = useApp();
  const D = dataFor(campaign);

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
              <span style={monoMeta}>12 active · incl. Español group</span>
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
                  if (e.key === "Enter") addKw();
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
              <button
                onClick={addKw}
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
            {keywords.map((k) => {
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
