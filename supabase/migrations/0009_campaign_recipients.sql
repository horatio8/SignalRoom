-- Briefing/alert recipients (M3: plain addresses, no account required). A
-- recipient receives the morning briefing and/or urgent alerts by email; the
-- delivery worker reads this list. Kept separate from campaign_members (who log
-- in) — recipients need no account.
create table campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id),
  email text not null,
  name text,
  gets_briefing boolean not null default true,
  gets_urgent boolean not null default true,
  created_at timestamptz not null default now(),
  unique (campaign_id, email)
);
create index on campaign_recipients (campaign_id);

alter table campaign_recipients enable row level security;
create policy campaign_recipients_select on campaign_recipients
  for select using (campaign_id in (select member_campaigns()));
create policy campaign_recipients_write on campaign_recipients
  for all using (campaign_id in
    (select campaign_id from campaign_members
     where user_id = auth.uid() and role in ('owner','operator')))
  with check (campaign_id in
    (select campaign_id from campaign_members
     where user_id = auth.uid() and role in ('owner','operator')));
