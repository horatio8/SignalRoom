"use client";

/**
 * S8 Onboarding — /onboarding (owner/operator)
 * 5-step wizard: Basics → Keywords → Sources → Delivery → Backfill (F5).
 * Target: campaign live in < 1 hour (Flow A). Boolean preview shows exactly
 * what KWatch will receive; configs push automatically on the Sources step.
 */

import React from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import { useApp } from "@/lib/state";
import { onboardingPlans, onboardingSources, onboardingSteps } from "@/lib/data";
import { Switch } from "@/components/ds";
import { cardSurface, displayType, overline } from "@/lib/ui";

export default function OnboardingPage() {
  const { state } = useApp();
  return (
    <AppShell screen="onboarding" campaign={state.campaign}>
      <OnboardingScreen />
    </AppShell>
  );
}

const inputStyle: React.CSSProperties = {
  height: 36,
  padding: "0 12px",
  borderRadius: 10,
  background: "var(--surface-raised)",
  border: "1px solid var(--border-default)",
  fontFamily: "var(--font-ui)",
  fontSize: 13,
  color: "var(--text-primary)",
  outline: "none",
};

const selectStyle: React.CSSProperties = {
  height: 36,
  padding: "0 10px",
  borderRadius: 10,
  background: "var(--surface-raised)",
  border: "1px solid var(--border-default)",
  fontFamily: "var(--font-ui)",
  fontSize: 13,
  color: "var(--text-primary)",
  outline: "none",
};

