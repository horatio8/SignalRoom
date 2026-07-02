"use client";

import React from "react";
import { Badge } from "../feedback/Badge";
import { Switch } from "../forms/Switch";

const KIND_TONE = {
  candidate: "accent",
  opponent: "neutral",
  issue: "pos",
  misspelling: "warn",
} as const;

export interface KeywordRowProps {
  /** The term — may be a boolean expression. Always mono. */
  term: string;
  kind: "candidate" | "opponent" | "issue" | "misspelling";
  /** Canonical entity this maps to. */
  entityName?: string;
  matches24h?: number | string;
  active?: boolean;
  onToggle?: (next: boolean) => void;
  onEdit?: () => void;
  style?: React.CSSProperties;
}

/** Keyword in Settings CRUD: mono term + kind badge + 24h match count + active switch. */
export function KeywordRow({
  term,
  kind = "issue",
  entityName,
  matches24h,
  active = true,
  onToggle,
  onEdit,
  style,
}: KeywordRowProps) {
  const [hover, setHover] = React.useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 16px",
        borderBottom: "1px solid var(--border-subtle)",
        background: hover ? "var(--surface-raised)" : "transparent",
        transition: "background var(--dur-fast) var(--ease-out)",
        fontFamily: "var(--font-ui)",
        ...style,
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 12.5,
          color: "var(--text-primary)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          flex: 1,
          minWidth: 0,
        }}
      >
        {term}
      </span>
      <Badge tone={KIND_TONE[kind] || "neutral"}>{kind}</Badge>
      {entityName && <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", flex: "none" }}>{entityName}</span>}
      {matches24h != null && (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-tertiary)", flex: "none" }}>
          {typeof matches24h === "number" ? matches24h.toLocaleString() : matches24h} /24h
        </span>
      )}
      {hover && onEdit && (
        <button
          onClick={onEdit}
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: 0,
            fontFamily: "var(--font-ui)",
            fontSize: 11,
            color: "var(--accent-text)",
            textDecoration: "underline",
          }}
        >
          Edit
        </button>
      )}
      <Switch checked={active} onChange={onToggle} />
    </div>
  );
}
