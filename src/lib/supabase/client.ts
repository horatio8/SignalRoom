"use client";

/**
 * Browser Supabase client (spec §8). Used from client components — the auth
 * provider and any future RLS-scoped reads. Safe when Supabase env is absent:
 * `supabaseConfigured()` is false and `createClient()` returns null, so callers
 * fall through to the app's DEMO mode (public Vercel demo stays open).
 *
 * See docs/AUTH.md and docs/INTEGRATIONS.md §1.
 */

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/** True when the public Supabase env is present (auth ENFORCES; else demo). */
export function supabaseConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

/**
 * A singleton browser client, or null when unconfigured (demo mode). Callers
 * MUST guard the null (the AuthProvider does). Kept as a module singleton so
 * repeated calls in a session reuse the same auth/session subscription.
 */
let browserClient: SupabaseClient | null = null;

export function createClient(): SupabaseClient | null {
  if (!supabaseConfigured()) return null;
  if (browserClient) return browserClient;
  browserClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  return browserClient;
}
