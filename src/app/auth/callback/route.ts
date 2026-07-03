/**
 * Auth callback (spec §8) — the redirect target for magic links, OAuth, and
 * SAML SSO. Exchanges the `code` for a session (cookies set via the server
 * client), then bounces to `next` (default "/"). If Supabase isn't configured,
 * there's nothing to exchange — just redirect home.
 *
 * Wired as `emailRedirectTo` / `redirectTo: ${origin}/auth/callback` in
 * src/lib/auth/AuthProvider.tsx.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        return NextResponse.redirect(
          `${origin}/login?error=${encodeURIComponent(error.message)}`
        );
      }
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
