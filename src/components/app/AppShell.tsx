"use client";

/**
 * App chrome: 52px top bar + 216px sidebar + scrolling content column
 * (max 1320px). Faithful port of the prototype shell, with navigation moved
 * to Next.js routes (spec §8: /[campaign]/overview … /admin, /onboarding).
 */

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApp, campaignResetPatch, type CampaignId, type Role } from "@/lib/state";
import { dataFor, CAMPAIGNS, isCampaignId } from "@/lib/data";
import { useLiveCampaigns } from "@/lib/data/liveCampaigns";
import { displayType } from "@/lib/ui";
import { useAuth } from "@/lib/auth/AuthProvider";

/** Screens a client_viewer may see (role gating per handoff §App shell). */
const CLIENT_ALLOWED = ["overview", "narrative", "feed", "stories", "briefings"];

interface NavItem {
  id: string;
  label: string;
  badge?: string | null;
  roles?: Role[];
}

// `campaign` is a slug: a fixture id ("voss" | "marsh") or a live DB campaign
// slug. It only ever gets template-interpolated into a path, so accept string.
export function screenHref(campaign: string, screen: string): string {
  if (screen === "admin") return "/admin";
  if (screen === "onboarding") return "/onboarding";
  if (screen === "login") return "/login";
  return `/${campaign}/${screen}`;
}

