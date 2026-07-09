"use client";

/**
 * S5 Alerts — /[campaign]/alerts (operator+)
 * Live alert history + the active detector rule set. Reads real rows written by
 * the alert engine (src/lib/alerts) via useLiveAlerts (RLS-scoped). With no
 * alerts yet, an honest empty state; the rules section always lists the
 * detectors that will fire.
 *
 * Severity is the fixed 3-level language: urgent (--neg), watch (--warn),
 * info (--text-secondary). Red is reserved for the urgent (negative) severity.
 * Data values render in mono.
 */

import React from "react";
import { useParams } from "next/navigation";
import { useLiveAlerts, type Severity } from "@/lib/data/liveAlerts";
import { EmptyState } from "@/components/app/EmptyState";
import { cardSurface, displayType, monoMeta, overline } from "@/lib/ui";

/** Severity chip tone — urgent=neg, watch=warn, info=secondary. Never red for non-urgent. */
function sevChip(sv: Severity): { bg: string; fg: string; border: string } {
  if (sv === "urgent") {
    return {
      bg: "var(--sev-urgent-subtle)",
      fg: "var(--neg-text)",
      border: "var(--sev-urgent-subtle)",
    };
  }
  if (sv === "watch") {
    return {
      bg: "var(--sev-watch-subtle)",
      fg: "var(--warn-text)",
      border: "var(--sev-watch-subtle)",
    };
  }
  return {
    bg: "var(--sev-info-subtle)",
    fg: "var(--text-secondary)",
    border: "var(--sev-info-subtle)",
  };
}

/** fired_at → compact relative time ("just now", "4m", "2h", "Mon 14:02"). */
function relTime(iso: string | null): string {
  if (!iso) return "pending";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "pending";
  const mins = Math.floor((Date.now() - then) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const d = new Date(then);
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${day} ${hh}:${mm}`;
}

function SeverityChip({ sv }: { sv: Severity }) {
  const t = sevChip(sv);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 20,
        padding: "0 8px",
        borderRadius: 6,
        background: t.bg,
        border: `1px solid ${t.border}`,
        color: t.fg,
        fontFamily: "var(--font-ui)",
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
      }}
    >
      {sv}
    </span>
  );
}

export default function AlertsPage() {
  const { campaign } = useParams<{ campaign: string }>();
  const { live, alerts, rules } = useLiveAlerts(campaign);

  return (
    <div data-screen-label="S5 Alerts" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ ...displayType, fontSize: 20, fontWeight: 600 }}>Alerts</span>
        {live && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={overline}>live</span>
            <span style={monoMeta}>
              {alerts.length} {alerts.length === 1 ? "alert" : "alerts"}
            </span>
          </span>
        )}
      </div>

      {/* ---- Fired alerts ---- */}
      {live ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {alerts.map((a) => (
            <div
              key={a.id}
              style={{ ...cardSurface, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8 }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <SeverityChip sv={a.severity} />
                <span
                  style={{
                    fontFamily: "var(--font-ui)",
                    fontSize: 14,
                    fontWeight: 600,
                    color: "var(--text-primary)",
                  }}
                >
                  {a.headline}
                </span>
                <span style={{ ...monoMeta, marginLeft: "auto", whiteSpace: "nowrap" }}>
                  {relTime(a.firedAt)}
                </span>
              </div>

              {a.statsLine && (
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    color: "var(--text-secondary)",
                  }}
                >
                  {a.statsLine}
                </span>
              )}

              {a.situationRead && (
                <p
                  style={{
                    margin: 0,
                    fontFamily: "var(--font-ui)",
                    fontSize: 12.5,
                    lineHeight: 1.55,
                    color: "var(--text-secondary)",
                  }}
                >
                  {a.situationRead}
                </p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ ...cardSurface }}>
          <EmptyState
            title="No alerts yet"
            note="Alerts fire when a rule's condition is met — a spike, a big-reach hit, or a sentiment slide."
          />
        </div>
      )}

      {/* ---- Active rules ---- */}
      {rules.length > 0 && (
        <div style={{ ...cardSurface, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
          <span style={overline}>Active rules</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {rules.map((r) => (
              <div
                key={r.id}
                style={{ display: "flex", alignItems: "center", gap: 10 }}
              >
                <SeverityChip sv={r.severity} />
                <span
                  style={{
                    fontFamily: "var(--font-ui)",
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--text-primary)",
                  }}
                >
                  {r.name}
                </span>
                <span style={{ ...monoMeta, marginLeft: "auto", whiteSpace: "nowrap" }}>
                  cooldown {r.cooldownMinutes}m
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
