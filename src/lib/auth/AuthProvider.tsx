"use client";

/**
 * AuthProvider — real Supabase Auth when configured, a graceful DEMO fallback
 * otherwise (spec §8). Exposes the fixed AuthContextValue contract in
 * ./types.ts; the login page and AppShell code against `useAuth()`.
 *
 * Mode detection: NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY
 * present → "supabase" (enforced by middleware.ts); else → "demo" (no network,
 * public Vercel demo stays open).
 *
 * IMPORTANT (non-breaking): we expose `user.role` via context only. The app's
 * existing nav gating lives on useApp() in src/lib/state.tsx; the AppShell owner
 * syncs role from here into the app store. We deliberately do NOT import useApp
 * to avoid a provider ordering / circular-dependency problem.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { AuthContextValue, AuthRole, AuthUser, SsoEnabled } from "./types";
import { createClient, supabaseConfigured } from "@/lib/supabase/client";

// ── Demo credential ─────────────────────────────────────────────────────────
// A FIXED generated pair shown on the login page in demo mode and provisioned
// by scripts/create-user.mjs for the real deployment. The same strings appear
// in docs/AUTH.md and scripts/create-user.mjs — keep them in sync.
const DEMO_EMAIL = "owner@signalroom.app";
const DEMO_PASSWORD = "Signal-Room-DH3MCCKk";
const DEMO_STORAGE_KEY = "sr-demo-auth";

/** Public env feature flags → which SSO buttons the login page shows. */
function readSsoEnabled(): SsoEnabled {
  return {
    google: process.env.NEXT_PUBLIC_AUTH_GOOGLE === "true",
    github: process.env.NEXT_PUBLIC_AUTH_GITHUB === "true",
    azure: process.env.NEXT_PUBLIC_AUTH_AZURE === "true",
    saml: process.env.NEXT_PUBLIC_AUTH_SAML === "true",
  };
}

/** DB 'client_viewer' → app 'client'; otherwise pass through with an operator fallback. */
function normalizeRole(raw: unknown): AuthRole {
  if (raw === "owner") return "owner";
  if (raw === "operator") return "operator";
  if (raw === "client" || raw === "client_viewer") return "client";
  return "operator";
}

/** Derive a display name from an email local-part when no name is set. */
function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** A light e-mail sanity check for the demo sign-in (no network validation). */
function looksLikeEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

