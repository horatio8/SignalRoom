"use client";

/**
 * Message templates (design artifact screen) — the fixed contracts from §13.
 * In production these are Resend/email templates, not app routes; this screen
 * is the visual contract. Emoji appear ONLY in email/SMS subject contracts.
 */

import React from "react";
import { cardSurface, displayType, monoMeta } from "@/lib/ui";

export default function TemplatesPage() {
  return (
    <div data-screen-label="Message templates" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <span style={{ ...displayType, fontSize: 20, fontWeight: 600 }}>Message templates</span>
        <span style={monoMeta}>fixed contracts · same severity language everywhere</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "start" }}>
        {/* Briefing email */}
        <div style={{ ...cardSurface, overflow: "hidden" }}>
          <div
            style={{
              padding: "12px 16px",
              borderBottom: "1px solid var(--border-subtle)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 600 }}>Briefing email</span>
            <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-tertiary)" }}>
              daily · Resend
            </span>
          </div>
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <div
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                background: "var(--surface-raised)",
                fontFamily: "var(--font-mono)",
                fontSize: 11.5,
                lineHeight: 1.5,
              }}
            >
              <span style={{ color: "var(--text-tertiary)" }}>subject:</span> ☀ Voss briefing — Town hall clip
              accelerating (−12)
            </div>
            <div style={{ border: "1px solid var(--border-subtle)", borderRadius: 10, overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", background: "var(--surface-sunken)", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ ...displayType, fontWeight: 700, fontSize: 13 }}>Voss for Senate</span>
                <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-tertiary)" }}>
                  Wed 2 Jul · white-label logo slot
                </span>
              </div>
              <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={{ fontFamily: "var(--font-serif)", fontSize: 12.5, lineHeight: 1.6, color: "var(--text-secondary)" }}>
                  A quiet night with one exception: a clipped 40-second cut of the Mesa town hall…
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-tertiary)" }}>
                  §1 overnight · §2 media · §3 social · §4 divergence · §5 momentum · §6 must address (≤3) · §7 watchlist
                </span>
              </div>
              <div
                style={{
                  padding: "10px 16px",
                  borderTop: "1px solid var(--border-subtle)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 9.5,
                  color: "var(--text-tertiary)",
                }}
              >
                open dashboard · unsubscribe (clients) · plain-text alt always generated
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Urgent email/Slack */}
          <div style={{ ...cardSurface, overflow: "hidden" }}>
            <div
              style={{
                padding: "12px 16px",
                borderBottom: "1px solid var(--border-subtle)",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 600 }}>Urgent alert — email / Slack</span>
              <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-tertiary)" }}>
                ≤ 5 min from spike
              </span>
            </div>
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: "var(--surface-raised)",
                  borderLeft: "3px solid var(--sev-urgent)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 11.5,
                  lineHeight: 1.6,
                }}
              >
                🔴 URGENT — Negative spike: town hall clip accelerating
                <br />
                <span style={{ color: "var(--text-secondary)" }}>Velocity 5.4× baseline · sentiment −38 · reach 210k</span>
                <br />
                <span style={{ color: "var(--text-tertiary)" }}>situation read (1 para) · origin link · deep link to alert</span>
              </div>
            </div>
          </div>

          {/* Urgent SMS */}
          <div style={{ ...cardSurface, overflow: "hidden" }}>
            <div
              style={{
                padding: "12px 16px",
                borderBottom: "1px solid var(--border-subtle)",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 600 }}>Urgent alert — SMS</span>
              <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-tertiary)" }}>
                Cellcast · ≤ 320 chars · urgent only
              </span>
            </div>
            <div style={{ padding: 16 }}>
              <div
                style={{
                  maxWidth: 280,
                  padding: "10px 14px",
                  borderRadius: "14px 14px 14px 3px",
                  background: "var(--surface-raised)",
                  border: "1px solid var(--border-subtle)",
                  fontSize: 12.5,
                  lineHeight: 1.5,
                }}
              >
                URGENT Voss: Town hall clip accelerating. 5.4x baseline, sentiment −38. Dashboard: sgnl.rm/a4821
              </div>
            </div>
          </div>

          {/* Watch digest + weekly PDF */}
          <div style={{ ...cardSurface, overflow: "hidden" }}>
            <div
              style={{
                padding: "12px 16px",
                borderBottom: "1px solid var(--border-subtle)",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 600 }}>Watch digest &amp; weekly PDF</span>
              <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-tertiary)" }}>
                batched &gt;3/hr · white-label
              </span>
            </div>
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.55 }}>
              <span>Watch alerts batch into an hourly digest — email/Slack only, never SMS.</span>
              <span>
                Weekly PDF: volume, sentiment, share of voice, top stories, opposition ads, wins — same data as
                briefings, client-branded, downloadable from S4.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
