/** Shared visual helpers ported from the prototype's renderVals(). */

import type { CSSProperties } from "react";

/** Sentiment tone: >10 pos, <−10 neg, else warn (±10 renders amber). */
export function sentTone(v: number): { bg: string; fg: string } {
  return v > 10
    ? { bg: "var(--pos-subtle)", fg: "var(--pos-text)" }
    : v < -10
      ? { bg: "var(--neg-subtle)", fg: "var(--neg-text)" }
      : { bg: "var(--warn-subtle)", fg: "var(--warn-text)" };
}

export function signed(v: number): string {
  return v > 0 ? `+${v}` : `${v}`;
}

/** Heat ramp — intensity only. Text flips white from heat-3 up. */
export function heatTone(h: number): { bg: string; fg: string } {
  return {
    bg: `var(--heat-${h})`,
    fg: h >= 3 ? "#fff" : "var(--text-secondary)",
  };
}

/** Severity pill colors — the fixed 3-level language. */
export function sevTone(sv: "info" | "watch" | "urgent"): {
  sevBg: string;
  sevFg: string;
  sevDot: string;
} {
  return sv === "urgent"
    ? {
        sevBg: "var(--sev-urgent-subtle)",
        sevFg: "var(--neg-text)",
        sevDot: "var(--sev-urgent)",
      }
    : sv === "watch"
      ? {
          sevBg: "var(--sev-watch-subtle)",
          sevFg: "var(--warn-text)",
          sevDot: "var(--sev-watch)",
        }
      : {
          sevBg: "var(--sev-info-subtle)",
          sevFg: "var(--sev-info)",
          sevDot: "var(--sev-info)",
        };
}

/** Filter-chip on/off styling. */
export function chipTone(on: boolean): {
  bg: string;
  color: string;
  border: string;
} {
  return {
    bg: on ? "var(--accent-subtle)" : "var(--surface-panel)",
    color: on ? "var(--accent-text)" : "var(--text-secondary)",
    border: on ? "var(--accent-border)" : "var(--border-default)",
  };
}

/** Keyword kind badge colors. */
export function kindTone(kind: string): { kindBg: string; kindFg: string } {
  return (
    (
      {
        candidate: {
          kindBg: "var(--accent-subtle)",
          kindFg: "var(--accent-text)",
        },
        opponent: {
          kindBg: "var(--surface-raised)",
          kindFg: "var(--text-secondary)",
        },
        issue: { kindBg: "var(--pos-subtle)", kindFg: "var(--pos-text)" },
        misspelling: {
          kindBg: "var(--warn-subtle)",
          kindFg: "var(--warn-text)",
        },
      } as Record<string, { kindBg: string; kindFg: string }>
    )[kind] ?? {
      kindBg: "var(--surface-raised)",
      kindFg: "var(--text-secondary)",
    }
  );
}

/**
 * Platform icon chip resolution. Brand SVGs are bundled locally from Simple
 * Icons (CC0) per the handoff's production note; platforms without usable
 * brand art fall back to typographic monograms.
 */
const PF_ICONS: Record<string, [string, string]> = {
  RD: ["reddit", "Reddit"],
  X: ["x", "X"],
  YT: ["youtube", "YouTube"],
  TT: ["tiktok", "TikTok"],
  IG: ["instagram", "Instagram"],
  FB: ["facebook", "Facebook"],
  BS: ["bluesky", "Bluesky"],
  DIS: ["discord", "Discord"],
  META: ["meta", "Meta Ad Library"],
  GOOG: ["google", "Google Ads Transparency"],
};

export function pfIcon(pf: string): {
  iconUrl: string;
  noIcon: boolean;
  pfName: string;
} {
  const s = PF_ICONS[pf];
  return s
    ? { iconUrl: `/icons/${s[0]}.svg`, noIcon: false, pfName: s[1] }
    : { iconUrl: "", noIcon: true, pfName: pf };
}

/** Relevance as five mono dots (runbook 1–5 score). */
export function relDots(r: number): string {
  return "●●●●●".slice(0, r) + "○○○○○".slice(0, 5 - r);
}

/** Overline micro-label style (10.5px uppercase, tracking 0.08em). */
export const overline: CSSProperties = {
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--text-tertiary)",
};

/** Card surface style (white panel + hairline + soft shadow). */
export const cardSurface: CSSProperties = {
  borderRadius: 14,
  background: "var(--surface-panel)",
  border: "1px solid var(--border-subtle)",
  boxShadow: "var(--shadow-card-light)",
};

/** Page title (Archivo display: stretch 112%, tracking −0.02em). */
export const displayType: CSSProperties = {
  fontFamily: "var(--font-display)",
  fontStretch: "112%",
  letterSpacing: "-0.02em",
};

export const monoMeta: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  color: "var(--text-tertiary)",
};
