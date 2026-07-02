"use client";

import React from "react";

const SIZES = {
  sm: { height: 26, padding: "0 10px", fontSize: 12, gap: 6, radius: "var(--radius-sm)" },
  md: { height: 32, padding: "0 14px", fontSize: 13, gap: 8, radius: "var(--radius-md)" },
  lg: { height: 40, padding: "0 18px", fontSize: 14, gap: 8, radius: "var(--radius-md)" },
} as const;

const VARIANTS: Record<
  string,
  { base: React.CSSProperties; hover: React.CSSProperties; active: React.CSSProperties }
> = {
  primary: {
    base: { background: "var(--accent)", color: "var(--text-on-accent)", border: "1px solid transparent" },
    hover: { background: "var(--accent-hover)" },
    active: { background: "var(--accent-active)" },
  },
  secondary: {
    base: { background: "var(--surface-raised)", color: "var(--text-primary)", border: "1px solid var(--border-default)" },
    hover: { background: "var(--surface-overlay)", border: "1px solid var(--border-strong)" },
    active: { background: "var(--surface-raised)" },
  },
  ghost: {
    base: { background: "transparent", color: "var(--text-secondary)", border: "1px solid transparent" },
    hover: { background: "var(--surface-raised)", color: "var(--text-primary)" },
    active: { background: "var(--surface-overlay)" },
  },
  danger: {
    base: { background: "var(--neg)", color: "#fff", border: "1px solid transparent" },
    hover: { filter: "brightness(1.08)" },
    active: { filter: "brightness(0.94)" },
  },
};

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "prefix"> {
  /** Visual weight. Default 'secondary'. 'primary' is reserved for the single main action. */
  variant?: "primary" | "secondary" | "ghost" | "danger";
  /** Control height: sm 26px, md 32px (default), lg 40px. */
  size?: "sm" | "md" | "lg";
  /** Optional leading icon node (16px, currentColor). */
  icon?: React.ReactNode;
}

export function Button({
  variant = "secondary",
  size = "md",
  disabled = false,
  icon,
  children,
  style,
  ...rest
}: ButtonProps) {
  const [hover, setHover] = React.useState(false);
  const [press, setPress] = React.useState(false);
  const s = SIZES[size] || SIZES.md;
  const v = VARIANTS[variant] || VARIANTS.secondary;
  const stateStyle = disabled ? {} : press ? { ...v.hover, ...v.active } : hover ? v.hover : {};
  return (
    <button
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => {
        setHover(false);
        setPress(false);
      }}
      onMouseDown={() => setPress(true)}
      onMouseUp={() => setPress(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        height: s.height,
        padding: s.padding,
        gap: s.gap,
        fontFamily: "var(--font-ui)",
        fontSize: s.fontSize,
        fontWeight: 500,
        borderRadius: s.radius,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        whiteSpace: "nowrap",
        transition:
          "background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out)",
        ...v.base,
        ...stateStyle,
        ...style,
      }}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}
