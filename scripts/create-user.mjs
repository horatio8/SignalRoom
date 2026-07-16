#!/usr/bin/env node
/**
 * Create the first SignalRoom auth user (spec §8). Uses the Supabase Admin API
 * with the SERVICE ROLE key, so it must run server-side only — never ship this
 * key to the browser.
 *
 * Usage:
 *   node scripts/create-user.mjs you@campaign.org 'Str0ng-Pass'   # email + password
 *   node scripts/create-user.mjs you@campaign.org                 # email; password from $NEW_USER_PASSWORD
 *
 * A password is REQUIRED (arg 2 or $NEW_USER_PASSWORD) — there is no default, so
 * no shared/committed credential can provision a real production account.
 *
 * Requires env (from .env.local / your shell):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   (Project Settings → API → service_role)
 *
 * After creating the user, grant them a role by inserting into campaign_members
 * (user_id, campaign_id, role) — see docs/AUTH.md. current_app_role() then
 * resolves their app role on sign-in.
 */

import { createClient } from "@supabase/supabase-js";

const DEFAULT_EMAIL = "owner@signalroom.app";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceKey) {
  console.error(
    "Refusing to run: SUPABASE_SERVICE_ROLE_KEY is not set.\n" +
      "Set it (Project Settings → API → service_role) and try again."
  );
  process.exit(1);
}
if (!url) {
  console.error("Refusing to run: NEXT_PUBLIC_SUPABASE_URL is not set.");
  process.exit(1);
}

const email = process.argv[2] ?? DEFAULT_EMAIL;
const password = process.argv[3] ?? process.env.NEW_USER_PASSWORD;

if (!password) {
  console.error(
    "Refusing to run: no password given.\n" +
      "Pass one as the second argument or set $NEW_USER_PASSWORD — there is no default."
  );
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});

if (error) {
  console.error(`Failed to create user: ${error.message}`);
  process.exit(1);
}

console.log("Created SignalRoom user:");
console.log(`  id:       ${data.user?.id}`);
console.log(`  email:    ${email}`);
console.log(`  password: ${password}`);
console.log(
  "\nNext: grant a role by inserting into campaign_members " +
    "(user_id, campaign_id, role in owner|operator|client_viewer)."
);
