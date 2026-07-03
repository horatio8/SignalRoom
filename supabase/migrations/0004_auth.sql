-- SignalRoom — Auth support (spec §8).
-- Adds a `profiles` mirror of auth.users (email/name for display) and a helper
-- `current_app_role()` that resolves the session's app role from the existing
-- `campaign_members` source of truth. Applies after 0001–0003. Follows the
-- 0002_rls.sql style (security-definer helpers, per-user policies).
--
-- NOTE: OAuth (Google/GitHub/Azure) and SAML/OIDC SSO are configured in the
-- Supabase DASHBOARD (Auth → Providers / Auth → SSO), NOT in SQL. This file
-- only covers the app-side profile mirror + role derivation. See docs/AUTH.md.

-- ============ profiles: a per-user display mirror of auth.users ============
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text,
  created_at timestamptz default now()
);

-- Populate a profile row whenever a new auth user is created. Name comes from
-- the sign-up metadata (`name` or `full_name`) when present.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'name',
      new.raw_user_meta_data ->> 'full_name'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============ current_app_role(): app role for the current session ============
-- Roles in campaign_members are 'owner' | 'operator' | 'client_viewer'. This
-- returns the HIGHEST role the session user holds across all their campaigns
-- (owner > operator > client_viewer). The app maps 'client_viewer' → 'client'.
--
-- Bootstrap: a freshly-created first user with no membership yet defaults to
-- 'operator' so they aren't locked out before their first campaign_members row
-- is inserted (invites carry the real role thereafter).
create or replace function current_app_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (
      select role
      from campaign_members
      where user_id = auth.uid()
      order by case role
        when 'owner' then 3
        when 'operator' then 2
        when 'client_viewer' then 1
        else 0
      end desc
      limit 1
    ),
    'operator'
  )
$$;

-- ============ RLS: a user reads only their own profile ============
alter table profiles enable row level security;

create policy profiles_select_own on profiles for select
  using (id = auth.uid());

create policy profiles_update_own on profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());
