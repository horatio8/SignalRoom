"use client";

import React from "react";
import { SourceBadge } from "../signals/SourceBadge";
import { SentimentChip } from "../signals/SentimentChip";

export interface MentionRowProps {
  /** Platform key for the SourceBadge (reddit, x, news, podcast…). */
  platform: string;
  author: string;
  followers?: number;
  /** "07:42 · 18 min ago" — absolute + relative, campaign timezone. */
  time: string;
  title?: string;
  body?: string;
  /** Stance-aware sentiment (-100..100). */
  sentiment?: number;
  reach?: number;
  /** True renders the row dimmed (hidden from counts). */
  suppressed?: boolean;
  onOpen?: () => void;
  onSuppress?: () => void;
  style?: React.CSSProperties;
}

/** One captured mention in the feed. Suppress supports M2 (hide wrong items → precision tuning). */
export function MentionRow({
  platform,
  author,
  followers,
  time,
  title,
  body,
  sentiment,
  reach,
  suppressed = false,
  onOpen,
  onSuppress,
  style,
}: MentionRowProps) {
  const [hover, setHover] = React.useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        gap: 12,
        padding: "12px 16px",
        borderBottom: "1px solid var(--border-subtle)",
        background: hover ? "var(--surface-raised)" : "transparent",
        opacity: suppressed ? 0.45 : 1,
        transition: "background var(--dur-fast) var(--ease-out)",
        fontFamily: "var(--font-ui)",
        cursor: onOpen ? "pointer" : "default",
        ...style,
      }}
      onClick={onOpen}
    >
      <SourceBadge platform={platform} style={{ marginTop: 2 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
          {title && (
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--text-primary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {title}
            </span>
          )}
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-tertiary)", flex: "none", marginLeft: "auto" }}>
            {time}
          </span>
        </div>
        {body && (
          <span
            style={{
              fontSize: 12.5,
              color: "var(--text-secondary)",
              lineHeight: 1.45,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {body}
          </span>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-tertiary)" }}>
            {author}
            {followers != null ? ` · ${followers.toLocaleString()} followers` : ""}
            {reach != null ? ` · reach ${reach.toLocaleString()}` : ""}
          </span>
          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            {sentiment != null && <SentimentChip value={sentiment} />}
            {hover && onSuppress && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSuppress();
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "var(--font-ui)",
                  fontSize: 11,
                  color: "var(--text-tertiary)",
                  padding: 0,
                  textDecoration: "underline",
                }}
              >
                {suppressed ? "Restore" : "Hide"}
              </button>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
