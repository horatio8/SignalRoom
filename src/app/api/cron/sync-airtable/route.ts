/**
 * Cron entrypoint for the Airtable audit mirror (§audit). Vercel Cron hits this
 * route on a schedule (GET) to mirror the backlog of un-synced mentions into the
 * Airtable audit table. The heavy lifting lives in `src/lib/sync/airtable` — this
 * handler only does auth, config guards, and JSON shaping.
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}`. When CRON_SECRET is unset we
 * allow the request only outside production, so local `curl` works without a
 * secret while a misconfigured prod deploy fails closed.
 */

import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { airtableConfigured, syncAirtable } from "@/lib/sync/airtable";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

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
  if (!airtableConfigured()) {
    return NextResponse.json(
      { error: "AIRTABLE_TOKEN is not configured; Airtable mirror disabled." },
      { status: 503 }
    );
  }

  // ---- Run ----
  try {
    const summary = await syncAirtable();
    return NextResponse.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Airtable sync run failed.", detail: message },
      { status: 500 }
    );
  }
}