const SOFT_SUPABASE_ONLY =
  "Configure Supabase to enable this sign-in method.";

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const configured = supabaseConfigured();
  const mode = configured ? "supabase" : "demo";
  const ssoEnabled = useMemo(readSsoEnabled, []);

  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  // Keep one browser client for the session lifetime (null in demo mode).
  const supabaseRef = useRef(configured ? createClient() : null);

  // ── Supabase mode: resolve session + subscribe to auth changes ────────────
  useEffect(() => {
    if (!configured) return;
    const supabase = supabaseRef.current;
    if (!supabase) return;
    let active = true;

    // Resolve the app role. Preferred source is the current_app_role() RPC
    // (highest role across campaign_members, see 0004_auth.sql); fall back to
    // user_metadata.role, then 'operator'.
    async function toAuthUser(sessionUser: {
      id: string;
      email?: string | null;
      user_metadata?: Record<string, unknown>;
    }): Promise<AuthUser> {
      let role: AuthRole = normalizeRole(sessionUser.user_metadata?.role);
      try {
        const { data, error } = await supabase!.rpc("current_app_role");
        if (!error && data) role = normalizeRole(data);
      } catch {
        /* RPC not present yet (schema not applied) — keep metadata/operator */
      }
      const email = sessionUser.email ?? null;
      const metaName =
        (sessionUser.user_metadata?.name as string | undefined) ??
        (sessionUser.user_metadata?.full_name as string | undefined) ??
        null;
      return {
        id: sessionUser.id,
        email,
        name: metaName ?? (email ? nameFromEmail(email) : null),
        role,
      };
    }

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      if (data.session?.user) {
        setUser(await toAuthUser(data.session.user));
      }
      setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!active) return;
        setUser(session?.user ? await toAuthUser(session.user) : null);
      }
    );

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [configured]);

  // ── Demo mode: hydrate the local session ──────────────────────────────────
  useEffect(() => {
    if (configured) return;
    try {
      const raw = localStorage.getItem(DEMO_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AuthUser;
        setUser({ ...parsed, role: normalizeRole(parsed.role) });
      }
    } catch {
      /* corrupt entry — ignore */
    }
    setReady(true);
  }, [configured]);

  const persistDemoUser = useCallback((next: AuthUser) => {
    try {
      localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable — session stays in-memory */
    }
    setUser(next);
  }, []);

  const origin = () =>
    typeof window !== "undefined" ? window.location.origin : "";

  // ── Contract methods ──────────────────────────────────────────────────────
  const signInWithPassword = useCallback<
    AuthContextValue["signInWithPassword"]
  >(
    async (email, password) => {
      if (configured) {
        const supabase = supabaseRef.current!;
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        return { error: error?.message ?? null };
      }
      // Demo: accept the fixed credential OR any valid-looking email + pw ≥ 6.
      const matchesFixed =
        email.trim().toLowerCase() === DEMO_EMAIL && password === DEMO_PASSWORD;
      if (matchesFixed) {
        persistDemoUser({
          id: "demo-owner",
          email: DEMO_EMAIL,
          name: "Owner",
          role: "owner",
        });
        return { error: null };
      }
      if (looksLikeEmail(email) && password.length >= 6) {
        const clean = email.trim().toLowerCase();
        persistDemoUser({
          id: `demo-${clean}`,
          email: clean,
          name: nameFromEmail(clean),
          role: "operator",
        });
        return { error: null };
      }
      return {
        error: "Enter a valid email and a password of at least 6 characters.",
      };
    },
    [configured, persistDemoUser]
  );

  const signUp = useCallback<AuthContextValue["signUp"]>(
    async (email, password, name) => {
      if (configured) {
        const supabase = supabaseRef.current!;
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: name ? { name } : undefined,
            emailRedirectTo: `${origin()}/auth/callback`,
          },
        });
        return {
          error: error?.message ?? null,
          // No session back means email confirmation is required.
          needsConfirmation: !error && !data.session,
        };
      }
      // Demo: behave like sign-in, no confirmation step.
      const { error } = await signInWithPassword(email, password);
      if (!error && name && looksLikeEmail(email)) {
        const clean = email.trim().toLowerCase();
        persistDemoUser({
          id: `demo-${clean}`,
          email: clean,
          name,
          role: "operator",
        });
      }
      return { error, needsConfirmation: false };
    },
    [configured, persistDemoUser, signInWithPassword]
  );

  const signInWithMagicLink = useCallback<
    AuthContextValue["signInWithMagicLink"]
  >(
    async (email) => {
      if (!configured) return { error: SOFT_SUPABASE_ONLY };
      const supabase = supabaseRef.current!;
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${origin()}/auth/callback` },
      });
      return { error: error?.message ?? null };
    },
    [configured]
  );

  const signInWithOAuth = useCallback<AuthContextValue["signInWithOAuth"]>(
    async (provider) => {
      if (!configured) return { error: SOFT_SUPABASE_ONLY };
      const supabase = supabaseRef.current!;
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: `${origin()}/auth/callback` },
      });
      return { error: error?.message ?? null };
    },
    [configured]
  );

  const signInWithSSO = useCallback<AuthContextValue["signInWithSSO"]>(
    async (domain) => {
      if (!configured) return { error: SOFT_SUPABASE_ONLY };
      const supabase = supabaseRef.current!;
      const { data, error } = await supabase.auth.signInWithSSO({ domain });
      if (error) return { error: error.message };
      // signInWithSSO returns a redirect URL to the IdP; send the browser there.
      if (data?.url && typeof window !== "undefined") {
        window.location.assign(data.url);
      }
      return { error: null };
    },
    [configured]
  );

  const signOut = useCallback<AuthContextValue["signOut"]>(async () => {
    if (configured) {
      await supabaseRef.current!.auth.signOut();
      setUser(null);
      return;
    }
    try {
      localStorage.removeItem(DEMO_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setUser(null);
  }, [configured]);

  const demoSignIn = useCallback<AuthContextValue["demoSignIn"]>(
    (role = "operator") => {
      if (configured) return; // demo shortcut is a no-op under real auth
      const normalized = normalizeRole(role);
      persistDemoUser({
        id: `demo-${normalized}`,
        email: normalized === "owner" ? DEMO_EMAIL : `${normalized}@signalroom.app`,
        name: `Demo ${normalized[0].toUpperCase()}${normalized.slice(1)}`,
        role: normalized,
      });
    },
    [configured, persistDemoUser]
  );

  const value: AuthContextValue = {
    mode,
    ready,
    user,
    signInWithPassword,
    signUp,
    signInWithMagicLink,
    signInWithOAuth,
    signInWithSSO,
    signOut,
    demoSignIn,
    ssoEnabled,
    demoCredential: configured
      ? null
      : { email: DEMO_EMAIL, password: DEMO_PASSWORD },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
