/**
 * Cron entrypoint for the ingest pipeline (§ingest). Vercel Cron hits this on
 * the schedule registered in vercel.json (hourly). It authenticates the caller,
 * runs one ingest pass, and returns the JSON summary.
 *
 * Auth: requires `Authorization: Bearer ${CRON_SECRET}`. When CRON_SECRET is
 * unset AND we're not in production, the check is skipped so the route can be
 * exercised locally (curl) — a genuine deploy must set CRON_SECRET.
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { runIngest } from "@/lib/ingest";

// Ingest sweeps can run long; Vercel clamps maxDuration to the plan's ceiling.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  // ---- auth ----
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    // No secret configured in production → refuse rather than run wide open.
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 401 }
    );
  }
  // else: local/dev with no secret → allow, for testing.

  // ---- config guard ----
  if (!supabaseAdmin()) {
    return NextResponse.json(
      { error: "supabase admin not configured" },
      { status: 503 }
    );
  }

  // ---- run ----
  try {
    const summary = await runIngest();
    return NextResponse.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`[ingest] run failed: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
