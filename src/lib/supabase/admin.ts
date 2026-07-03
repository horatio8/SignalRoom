import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client for workers and cron routes (ingest,
 * enrichment, BYOK credential resolution). BYPASSES RLS — never import from
 * client components; `server-only` makes that a build error.
 *
 * Returns null when the service role key isn't configured (e.g. local demo
 * mode) so callers can degrade gracefully.
 */
export function supabaseAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
