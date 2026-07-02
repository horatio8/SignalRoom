"use client";

import React from "react";

export interface TooltipProps {
  label: React.ReactNode;
  side?: "top" | "bottom";
  children: React.ReactNode;
}

/** Hover/focus label for icon buttons and truncated values. Text only. */
export function Tooltip({ label, side = "top", children }: TooltipProps) {
  const [open, setOpen] = React.useState(false);
  const pos = side === "bottom" ? { top: "calc(100% + 6px)" } : { bottom: "calc(100% + 6px)" };
  return (
    <span
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            ...pos,
            padding: "5px 9px",
            borderRadius: "var(--radius-sm)",
            whiteSpace: "nowrap",
            zIndex: 50,
            background: "var(--surface-overlay)",
            border: "1px solid var(--border-default)",
            boxShadow: "var(--shadow-popover)",
            fontFamily: "var(--font-ui)",
            fontSize: 11.5,
            color: "var(--text-primary)",
          }}
        >
          {label}
        </span>
      )}
    </span>
  );
}
