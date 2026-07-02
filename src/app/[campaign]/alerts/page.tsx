"use client";

/**
 * S5 Alerts — /[campaign]/alerts (operator+)
 * History tab (severity pill, situation read, delivery receipts) ·
 * Rules tab (M3 note, + Add rule, default rule set §7, cooldown/channels/active).
 */

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { useApp, type CampaignId } from "@/lib/state";
import { alertRows, defaultRules } from "@/lib/data";
import { Switch } from "@/components/ds";
import { cardSurface, displayType, monoMeta, overline, sevTone } from "@/lib/ui";

export default function AlertsPage() {
  const { campaign } = useParams<{ campaign: CampaignId }>();
  const router = useRouter();
  const { state, set, notify } = useApp();
  const { alertTab, rulesOff } = state;
  const goRespond = () => router.push(`/${campaign}/respond`);

  const rules = [...defaultRules, ...state.customRules];

  return (
    <div data-screen-label="S5 Alerts" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ ...displayType, fontSize: 20, fontWeight: 600 }}>Alerts</span>
        <span style={monoMeta}>detector runs every 5 min · webhook → delivery ≤ 5 min</span>
      </div>

      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border-subtle)" }}>
        {[
          { id: "history", label: "History" },
          { id: "rules", label: "Rules" },
        ].map((t) => {
          const on = alertTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => set({ alertTab: t.id })}
              style={{
                padding: "10px 12px",
                marginBottom: -1,
                background: "transparent",
                border: "none",
                borderBottom: `2px solid ${on ? "var(--accent)" : "transparent"}`,
                cursor: "pointer",
                fontFamily: "var(--font-ui)",
                fontSize: 13,
                fontWeight: on ? 600 : 500,
                color: on ? "var(--text-primary)" : "var(--text-tertiary)",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {alertTab === "history" && (
        <div style={{ ...cardSurface, overflow: "hidden" }}>
          {alertRows.map((a) => {
            const sv = sevTone(a.sv);
            return (
              <div
                key={a.headline}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  padding: "14px 16px",
                  borderBottom: "1px solid var(--border-subtle)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "3px 10px",
                      borderRadius: 999,
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      background: sv.sevBg,
                      color: sv.sevFg,
                      flex: "none",
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: sv.sevDot }} />
                    {a.sv}
                  </span>
                  <span style={{ fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {a.headline}
                  </span>
                  <span style={{ ...monoMeta, flex: "none", marginLeft: "auto" }}>{a.time}</span>
                </div>
                <span style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>{a.read}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {a.channels.map((ch) => (
                    <span
                      key={ch}
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        fontWeight: 500,
                        padding: "1px 6px",
                        borderRadius: 6,
                        background: "var(--surface-raised)",
                        border: "1px solid var(--border-subtle)",
                        color: "var(--text-tertiary)",
                        textTransform: "uppercase",
                      }}
                    >
                      {ch}
                    </span>
                  ))}
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-tertiary)", marginLeft: "auto" }}>
                    {a.stats}
                  </span>
                  {a.respondable && (
                    <button
                      onClick={goRespond}
                      style={{
                        height: 26,
                        padding: "0 10px",
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
                      Respond →
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {alertTab === "rules" && (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 14px",
              borderRadius: 10,
              background: "var(--surface-panel)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
              Recipients don&apos;t need accounts — alerts and digests deliver to plain email addresses.
            </span>
            <button
              onClick={() => {
                set((s) => ({
                  customRules: [
                    ...s.customRules,
                    {
                      id: "custom" + (s.customRules.length + 1),
                      name: "Custom rule " + (s.customRules.length + 1),
                      when: "cluster_velocity > 2× baseline AND media_type = any",
                      sv: "watch" as const,
                      cooldown: "60 min",
                      channels: "email",
                    },
                  ],
                }));
                notify("Rule added — edit the grammar inline, it arms on the next detector pass");
              }}
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
                flex: "none",
              }}
            >
              + Add rule
            </button>
          </div>

          <div style={{ ...cardSurface, overflow: "hidden" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.4fr 2fr 0.8fr 0.8fr 1fr 60px",
                gap: 12,
                padding: "10px 16px",
                borderBottom: "1px solid var(--border-subtle)",
                ...overline,
              }}
            >
              <span>Rule</span>
              <span>Fires when</span>
              <span>Severity</span>
              <span>Cooldown</span>
              <span>Channels</span>
              <span>Active</span>
            </div>
            {rules.map((r) => {
              const sv = sevTone(r.sv);
              const off = rulesOff.includes(r.id);
              return (
                <div
                  key={r.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1.4fr 2fr 0.8fr 0.8fr 1fr 60px",
                    gap: 12,
                    padding: "12px 16px",
                    borderBottom: "1px solid var(--border-subtle)",
                    alignItems: "center",
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{r.name}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                    {r.when}
                  </span>
                  <span>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "3px 10px",
                        borderRadius: 999,
                        fontSize: 10,
                        fontWeight: 600,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        background: sv.sevBg,
                        color: sv.sevFg,
                      }}
                    >
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: sv.sevDot }} />
                      {r.sv}
                    </span>
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--text-secondary)" }}>{r.cooldown}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-tertiary)" }}>{r.channels}</span>
                  <Switch
                    checked={!off}
                    onChange={() =>
                      set((s) => ({
                        rulesOff: off ? s.rulesOff.filter((i) => i !== r.id) : [...s.rulesOff, r.id],
                      }))
                    }
                  />
                </div>
              );
            })}
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                padding: "12px 16px",
                fontFamily: "var(--font-mono)",
                fontSize: 10.5,
                color: "var(--text-tertiary)",
              }}
            >
              urgent may reach SMS · watch digests batch at &gt;3/hr · repeat fires within cooldown update the existing alert
            </div>
          </div>
        </>
      )}
    </div>
  );
}
