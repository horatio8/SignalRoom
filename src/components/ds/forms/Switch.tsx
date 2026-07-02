"use client";

import React from "react";

export interface SwitchProps {
  checked: boolean;
  onChange?: (next: boolean) => void;
  label?: React.ReactNode;
  disabled?: boolean;
  style?: React.CSSProperties;
}

export function Switch({ checked = false, onChange, label, disabled = false, style }: SwitchProps) {
  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        fontFamily: "var(--font-ui)",
        fontSize: 13,
        color: "var(--text-primary)",
        ...style,
      }}
    >
      <span
        role="switch"
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
          width: 32,
          height: 18,
          borderRadius: 999,
          flex: "none",
          position: "relative",
          background: checked ? "var(--accent)" : "var(--surface-overlay)",
          border: `1px solid ${checked ? "var(--accent)" : "var(--border-strong)"}`,
          transition: "background var(--dur-fast) var(--ease-out)",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: checked ? 16 : 2,
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: "#fff",
            transition: "left var(--dur-fast) var(--ease-out)",
          }}
        />
      </span>
      {label && <span onClick={() => !disabled && onChange && onChange(!checked)}>{label}</span>}
    </label>
  );
}
