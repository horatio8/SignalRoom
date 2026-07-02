"use client";

/**
 * Platform icon chip: brand SVG (bundled locally from Simple Icons, CC0) on a
 * white 26px chip with 1px border so brand colors survive dark mode.
 * Platforms without usable brand art (NEWS, POD, RSS, WEB, LI…) fall back to
 * typographic monograms (mono 8px, bold).
 */

/* eslint-disable @next/next/no-img-element */
import React from "react";
import { pfIcon } from "@/lib/ui";

export function PlatformChip({
  pf,
  size = 26,
  style,
}: {
  pf: string;
  size?: 24 | 26;
  style?: React.CSSProperties;
}) {
  const { iconUrl, noIcon, pfName } = pfIcon(pf);
  const icon = size === 24 ? 13 : 14;
  return (
    <span
      title={pfName}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: size === 24 ? 6 : 7,
        background: "#fff",
        border: "1px solid var(--border-default)",
        flex: "none",
        ...style,
      }}
    >
      {noIcon ? (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 8,
            fontWeight: 700,
            letterSpacing: "0.02em",
            color: "#444",
          }}
        >
          {pf}
        </span>
      ) : (
        <img src={iconUrl} alt={pfName} style={{ width: icon, height: icon, display: "block" }} />
      )}
    </span>
  );
}