function OnboardingScreen() {
  const router = useRouter();
  const { state, set } = useApp();
  const { obStep, obPlan, obSrcOff } = state;

  const next = () => {
    if (obStep === 4) {
      set({ obStep: 0 });
      router.push(`/${state.campaign}/overview`);
    } else {
      set({ obStep: obStep + 1 });
    }
  };
  const back = () => {
    if (obStep === 0) router.push(`/${state.campaign}/overview`);
    else set({ obStep: obStep - 1 });
  };

  return (
    <div
      data-screen-label="S8 Onboarding"
      style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 760, margin: "0 auto", width: "100%" }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ ...displayType, fontSize: 20, fontWeight: 600 }}>New campaign</span>
        <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
          Live in under an hour. Ingest starts the moment sources are pushed; first briefing lands tomorrow morning.
        </span>
      </div>

      {/* Step indicator (check-completed dots + accent connector lines) */}
      <div style={{ display: "flex", alignItems: "center" }}>
        {onboardingSteps.map((label, i) => {
          const done = i < obStep;
          const active = i === obStep;
          return (
            <span key={label} style={{ display: "inline-flex", alignItems: "center", flex: i === 0 ? "0 0 auto" : "1 1 0" }}>
              <span
                style={{
                  flex: 1,
                  height: 1,
                  minWidth: 0,
                  background: done || active ? "var(--accent)" : "var(--border-default)",
                  marginRight: 8,
                  display: i === 0 ? "none" : "block",
                }}
              />
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flex: "none" }}>
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: done ? "var(--accent)" : active ? "var(--accent-subtle)" : "var(--surface-raised)",
                    border: `1px solid ${done || active ? "var(--accent)" : "var(--border-default)"}`,
                    color: done ? "#fff" : active ? "var(--accent-text)" : "var(--text-tertiary)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 10.5,
                    fontWeight: 600,
                  }}
                >
                  {done ? "✓" : i + 1}
                </span>
                <span
                  style={{
                    fontSize: 12.5,
                    fontWeight: active ? 600 : 500,
                    color: active ? "var(--text-primary)" : done ? "var(--text-secondary)" : "var(--text-tertiary)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {label}
                </span>
              </span>
            </span>
          );
        })}
      </div>

      <div style={{ ...cardSurface, padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
        {obStep === 0 && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 6, gridColumn: "1 / -1" }}>
                <span style={overline}>Campaign name</span>
                <input placeholder="Ríos for Congress" style={inputStyle} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={overline}>Country</span>
                <select style={selectStyle}>
                  <option>United States</option>
                  <option>Australia</option>
                </select>
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={overline}>Timezone</span>
                <select style={selectStyle}>
                  <option>America/Phoenix</option>
                  <option>Australia/Sydney</option>
                </select>
              </label>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={overline}>Plan</span>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                {onboardingPlans.map((pl) => {
                  const on = obPlan === pl.id;
                  return (
                    <button
                      key={pl.id}
                      onClick={() => set({ obPlan: pl.id })}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                        padding: "12px 14px",
                        borderRadius: 10,
                        border: `1px solid ${on ? "var(--accent-border)" : "var(--border-subtle)"}`,
                        background: on ? "var(--accent-subtle)" : "var(--surface-raised)",
                        cursor: "pointer",
                        textAlign: "left",
                        fontFamily: "var(--font-ui)",
                      }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{pl.name}</span>
                      <span style={{ fontSize: 11.5, color: "var(--text-secondary)", lineHeight: 1.4 }}>{pl.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {obStep === 1 && (
          <>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={overline}>Candidate</span>
              <input defaultValue="Elena Ríos" style={inputStyle} />
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={overline}>Misspellings · auto-suggested</span>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span
                  style={{
                    height: 26,
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "0 10px",
                    borderRadius: 999,
                    background: "var(--accent-subtle)",
                    border: "1px solid var(--accent-border)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 11.5,
                    color: "var(--accent-text)",
                  }}
                >
                  elena rios ✓
                </span>
                <span
                  style={{
                    height: 26,
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "0 10px",
                    borderRadius: 999,
                    background: "var(--accent-subtle)",
                    border: "1px solid var(--accent-border)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 11.5,
                    color: "var(--accent-text)",
                  }}
                >
                  elena ríos ✓
                </span>
                <span
                  style={{
                    height: 26,
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "0 10px",
                    borderRadius: 999,
                    background: "var(--surface-raised)",
                    border: "1px solid var(--border-default)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 11.5,
                    color: "var(--text-secondary)",
                  }}
                >
                  alena rios
                </span>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={overline}>Opponents</span>
                <input defaultValue="Dan Whitfield" style={inputStyle} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={overline}>Issues</span>
                <input defaultValue="housing, transit, cost of living" style={inputStyle} />
              </label>
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                padding: "12px 14px",
                borderRadius: 10,
                background: "var(--surface-sunken)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <span style={overline}>Boolean preview · what KWatch will receive</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1.7, color: "var(--text-secondary)" }}>
                (&quot;elena ríos&quot; OR &quot;elena rios&quot; OR &quot;alena rios&quot;) OR (&quot;whitfield&quot; AND
                (congress OR district)) OR (housing AND ríos)
              </span>
            </div>
          </>
        )}

        {obStep === 2 && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {onboardingSources.map((sr) => {
                const off = obSrcOff.includes(sr.id);
                return (
                  <div
                    key={sr.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "12px 14px",
                      borderRadius: 10,
                      border: "1px solid var(--border-subtle)",
                      background: "var(--surface-raised)",
                    }}
                  >
                    <span style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, fontWeight: 600 }}>{sr.name}</span>
                      <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{sr.desc}</span>
                    </span>
                    <Switch
                      checked={!off}
                      onChange={() =>
                        set((s) => ({
                          obSrcOff: off ? s.obSrcOff.filter((i) => i !== sr.id) : [...s.obSrcOff, sr.id],
                        }))
                      }
                    />
                  </div>
                );
              })}
            </div>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              API configurations are pushed automatically — one KWatch alert per keyword group, Apify actors scheduled,
              Bluesky filter registered.
            </span>
          </>
        )}

        {obStep === 3 && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={overline}>Briefing hour</span>
                <select style={selectStyle}>
                  <option>06:00</option>
                </select>
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={overline}>Recipients</span>
                <input defaultValue="elena@riosforcongress.com, cm@riosforcongress.com" style={{ ...inputStyle, fontSize: 12.5 }} />
              </label>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "12px 14px",
                borderRadius: 10,
                background: "var(--pos-subtle)",
                border: "1px solid var(--pos)",
              }}
            >
              <span style={{ fontSize: 12.5, color: "var(--text-primary)" }}>
                The default rule set installs automatically — negative spike, big-reach hit, opponent surge, new
                narrative, sentiment slide.
              </span>
            </div>
          </>
        )}

        {obStep === 4 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "center", padding: "24px 0" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 34, fontWeight: 500 }}>64%</span>
            <span style={{ position: "relative", width: "70%", height: 8, borderRadius: 999, background: "var(--surface-sunken)", overflow: "hidden" }}>
              <span style={{ position: "absolute", inset: "0 auto 0 0", width: "64%", borderRadius: 999, background: "var(--accent)" }} />
            </span>
            <span style={{ fontSize: 13, color: "var(--text-secondary)", textAlign: "center", maxWidth: 420, lineHeight: 1.55 }}>
              Backfilling 12 months of news context — share-of-voice baselines and issue history exist on day one.
              Ingest is already live; first briefing lands tomorrow 06:00.
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-tertiary)" }}>
              4,812 / 7,500 archived articles · est. 22 min remaining
            </span>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, borderTop: "1px solid var(--border-subtle)", paddingTop: 16 }}>
          <button
            onClick={back}
            style={{
              height: 34,
              padding: "0 16px",
              borderRadius: 10,
              border: "1px solid var(--border-default)",
              background: "var(--surface-raised)",
              fontFamily: "var(--font-ui)",
              fontSize: 13,
              fontWeight: 500,
              color: "var(--text-primary)",
              cursor: "pointer",
            }}
          >
            Back
          </button>
          <button
            onClick={next}
            style={{
              marginLeft: "auto",
              height: 34,
              padding: "0 18px",
              borderRadius: 10,
              border: "none",
              background: "var(--accent)",
              color: "#fff",
              fontFamily: "var(--font-ui)",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {obStep === 3 ? "Go live →" : obStep === 4 ? "Open dashboard" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
