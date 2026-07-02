"use client";

import React from "react";

export interface CheckboxProps {
  checked: boolean;
  onChange?: (next: boolean) => void;
  label?: React.ReactNode;
  disabled?: boolean;
  style?: React.CSSProperties;
}

export function Checkbox({ checked = false, onChange, label, disabled = false, style }: CheckboxProps) {
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
        role="checkbox"
        aria-checked={checked}
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && onChange && onChange(!checked)}
        onKeyDown={(e) => {
          if (!disabled && (e.key === " " || e.key === "Enter")) {
            e.preventDefault();
            onChange?.(!checked);
          }
        }}
        style={{
          width: 16,
          height: 16,
          borderRadius: 4,
          flex: "none",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: checked ? "var(--accent)" : "var(--surface-raised)",
          border: `1px solid ${checked ? "var(--accent)" : "var(--border-strong)"}`,
          transition: "background var(--dur-fast) var(--ease-out)",
        }}
      >
        {checked && (
          <svg width="9" height="7" viewBox="0 0 9 7">
            <path d="M1 3.5L3.5 6 8 1" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        )}
      </span>
      {label && <span onClick={() => !disabled && onChange && onChange(!checked)}>{label}</span>}
    </label>
  );
}
