"use client";

import React from "react";

export interface DialogProps {
  open: boolean;
  title: React.ReactNode;
  onClose?: () => void;
  /** Right-aligned footer actions (Buttons). */
  footer?: React.ReactNode;
  /** Pixel width. Default 480. */
  width?: number;
  children?: React.ReactNode;
}

/** Modal dialog. The only dark-theme surface that carries a shadow. Esc and scrim-click close. */
export function Dialog({ open, title, onClose, footer, width = 480, children }: DialogProps) {
  React.useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && onClose) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--scrim)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        style={{
          width,
          maxWidth: "100%",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          background: "var(--surface-overlay)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-overlay)",
          fontFamily: "var(--font-ui)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "16px 20px",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <span style={{ fontSize: "var(--text-lg)", fontWeight: 600, color: "var(--text-primary)" }}>{title}</span>
          {onClose && (
            <button
              aria-label="Close"
              onClick={onClose}
              style={{
                marginLeft: "auto",
                width: 28,
                height: 28,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: "transparent",
                border: "none",
                borderRadius: "var(--radius-sm)",
                color: "var(--text-tertiary)",
                cursor: "pointer",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12">
                <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
        <div style={{ padding: 20, overflowY: "auto", color: "var(--text-primary)", fontSize: 13, lineHeight: 1.5 }}>
          {children}
        </div>
        {footer && (
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
              padding: "14px 20px",
              borderTop: "1px solid var(--border-subtle)",
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
