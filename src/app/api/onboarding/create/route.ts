/**
 * Onboarding — create a real campaign (S8 Flow A). The wizard collects its
 * choices client-side; this route is the one place they become durable rows.
 *
 * Auth is the security gate: we read the user from the cookie-backed server
 * client and only ever make THAT user the owner of the campaign THEY are
 * creating. The service-role client bypasses RLS to write campaigns /
 * campaign_members / keywords (a normal anon-key user cannot self-insert those
 * under 0002_rls.sql), so it must never run before the user is authenticated
 * and it never accepts a user id from the body.
 */

import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { CAMPAIGN_TIMEZONES } from "@/lib/timezones";

export const dynamic = "force-dynamic";

/** IANA ids the wizard is allowed to store (the timezone <select>'s values). */
const TIMEZONE_VALUES = new Set(
  CAMPAIGN_TIMEZONES.flatMap((g) => g.zones.map((z) => z.value))
);

/** keywords.kind enum (0001_schema.sql) — shared across both campaign types. */
const KEYWORD_KINDS = new Set(["candidate", "opponent", "issue", "misspelling"]);

interface KeywordInput {
  term: string;
  kind: string;
}

interface CreateBody {
  name: string;
  country: "AU" | "US";
  timezone: string;
  campaignType: "candidate" | "issue";
  keywords: KeywordInput[];
}

/** 400-style validation: returns a clean body or a human message, never throws. */
function parseBody(raw: unknown): { body: CreateBody } | { error: string } {
  if (typeof raw !== "object" || raw === null) {
    return { error: "Request body must be a JSON object." };
  }
  const b = raw as Record<string, unknown>;

  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) return { error: "Campaign name is required." };

  if (b.country !== "AU" && b.country !== "US") {
    return { error: "Country must be 'AU' or 'US'." };
  }

  if (typeof b.timezone !== "string" || !TIMEZONE_VALUES.has(b.timezone)) {
    return { error: "Timezone must be a supported IANA zone." };
  }

  if (b.campaignType !== "candidate" && b.campaignType !== "issue") {
    return { error: "Campaign type must be 'candidate' or 'issue'." };
  }

  if (!Array.isArray(b.keywords)) {
    return { error: "Keywords must be an array." };
  }
  const keywords: KeywordInput[] = [];
  for (const k of b.keywords) {
    if (typeof k !== "object" || k === null) {
      return { error: "Each keyword must be an object." };
    }
    const kw = k as Record<string, unknown>;
    const term = typeof kw.term === "string" ? kw.term.trim() : "";
    if (!term) return { error: "Each keyword needs a non-empty term." };
    if (typeof kw.kind !== "string" || !KEYWORD_KINDS.has(kw.kind)) {
      return { error: "Each keyword needs a valid kind." };
    }
    keywords.push({ term, kind: kw.kind });
  }

  return {
    body: { name, country: b.country, timezone: b.timezone, campaignType: b.campaignType, keywords },
  };
}

/** Lowercase, spaces/punctuation → hyphens, collapse repeats, trim edges. */
function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "campaign";
}

/** First free slug: base, then base-2, base-3, … using the service-role read. */
async function uniqueSlug(admin: SupabaseClient, base: string): Promise<string> {
  let candidate = base;
  let n = 1;
  // Bounded by the number of same-named campaigns; each miss appends the next
  // suffix. maybeSingle() returns null (no row) when the slug is free.
  for (;;) {
    const { data, error } = await admin
      .from("campaigns")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return candidate;
    n += 1;
    candidate = `${base}-${n}`;
  }
}

/** Best-effort teardown of a half-created campaign (children first, then row). */
async function cleanup(admin: SupabaseClient, campaignId: string): Promise<void> {
  await admin.from("keywords").delete().eq("campaign_id", campaignId);
  await admin.from("campaign_members").delete().eq("campaign_id", campaignId);
  await admin.from("campaigns").delete().eq("id", campaignId);
}

export async function POST(request: NextRequest) {
  // ---- Auth: only a signed-in user can create a campaign (and owns it) ----
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  // ---- Config guard: writes need the service-role client (bypasses RLS) ----
  const admin = supabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: "Supabase service-role client is not configured." },
      { status: 503 }
    );
  }

  // ---- Validate input ----
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = parseBody(raw);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { name, country, timezone, campaignType, keywords } = parsed.body;

  // ---- Create: campaign → owner membership → keywords, all as one campaign ----
  let campaignId: string | null = null;
  try {
    const slug = await uniqueSlug(admin, slugify(name));

    const { data: campaign, error: campaignError } = await admin
      .from("campaigns")
      .insert({ slug, name, country, timezone, campaign_type: campaignType, status: "active" })
      .select("id, slug")
      .single();
    if (campaignError || !campaign) {
      throw new Error(campaignError?.message ?? "Could not create the campaign.");
    }
    campaignId = campaign.id as string;

    // The signed-in user becomes the owner — user id comes from the session,
    // never from the request body.
    const { error: memberError } = await admin
      .from("campaign_members")
      .insert({ user_id: user.id, campaign_id: campaignId, role: "owner" });
    if (memberError) throw new Error(memberError.message);

    if (keywords.length > 0) {
      const rows = keywords.map((k) => ({
        campaign_id: campaignId,
        term: k.term,
        kind: k.kind,
        is_active: true,
      }));
      const { error: keywordError } = await admin.from("keywords").insert(rows);
      if (keywordError) throw new Error(keywordError.message);
    }

    return NextResponse.json({ slug: campaign.slug as string });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Roll back the half-created campaign so a retry starts clean.
    if (campaignId) await cleanup(admin, campaignId).catch(() => {});
    return NextResponse.json(
      { error: "Could not create the campaign.", detail: message },
      { status: 500 }
    );
  }
}
