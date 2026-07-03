-- SignalRoom — Per-campaign bring-your-own-credentials (BYOK) for ingest sources.
-- Lets a client supply their own KWatch/NewsData/Apify/etc. keys for a campaign;
-- the platform env var is the fallback when no active row exists (see
-- src/lib/integrations.ts resolveCredentials(), docs/INTEGRATIONS.md §Per-client credentials).
-- Applies after 0001_schema.sql + 0002_rls.sql. Follows the same RLS pattern
-- (member_campaigns()), but SELECT is stricter — see the policy comment below.

-- ============ Campaign integrations (BYOK credential store) ============
-- One active row per (campaign, service). Only the SURVEYING/MONITORING adapters
-- support BYOK; delivery/publish (Zernio, Resend, Cellcast) stay platform-level.
create table campaign_integrations (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id),
  service text not null check (service in (
    'kwatch','newsdata','gnews','apify','meta_ad_library','firecrawl','podcastindex'
  )),
  label text,                                    -- e.g. "Client's own Apify org"
  -- SECURITY: `credentials` holds the adapter's key/value pairs (api_key, token,
  -- secret, …). This jsonb column is the INTEGRATION POINT for at-rest encryption:
  -- in production store secrets in Supabase Vault (pgsodium) and keep only a
  -- vault secret reference here. We deliberately keep the plain jsonb column and
  -- do NOT add a `secret_ref uuid` column yet, because:
  --   1. the app still runs on the mock data layer (no secrets are written yet),
  --   2. Vault wiring (create_secret / decrypted_secrets view) is an ops step
  --      that belongs with the real ingest routes, not this schema stub, and
  --   3. RLS below already blocks client_viewer from ever reading this table,
  --      so the exposure surface is owner/operator + service role only.
  -- When Vault lands: add `secret_ref uuid`, move the secret bytes into
  -- vault.create_secret(), and keep `credentials` for non-secret config only.
  credentials jsonb not null,
  is_active boolean default true,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (campaign_id, service)
);
create index on campaign_integrations (campaign_id, service) where is_active;

-- ============ RLS ============
-- STRICTER than the other campaign-scoped tables. Everywhere else SELECT is open
-- to any member (incl. client_viewer); here BOTH read and write are owner/operator
-- only, because the rows contain live API credentials — a client_viewer must never
-- be able to read another org's (or their own) secret keys. Service-role bypasses
-- RLS for the ingest routes / resolver, as with every other table.
alter table campaign_integrations enable row level security;

create policy campaign_integrations_select on campaign_integrations for select
  using (campaign_id in (select campaign_id from campaign_members
                         where user_id = auth.uid() and role in ('owner','operator')));

create policy campaign_integrations_write on campaign_integrations for all
  using (campaign_id in (select campaign_id from campaign_members
                         where user_id = auth.uid() and role in ('owner','operator')))
  with check (campaign_id in (select campaign_id from campaign_members
                              where user_id = auth.uid() and role in ('owner','operator')));

-- ============ updated_at trigger ============
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger campaign_integrations_set_updated_at
  before update on campaign_integrations
  for each row execute function set_updated_at();
