/**
 * Cron entrypoint for the daily briefing generator (spec §6). Vercel Cron hits
 * this route (GET) each morning to write one briefing per active campaign from
 * the day's enriched coverage. The heavy lifting lives in `src/lib/briefing` —
 * this handler only does auth, config guards, and JSON shaping.
 *
 * Auth mirrors the enrich route: `Authorization: Bearer ${CRON_SECRET}`. When
 * CRON_SECRET is unset we allow the request only outside production, so local
 * `curl` works without a secret while a misconfigured prod deploy fails closed.
 *
 * Optional `?date=YYYY-MM-DD` covers a specific day (backfill / re-run); absent,
 * it covers today.
 */

import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { runBriefing } from "@/lib/briefing";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Accept only a strict yyyy-mm-dd date param. */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest) {
  // ---- Auth ----
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = request.headers.get("authorization");
    if (header !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    // No secret configured in production — refuse rather than run wide open.
    return NextResponse.json(
      { error: "CRON_SECRET is not configured." },
      { status: 401 }
    );
  }
  // else: CRON_SECRET unset and not production — allow for local testing.

  // ---- Config guards ----
  if (!supabaseAdmin()) {
    return NextResponse.json(
      { error: "Supabase service-role client is not configured." },
      { status: 503 }
    );
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured." },
      { status: 503 }
    );
  }

  // ---- Optional date param ----
  const dateParam = request.nextUrl.searchParams.get("date");
  if (dateParam && !DATE_RE.test(dateParam)) {
    return NextResponse.json(
      { error: "Invalid date; expected YYYY-MM-DD." },
      { status: 400 }
    );
  }

  // ---- Run ----
  try {
    const summary = await runBriefing(dateParam ? { date: dateParam } : undefined);
    return NextResponse.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Briefing run failed.", detail: message },
      { status: 500 }
    );
  }
}
