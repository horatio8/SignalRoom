/**
 * Cron entrypoint for the ingest pipeline (§ingest). Vercel Cron hits this on
 * the schedule registered in vercel.json (hourly). It authenticates the caller,
 * runs one ingest pass, and returns the JSON summary.
 *
 * Auth: requires `Authorization: Bearer ${CRON_SECRET}`. When CRON_SECRET is
 * unset AND we're not in production, the check is skipped so the route can be
 * exercised locally (curl) — a genuine deploy must set CRON_SECRET.
 *
 * Optional `?only=` query param restricts which sources run: a comma-separated
 * list of source names (e.g. `?only=gnews` or `?only=gnews,newsdata`). Unknown
 * values are ignored; if none are valid the run falls back to all sources.
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { runIngest } from "@/lib/ingest";
import { INGEST_SOURCES, type IngestSource } from "@/lib/ingest/types";

/** Parse `?only=` into a validated IngestSource list, or undefined for "all". */
function parseOnly(request: Request): IngestSource[] | undefined {
  const raw = new URL(request.url).searchParams.get("only");
  if (!raw) return undefined;
  const valid = new Set(INGEST_SOURCES);
  const parsed = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is IngestSource => valid.has(s as IngestSource));
  return parsed.length ? parsed : undefined;
}

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
    const only = parseOnly(request);
    const summary = await runIngest(only ? { only } : undefined);
    return NextResponse.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`[ingest] run failed: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
