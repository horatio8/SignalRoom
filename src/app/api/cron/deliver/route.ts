/**
 * Cron entrypoint for the email delivery worker (§7 email channel). Vercel Cron
 * hits this route on a schedule (GET) to email unsent briefings and undelivered
 * urgent alerts. The work lives in `src/lib/delivery` — this handler only does
 * auth, config guards, and JSON shaping. The cron itself is registered in
 * vercel.json by the coordinator, not here.
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}`. When CRON_SECRET is unset we
 * allow the request only outside production, so local `curl` works without a
 * secret while a misconfigured prod deploy fails closed.
 *
 * Delivery is gated on RESEND_API_KEY. When the key is absent this is NOT an
 * error — the run is a no-op and we return 200 with `{ skipped }`, so a deploy
 * that hasn't switched delivery on stays green.
 */

import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { runDelivery } from "@/lib/delivery";

export const maxDuration = 60;
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

  // ---- Run ----
  try {
    const summary = await runDelivery();
    // A missing RESEND_API_KEY is a deliberate "delivery off" state, not a
    // failure — return the skip note as a plain 200.
    return NextResponse.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Delivery run failed.", detail: message },
      { status: 500 }
    );
  }
}
