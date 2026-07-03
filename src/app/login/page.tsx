"use client";

/**
 * Login — centered card. Password sign-in / sign-up, magic-link fallback, and
 * SSO/OAuth (Supabase Auth in production, §8). Roles travel with invites;
 * briefing/alert recipients need no account (M3). A demo affordance keeps the
 * public deployment usable with no backend connected.
 */

/* eslint-disable @next/next/no-img-element */
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/state";
import { useAuth } from "@/lib/auth/AuthProvider";
import { cardSurface, displayType, overline } from "@/lib/ui";

type Tab = "signin" | "signup";

const inputStyle: React.CSSProperties = {
  height: 38,
  padding: "0 12px",
  borderRadius: 10,
  background: "var(--surface-raised)",
  border: "1px solid var(--border-default)",
  fontFamily: "var(--font-ui)",
  fontSize: 13,
  color: "var(--text-primary)",
  outline: "none",
  width: "100%",
};

const primaryBtn: React.CSSProperties = {
  height: 38,
  borderRadius: 10,
  border: "none",
  background: "var(--accent)",
  color: "#fff",
  fontFamily: "var(--font-ui)",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  height: 38,
  borderRadius: 10,
  border: "1px solid var(--border-default)",
  background: "var(--surface-raised)",
  fontFamily: "var(--font-ui)",
  fontSize: 12.5,
  fontWeight: 500,
  color: "var(--text-primary)",
  cursor: "pointer",
  width: "100%",
};

/** Small brand monogram chip for providers without a bundled SVG. */
function Monogram({ label }: { label: string }) {
  return (
    <span
      aria-hidden
      style={{
        width: 16,
        height: 16,
        borderRadius: 4,
        background: "var(--surface-panel)",
        border: "1px solid var(--border-default)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        fontWeight: 700,
        color: "var(--text-secondary)",
        flex: "none",
      }}
    >
      {label}
    </span>
  );
}

