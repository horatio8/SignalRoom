/**
 * Auth enforcement + session refresh (spec §8).
 *
 * When Supabase is configured: refresh the session cookie on every request and,
 * if there's no session and the path isn't public, redirect to /login. This is
 * what makes enforcement AUTOMATIC on go-live.
 *
 * When Supabase is NOT configured (the public Vercel demo): pass everything
 * through untouched so the demo stays open and the login page still works.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/** Paths that never require a session. */
const PUBLIC_PREFIXES = [
  "/login",
  "/auth", // /auth/callback (code exchange) + any future auth routes
  "/api/ingest", // per-source webhooks authenticate with x-ingest-key, not a session
  "/api/cron", // scheduled jobs authenticate with the CRON_SECRET bearer, not a session
  "/_next",
  "/favicon",
  "/icon",
  "/icons", // bundled brand SVGs
  "/robots",
  "/sitemap",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`) || pathname.startsWith(p + ".")
  );
}

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Demo mode (unconfigured): no enforcement, no cookie work — stay open.
  if (!url || !anon) return NextResponse.next();

  // Configured: build a response we can attach refreshed cookies to.
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // IMPORTANT: getUser() (not getSession) revalidates the token and triggers the
  // cookie refresh above. Do nothing between createServerClient and this call.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  if (!user && !isPublicPath(pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  // Run on everything except static assets and image files. Public-path logic
  // above still lets /login, /auth, and ingest webhooks through when there's no
  // session.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
