"use client";

/**
 * Login — centered card, magic-link flow (Supabase Auth in production, §8).
 * Roles travel with invites; briefing/alert recipients need no account (M3).
 */

import React from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/state";
import { cardSurface, displayType } from "@/lib/ui";

export default function LoginPage() {
  const { state, set } = useApp();
  const router = useRouter();
  const sent = state.loginState === "sent";

  return (
    <div
      data-screen-label="Login"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "var(--surface-app)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: "var(--font-ui)",
        fontSize: 13,
        color: "var(--text-primary)",
      }}
    >
      <div style={{ width: 400, maxWidth: "100%", display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
          <span style={{ ...displayType, fontWeight: 700, fontSize: 24 }}>
            Signal<span style={{ color: "var(--text-secondary)", fontWeight: 500 }}> Room</span>
          </span>
          <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
            Election intelligence · sign in with a magic link
          </span>
        </div>
        <div style={{ ...cardSurface, padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
          {!sent ? (
            <>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 600,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "var(--text-tertiary)",
                  }}
                >
                  Email
                </span>
                <input
                  placeholder="you@campaign.org"
                  style={{
                    height: 38,
                    padding: "0 12px",
                    borderRadius: 10,
                    background: "var(--surface-raised)",
                    border: "1px solid var(--border-default)",
                    fontFamily: "var(--font-ui)",
                    fontSize: 13,
                    color: "var(--text-primary)",
                    outline: "none",
                  }}
                />
              </label>
              <button
                onClick={() => set({ loginState: "sent" })}
                style={{
                  height: 38,
                  borderRadius: 10,
                  border: "none",
                  background: "var(--accent)",
                  color: "#fff",
                  fontFamily: "var(--font-ui)",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Send magic link
              </button>
              <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", textAlign: "center", lineHeight: 1.5 }}>
                No passwords. Your role — owner, operator, or client viewer — travels with your invite.
              </span>
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center", padding: "8px 0" }}>
              <span
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  background: "var(--pos-subtle)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--pos-text)",
                  fontSize: 16,
                }}
              >
                ✓
              </span>
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>Check your email</span>
              <span style={{ fontSize: 12, color: "var(--text-secondary)", textAlign: "center", lineHeight: 1.5 }}>
                A sign-in link is on its way. It expires in 15 minutes.
              </span>
              <button
                onClick={() => {
                  set({ loginState: "idle" });
                  router.push(`/${state.campaign}/overview`);
                }}
                style={{
                  height: 34,
                  padding: "0 16px",
                  borderRadius: 10,
                  border: "1px solid var(--border-default)",
                  background: "var(--surface-raised)",
                  fontFamily: "var(--font-ui)",
                  fontSize: 12.5,
                  fontWeight: 500,
                  color: "var(--text-primary)",
                  cursor: "pointer",
                }}
              >
                (demo) Open the link →
              </button>
            </div>
          )}
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-tertiary)", textAlign: "center" }}>
          RLS multi-tenant · clients only ever see their own campaign
        </span>
      </div>
    </div>
  );
}
