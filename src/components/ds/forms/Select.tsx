"use client";

import React from "react";

export interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  label?: string;
  /** Strings or {value, label} pairs. */
  options: Array<string | { value: string; label: string }>;
  size?: "md" | "lg";
  style?: React.CSSProperties;
}

export function Select({ label, options = [], value, onChange, size = "md", style, ...rest }: SelectProps) {
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
      <span style={{ position: "relative", display: "flex" }}>
        <select
          value={value}
          onChange={onChange}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          style={{
            appearance: "none",
            WebkitAppearance: "none",
            width: "100%",
            height,
            padding: "0 30px 0 12px",
            borderRadius: "var(--radius-md)",
            background: "var(--surface-raised)",
            color: "var(--text-primary)",
            border: `1px solid ${focus ? "var(--accent)" : "var(--border-default)"}`,
            boxShadow: focus ? "0 0 0 3px var(--accent-subtle)" : "none",
            fontSize: 13,
            fontFamily: "var(--font-ui)",
            cursor: "pointer",
            outline: "none",
            transition: "border-color var(--dur-fast) var(--ease-out)",
          }}
          {...rest}
        >
          {options.map((o) => {
            const opt = typeof o === "string" ? { value: o, label: o } : o;
            return (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            );
          })}
        </select>
        <svg
          width="10"
          height="6"
          viewBox="0 0 10 6"
          style={{
            position: "absolute",
            right: 12,
            top: "50%",
            transform: "translateY(-50%)",
            pointerEvents: "none",
          }}
        >
          <path d="M1 1l4 4 4-4" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" />
        </svg>
      </span>
    </label>
  );
}
