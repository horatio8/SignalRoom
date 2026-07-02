"use client";

import React from "react";

const SIZES = { sm: 26, md: 32, lg: 40 } as const;

export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required accessible name (also the tooltip title). */
  label: string;
  size?: "sm" | "md" | "lg";
  variant?: "ghost" | "outline";
  /** The icon node (16px, stroke 1.5, currentColor). */
  children: React.ReactNode;
}

export function IconButton({
  label,
  size = "md",
  variant = "ghost",
  disabled = false,
  children,
  style,
  ...rest
}: IconButtonProps) {
  const [hover, setHover] = React.useState(false);
  const dim = SIZES[size] || SIZES.md;
  const base: React.CSSProperties =
    variant === "outline"
      ? {
          background: "var(--surface-raised)",
          border: "1px solid var(--border-default)",
          color: "var(--text-secondary)",
        }
      : {
          background: "transparent",
          border: "1px solid transparent",
          color: "var(--text-secondary)",
        };
  const hov: React.CSSProperties =
    disabled || !hover
      ? {}
      : {
          background: "var(--surface-overlay)",
          color: "var(--text-primary)",
          border:
            variant === "outline"
              ? "1px solid var(--border-strong)"
              : "1px solid transparent",
        };
  return (
    <button
      aria-label={label}
      title={label}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: dim,
        height: dim,
        borderRadius: "var(--radius-md)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        transition:
          "background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)",
        ...base,
        ...hov,
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
