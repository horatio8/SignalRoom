"use client";

import React from "react";

export interface TabsProps {
  tabs: Array<{ id: string; label: string; count?: number | string }>;
  /** id of the active tab. */
  active: string;
  onChange?: (id: string) => void;
  style?: React.CSSProperties;
}

export function Tabs({ tabs = [], active, onChange, style }: TabsProps) {
  return (
    <div
      role="tablist"
      style={{
        display: "flex",
        gap: 4,
        borderBottom: "1px solid var(--border-subtle)",
        fontFamily: "var(--font-ui)",
        ...style,
      }}
    >
      {tabs.map((t) => (
        <TabItem key={t.id} tab={t} isActive={t.id === active} onClick={() => onChange && onChange(t.id)} />
      ))}
    </div>
  );
}

function TabItem({
  tab,
  isActive,
  onClick,
}: {
  tab: { id: string; label: string; count?: number | string };
  isActive: boolean;
  onClick: () => void;
}) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      role="tab"
      aria-selected={isActive}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "10px 12px",
        marginBottom: -1,
        background: "transparent",
        border: "none",
        cursor: "pointer",
        fontFamily: "var(--font-ui)",
        fontSize: 13,
        fontWeight: isActive ? 600 : 500,
        color: isActive ? "var(--text-primary)" : hover ? "var(--text-secondary)" : "var(--text-tertiary)",
        borderBottom: `2px solid ${isActive ? "var(--accent)" : "transparent"}`,
        transition: "color var(--dur-fast) var(--ease-out)",
      }}
    >
      {tab.label}
      {tab.count != null && (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10.5,
            fontWeight: 500,
            padding: "1px 6px",
            borderRadius: 999,
            background: isActive ? "var(--accent-subtle)" : "var(--surface-raised)",
            color: isActive ? "var(--accent-text)" : "var(--text-tertiary)",
          }}
        >
          {tab.count}
        </span>
      )}
    </button>
  );
}
