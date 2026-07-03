/**
 * Server Supabase client (spec §8) — cookie-backed session for Server
 * Components, Route Handlers, and Server Actions. Reads/writes the auth cookies
 * via next/headers so the session survives across requests. Safe when Supabase
 * env is absent: `createClient()` returns null and callers fall through to the
 * app's DEMO mode.
 *
 * NOTE: This is the cookie-store variant for the app router. The middleware
 * (middleware.ts) uses its own request/response cookie plumbing to refresh the
 * session on every navigation.
 */

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/** True when the public Supabase env is present (auth ENFORCES; else demo). */
export function supabaseConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

/** Server client bound to the request cookie store, or null when unconfigured. */
export async function createClient(): Promise<SupabaseClient | null> {
  if (!supabaseConfigured()) return null;
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          // In Server Components the cookie store is read-only; the middleware
          // is what actually persists refreshed session cookies. Swallow the
          // write error so pure reads still work.
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            /* called from a Server Component — middleware handles the refresh */
          }
        },
      },
    }
  );
}