export function AppShell({
  screen,
  campaign,
  children,
}: {
  screen: string;
  // A fixture id or a live campaign slug — unknown slugs render fixture data
  // (dataFor falls back to voss); the Feed + Settings keywords are the live
  // surfaces. Kept as string so the layout can pass live slugs through.
  campaign: string;
  children: React.ReactNode;
}) {
  const { state, set, notify } = useApp();
  const { mode, user, signOut, passkeysEnabled, registerPasskey } = useAuth();
  const router = useRouter();
  const { role, dark } = state;
  // Unknown (live) slugs fall back to voss fixtures inside dataFor — acceptable
  // and pre-existing; only the Feed + Settings keywords read live rows.
  const D = dataFor(campaign as CampaignId);
  // Live campaigns the user can see, merged into the switcher below (fixtures
  // first, then DB campaigns that don't shadow voss/marsh). Empty in demo mode.
  const { campaigns: liveCampaigns } = useLiveCampaigns();
  const extraCampaigns = liveCampaigns.filter((c) => !isCampaignId(c.slug));
  const canManage = role !== "client";
  const isClient = role === "client";

  // A real authenticated user (supabase mode) replaces the demo role switcher.
  const realUser = mode === "supabase" && user ? user : null;

  // Reflect the authenticated user's role into the app store so the sidebar nav
  // gating (which reads state.role) matches who is actually signed in.
  useEffect(() => {
    if (user && user.role !== role) set({ role: user.role });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role]);

  // Keep "current campaign" in state for the campaign-less routes (/admin, /onboarding).
  useEffect(() => {
    // state.campaign is typed CampaignId; a live slug is stored via cast (it
    // only feeds routing + dataFor, both of which tolerate unknown slugs).
    if (state.campaign !== campaign) set({ campaign: campaign as CampaignId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign]);

  // Role gating on direct navigation: clients bounce off gated screens.
  useEffect(() => {
    if (role === "client" && !CLIENT_ALLOWED.includes(screen)) {
      router.replace(screenHref(campaign, "overview"));
    }
  }, [role, screen, campaign, router]);

  const go = (id: string) => router.push(screenHref(campaign, id));

  const allNav: NavItem[] = [
    { id: "overview", label: "Overview" },
    { id: "narrative", label: "Narrative" },
    { id: "feed", label: "Feed" },
    { id: "stories", label: "Stories" },
    { id: "briefings", label: "Briefings" },
    { id: "alerts", label: "Alerts", badge: D.alertBadge, roles: ["owner", "operator"] },
    { id: "respond", label: "Respond", badge: D.respondBadge, roles: ["owner", "operator"] },
    { id: "reach", label: "Reach", roles: ["owner", "operator"] },
    { id: "settings", label: "Settings", roles: ["owner", "operator"] },
    { id: "templates", label: "Templates", roles: ["owner", "operator"] },
    { id: "admin", label: "Admin", roles: ["owner"] },
  ];
  const nav = allNav.filter((n) => !n.roles || n.roles.includes(role));

  const setRole = (r: Role) => {
    set({ role: r });
    if (r === "client" && !CLIENT_ALLOWED.includes(screen)) {
      router.push(screenHref(campaign, "overview"));
    }
  };

  // Fixture ids and live slugs switch identically: reset per-campaign state and
  // navigate to the same screen under the new slug (mirrors fixture switching).
  const setCampaign = (c: string) => {
    set({ campaign: c as CampaignId, ...campaignResetPatch });
    if (screen !== "admin" && screen !== "onboarding") {
      router.push(screenHref(c, screen));
    }
  };

  const roleLabel = role === "client" ? "Client viewer" : role[0].toUpperCase() + role.slice(1);

  // User block: real user name/email when authenticated, else the demo default.
  const displayName = realUser ? realUser.name || realUser.email || "Signed in" : "Tom Keller";
  const initials = (() => {
    const source = realUser ? realUser.name || realUser.email || "" : "Tom Keller";
    const parts = source.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
    const raw = parts.length >= 2 ? parts[0][0] + parts[1][0] : source.slice(0, 2);
    return raw.toUpperCase() || "SR";
  })();

  const handleSignOut = async () => {
    await signOut();
    router.push("/login");
  };

  // Register a passkey for the current (real) user. Requires being signed in.
  const canSetUpPasskey = passkeysEnabled && !!realUser;
  const handleRegisterPasskey = async () => {
    const { error } = await registerPasskey();
    notify(error ?? "Passkey registered — you can now sign in with it");
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "var(--surface-app)",
        fontFamily: "var(--font-ui)",
        fontSize: 13,
        color: "var(--text-primary)",
      }}
    >
      {/* ============ TOP BAR ============ */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          height: 52,
          padding: "0 16px",
          background: "var(--surface-panel)",
          borderBottom: "1px solid var(--border-subtle)",
          flex: "none",
        }}
      >
        <div style={{ ...displayType, fontWeight: 700, fontSize: 15, whiteSpace: "nowrap" }}>
          Signal<span style={{ color: "var(--text-secondary)", fontWeight: 500 }}> Room</span>
        </div>
        <div style={{ width: 1, height: 20, background: "var(--border-default)" }} />
        <select
          value={campaign}
          onChange={(e) => setCampaign(e.target.value)}
          style={{
            height: 30,
            padding: "0 28px 0 10px",
            borderRadius: 8,
            background: "var(--surface-raised)",
            border: "1px solid var(--border-default)",
            fontFamily: "var(--font-ui)",
            fontSize: 12.5,
            color: "var(--text-primary)",
            cursor: "pointer",
            outline: "none",
            appearance: "auto",
          }}
        >
          {CAMPAIGNS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
          {extraCampaigns.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--text-tertiary)",
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--pos)" }} />
          ingest live · 42/hr
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          {!realUser && (
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
              {(["owner", "operator", "client"] as Role[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  style={{
                    height: 24,
                    padding: "0 10px",
                    borderRadius: 6,
                    border: "none",
                    cursor: "pointer",
                    fontFamily: "var(--font-ui)",
                    fontSize: 11.5,
                    fontWeight: role === r ? 600 : 500,
                    background: role === r ? "var(--surface-panel)" : "transparent",
                    color: role === r ? "var(--text-primary)" : "var(--text-tertiary)",
                  }}
                >
                  {r === "client" ? "Client" : r[0].toUpperCase() + r.slice(1)}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => set((s) => ({ dark: !s.dark }))}
            title="Toggle dark ops mode"
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              border: "1px solid var(--border-default)",
              background: "var(--surface-raised)",
              color: "var(--text-secondary)",
              cursor: "pointer",
              fontSize: 13,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ◐
          </button>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: "50%",
              background: "var(--accent-subtle)",
              border: "1px solid var(--accent-border)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "var(--font-mono)",
              fontSize: 10.5,
              fontWeight: 600,
              color: "var(--accent-text)",
            }}
          >
            {initials}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* ============ SIDEBAR ============ */}
        <div
          style={{
            width: 216,
            flex: "none",
            display: "flex",
            flexDirection: "column",
            gap: 2,
            padding: "12px 8px",
            background: "var(--surface-panel)",
            borderRight: "1px solid var(--border-subtle)",
          }}
        >
          {nav.map((item) => {
            const active = item.id === screen;
            return (
              <button
                key={item.id}
                onClick={() => go(item.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  height: 34,
                  padding: "0 12px",
                  borderRadius: 8,
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                  fontFamily: "var(--font-ui)",
                  fontSize: 13,
                  fontWeight: active ? 600 : 500,
                  background: active ? "var(--accent-subtle)" : "transparent",
                  color: active ? "var(--accent-text)" : "var(--text-secondary)",
                }}
              >
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.badge && (
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      fontWeight: 600,
                      padding: "1px 7px",
                      borderRadius: 999,
                      background: "var(--neg-subtle)",
                      color: "var(--neg-text)",
                    }}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
          <div style={{ flex: 1 }} />
          {canManage && (
            <button
              onClick={() => go("onboarding")}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                height: 34,
                borderRadius: 8,
                border: "1px dashed var(--border-strong)",
                background: "transparent",
                cursor: "pointer",
                fontFamily: "var(--font-ui)",
                fontSize: 12.5,
                fontWeight: 500,
                color: "var(--text-secondary)",
              }}
            >
              + New campaign
            </button>
          )}
          {canSetUpPasskey && (
            <button
              onClick={handleRegisterPasskey}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                height: 30,
                padding: "0 12px",
                marginTop: 4,
                borderRadius: 8,
                border: "none",
                background: "transparent",
                cursor: "pointer",
                textAlign: "left",
                fontFamily: "var(--font-ui)",
                fontSize: 12,
                fontWeight: 500,
                color: "var(--text-secondary)",
              }}
            >
              <svg
                aria-hidden
                width="14"
                height="14"
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
              Set up a passkey
            </button>
          )}
          <button
            onClick={handleSignOut}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              height: 38,
              padding: "0 12px",
              marginTop: 4,
              borderRadius: 8,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              textAlign: "left",
              fontFamily: "var(--font-ui)",
            }}
          >
            <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {displayName}
              </span>
              <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{roleLabel} · sign out</span>
            </span>
          </button>
        </div>

        {/* ============ CONTENT ============ */}
        <div style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>
          <div
            style={{
              maxWidth: 1320,
              margin: "0 auto",
              padding: "24px 28px",
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            {isClient && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 14px",
                  borderRadius: 10,
                  background: "var(--accent-subtle)",
                  border: "1px solid var(--accent-border)",
                }}
              >
                <span style={{ ...displayType, fontWeight: 700, fontSize: 12.5 }}>{D.name}</span>
                <span style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>
                  client portal · white-labeled · read-only · low-relevance noise filtered
                </span>
                <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-tertiary)" }}>
                  your logo + accent color here
                </span>
              </div>
            )}
            {children}
          </div>
        </div>
      </div>

      <AppToast />
    </div>
  );
}

/** Bottom-right confirmation toast (green bar, 340px, auto-dismiss 2.6s). */
export function AppToast() {
  const { state } = useApp();
  if (!state.toast) return null;
  return (
    <div
      style={{
        position: "fixed",
        bottom: 20,
        right: 20,
        zIndex: 300,
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
        width: 340,
        padding: "12px 14px",
        background: "var(--surface-overlay)",
        border: "1px solid var(--border-default)",
        borderRadius: 14,
        boxShadow: "var(--shadow-popover)",
      }}
    >
      <span style={{ width: 3, alignSelf: "stretch", borderRadius: 2, background: "var(--pos)", flex: "none" }} />
      <span style={{ fontSize: 12.5, fontWeight: 500, color: "var(--text-primary)", lineHeight: 1.45 }}>
        {state.toast}
      </span>
    </div>
  );
}