export default function LoginPage() {
  const { state } = useApp();
  const router = useRouter();
  const {
    mode,
    ready,
    user,
    signInWithPassword,
    signUp,
    signInWithMagicLink,
    signInWithOAuth,
    signInWithSSO,
    passkeysEnabled,
    signInWithPasskey,
    demoSignIn,
    ssoEnabled,
    demoCredential,
  } = useAuth();

  const [tab, setTab] = useState<Tab>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [magicSent, setMagicSent] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);
  const [ssoOpen, setSsoOpen] = useState(false);
  const [ssoDomain, setSsoDomain] = useState("");

  // Redirect on successful sign-in (user becomes non-null).
  useEffect(() => {
    if (user) router.replace(`/${state.campaign || "voss"}/overview`);
  }, [user, state.campaign, router]);

  const anySso =
    ssoEnabled.google || ssoEnabled.github || ssoEnabled.azure || ssoEnabled.saml;

  const switchTab = (t: Tab) => {
    setTab(t);
    setError(null);
  };

  const submit = async () => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      if (tab === "signin") {
        const { error } = await signInWithPassword(email, password);
        if (error) setError(error);
      } else {
        const { error, needsConfirmation } = await signUp(email, password, name || undefined);
        if (error) setError(error);
        else if (needsConfirmation) setConfirmSent(true);
      }
    } finally {
      setBusy(false);
    }
  };

  const sendMagic = async () => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const { error } = await signInWithMagicLink(email);
      if (error) setError(error);
      else setMagicSent(true);
    } finally {
      setBusy(false);
    }
  };

  const passkey = async () => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      // Discoverable credential — no email needed. The user→redirect effect
      // above handles success once the SIGNED_IN event lands.
      const { error } = await signInWithPasskey();
      if (error) setError(error);
    } finally {
      setBusy(false);
    }
  };

  const oauth = async (provider: "google" | "github" | "azure") => {
    setError(null);
    const { error } = await signInWithOAuth(provider);
    if (error) setError(error);
  };

  const sso = async () => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const { error } = await signInWithSSO(ssoDomain);
      if (error) setError(error);
    } finally {
      setBusy(false);
    }
  };

  const shell = (children: React.ReactNode) => (
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
      {children}
    </div>
  );

  // Avoid a flash of the form before auth is resolved.
  if (!ready) {
    return shell(
      <span style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>Loading…</span>,
    );
  }

  const sentState = (title: string, body: string) => (
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
      <span style={{ fontSize: 13.5, fontWeight: 600 }}>{title}</span>
      <span style={{ fontSize: 12, color: "var(--text-secondary)", textAlign: "center", lineHeight: 1.5 }}>
        {body}
      </span>
      <button
        onClick={() => {
          setMagicSent(false);
          setConfirmSent(false);
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
        Back to sign in
      </button>
    </div>
  );

  return shell(
    <div style={{ width: 400, maxWidth: "100%", display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
        <span style={{ ...displayType, fontWeight: 700, fontSize: 24 }}>
          Signal<span style={{ color: "var(--text-secondary)", fontWeight: 500 }}> Room</span>
        </span>
        <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
          Election intelligence · sign in to your war room
        </span>
      </div>

      <div style={{ ...cardSurface, padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
        {magicSent ? (
          sentState("Check your email", "A sign-in link is on its way. It expires in 15 minutes.")
        ) : confirmSent ? (
          sentState("Check your email to confirm", "We sent a confirmation link. Click it to activate your account.")
        ) : (
          <>
            {/* Segmented control — same visual pattern as the top-bar role switcher. */}
            <div
              style={{
                display: "flex",
                background: "var(--surface-raised)",
                border: "1px solid var(--border-default)",
                borderRadius: 8,
                padding: 2,
                gap: 2,
              }}
            >
              {(
                [
                  ["signin", "Sign in"],
                  ["signup", "Create account"],
                ] as [Tab, string][]
              ).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => switchTab(id)}
                  style={{
                    flex: 1,
                    height: 28,
                    borderRadius: 6,
                    border: "none",
                    cursor: "pointer",
                    fontFamily: "var(--font-ui)",
                    fontSize: 12,
                    fontWeight: tab === id ? 600 : 500,
                    background: tab === id ? "var(--surface-panel)" : "transparent",
                    color: tab === id ? "var(--text-primary)" : "var(--text-tertiary)",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === "signup" && (
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={overline}>Name (optional)</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jordan Voss"
                  style={inputStyle}
                />
              </label>
            )}

            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={overline}>Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@campaign.org"
                style={inputStyle}
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={overline}>Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submit();
                }}
                placeholder="••••••••"
                style={inputStyle}
              />
            </label>

            {error && (
              <span style={{ fontSize: 11.5, color: "var(--neg-text)", lineHeight: 1.5 }}>{error}</span>
            )}

            <button onClick={submit} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>
              {busy ? "One moment…" : tab === "signin" ? "Sign in" : "Create account"}
            </button>

            {passkeysEnabled && (
              <button
                onClick={passkey}
                disabled={busy}
                style={{ ...secondaryBtn, opacity: busy ? 0.6 : 1 }}
              >
                <svg
                  aria-hidden
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ display: "block", flex: "none" }}
                >
                  <circle cx="8" cy="10" r="4" />
                  <path d="M10.85 12.85 20 22" />
                  <path d="m17 19 2-2" />
                  <path d="m19 17 1.5-1.5" />
                </svg>
                Sign in with a passkey
              </button>
            )}

            <button
              onClick={sendMagic}
              disabled={busy}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                fontFamily: "var(--font-ui)",
                fontSize: 12,
                fontWeight: 500,
                color: "var(--accent-text)",
                textAlign: "center",
              }}
            >
              Email me a magic link instead
            </button>

            {anySso && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "2px 0" }}>
                  <span style={{ flex: 1, height: 1, background: "var(--border-subtle)" }} />
                  <span style={{ ...overline, color: "var(--text-tertiary)" }}>or continue with</span>
                  <span style={{ flex: 1, height: 1, background: "var(--border-subtle)" }} />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {ssoEnabled.google && (
                    <button onClick={() => oauth("google")} style={secondaryBtn}>
                      <img src="/icons/google.svg" alt="" style={{ width: 15, height: 15, display: "block" }} />
                      Google
                    </button>
                  )}
                  {ssoEnabled.github && (
                    <button onClick={() => oauth("github")} style={secondaryBtn}>
                      <img src="/icons/github.svg" alt="" style={{ width: 15, height: 15, display: "block" }} />
                      GitHub
                    </button>
                  )}
                  {ssoEnabled.azure && (
                    <button onClick={() => oauth("azure")} style={secondaryBtn}>
                      <Monogram label="AZ" />
                      Microsoft Azure
                    </button>
                  )}
                  {ssoEnabled.saml && (
                    <>
                      <button onClick={() => setSsoOpen((v) => !v)} style={secondaryBtn}>
                        <Monogram label="SSO" />
                        Single sign-on (SSO)
                      </button>
                      {ssoOpen && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <span style={overline}>Work email domain</span>
                          <div style={{ display: "flex", gap: 8 }}>
                            <input
                              value={ssoDomain}
                              onChange={(e) => setSsoDomain(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") sso();
                              }}
                              placeholder="campaign.org"
                              style={inputStyle}
                            />
                            <button
                              onClick={sso}
                              disabled={busy || !ssoDomain}
                              style={{
                                ...primaryBtn,
                                width: "auto",
                                padding: "0 16px",
                                opacity: busy || !ssoDomain ? 0.6 : 1,
                              }}
                            >
                              Continue
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {mode === "demo" && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            padding: 16,
            borderRadius: 12,
            background: "var(--surface-sunken)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <span style={{ ...overline }}>Demo mode</span>
          <span style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
            No backend connected. Explore the room with demo credentials or jump straight in.
          </span>

          {demoCredential && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 3,
                  padding: "8px 10px",
                  borderRadius: 8,
                  background: "var(--surface-raised)",
                  border: "1px solid var(--border-default)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--text-secondary)",
                }}
              >
                <span>{demoCredential.email}</span>
                <span>{demoCredential.password}</span>
              </div>
              <button
                onClick={() => {
                  setTab("signin");
                  setEmail(demoCredential.email);
                  setPassword(demoCredential.password);
                  setError(null);
                }}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  fontFamily: "var(--font-ui)",
                  fontSize: 12,
                  fontWeight: 500,
                  color: "var(--accent-text)",
                  textAlign: "left",
                }}
              >
                Fill demo credentials
              </button>
            </div>
          )}

          <button onClick={() => demoSignIn("operator")} style={{ ...secondaryBtn, height: 36 }}>
            Continue to demo as operator
          </button>
        </div>
      )}

      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-tertiary)", textAlign: "center" }}>
        RLS multi-tenant · clients only ever see their own campaign
      </span>
    </div>,
  );
}
