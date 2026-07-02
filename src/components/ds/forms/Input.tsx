"use client";

import React from "react";

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "prefix" | "size"> {
  /** Overline label (uppercase micro-label). */
  label?: string;
  hint?: string;
  /** Error message; replaces hint and turns border red. */
  error?: string;
  size?: "md" | "lg";
  /** Set true for data values: keyword terms, boolean expressions, hours, secrets. */
  mono?: boolean;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  style?: React.CSSProperties;
  inputStyle?: React.CSSProperties;
}

export function Input({
  label,
  hint,
  error,
  size = "md",
  mono = false,
  prefix,
  suffix,
  style,
  inputStyle,
  ...rest
}: InputProps) {
  const [focus, setFocus] = React.useState(false);
  const height = size === "lg" ? "var(--h-input-lg)" : "var(--h-input)";
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, fontFamily: "var(--font-ui)", ...style }}>
      {label && (
        <span
          style={{
            fontSize: "var(--text-2xs)",
            fontWeight: 600,
            letterSpacing: "var(--label-tracking)",
            textTransform: "uppercase",
            color: "var(--text-tertiary)",
          }}
        >
          {label}
        </span>
      )}
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          height,
          padding: "var(--pad-input)",
          borderRadius: "var(--radius-md)",
          background: "var(--surface-raised)",
          border: `1px solid ${error ? "var(--neg)" : focus ? "var(--accent)" : "var(--border-default)"}`,
          boxShadow: focus ? "0 0 0 3px var(--accent-subtle)" : "none",
          transition:
            "border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)",
        }}
      >
        {prefix && <span style={{ color: "var(--text-tertiary)", fontSize: 12, display: "inline-flex" }}>{prefix}</span>}
        <input
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          style={{
            flex: 1,
            minWidth: 0,
            background: "transparent",
            border: "none",
            outline: "none",
            boxShadow: "none",
            color: "var(--text-primary)",
            fontSize: 13,
            fontFamily: mono ? "var(--font-mono)" : "var(--font-ui)",
            ...inputStyle,
          }}
          {...rest}
        />
        {suffix && <span style={{ color: "var(--text-tertiary)", fontSize: 12, display: "inline-flex" }}>{suffix}</span>}
      </span>
      {(error || hint) && (
        <span style={{ fontSize: "var(--text-xs)", color: error ? "var(--neg-text)" : "var(--text-tertiary)" }}>
          {error || hint}
        </span>
      )}
    </label>
  );
}
