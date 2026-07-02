"use client";

import React from "react";

export interface RadioProps {
  checked: boolean;
  onChange?: (selected: boolean) => void;
  label?: React.ReactNode;
  disabled?: boolean;
  style?: React.CSSProperties;
}

export function Radio({ checked = false, onChange, label, disabled = false, style }: RadioProps) {
  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        fontFamily: "var(--font-ui)",
        fontSize: 13,
        color: "var(--text-primary)",
        ...style,
      }}
    >
      <span
        role="radio"
        aria-checked={checked}
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && onChange && onChange(true)}
        onKeyDown={(e) => {
          if (!disabled && (e.key === " " || e.key === "Enter")) {
            e.preventDefault();
            onChange?.(true);
          }
        }}
        style={{
          width: 16,
          height: 16,
          borderRadius: "50%",
          flex: "none",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--surface-raised)",
          border: `1px solid ${checked ? "var(--accent)" : "var(--border-strong)"}`,
          transition: "border-color var(--dur-fast) var(--ease-out)",
        }}
      >
        {checked && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)" }} />}
      </span>
      {label && <span onClick={() => !disabled && onChange && onChange(true)}>{label}</span>}
    </label>
  );
}
