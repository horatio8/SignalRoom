-- RLS: enabled on all domain tables (spec §3).
-- Policy pattern: campaign_id in (select campaign_id from campaign_members
-- where user_id = auth.uid()). Service-role key (workers, ingest) bypasses RLS.

create or replace function member_campaigns()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select campaign_id from campaign_members where user_id = auth.uid()
$$;

-- campaigns: members read their own; owners manage
alter table campaigns enable row level security;
create policy campaigns_select on campaigns for select
  using (id in (select member_campaigns()));
create policy campaigns_update on campaigns for update
  using (id in (select campaign_id from campaign_members
                where user_id = auth.uid() and role in ('owner','operator')));

-- campaign_members: users see their own memberships
alter table campaign_members enable row level security;
create policy members_select on campaign_members for select
  using (user_id = auth.uid());

-- Helper macro applied to every campaign-scoped table:
--   select: any member
--   write:  owner/operator only (client_viewer is read-only, and the app
--           additionally filters low-relevance noise for clients)
do $$
declare
  t text;
begin
  foreach t in array array[
    'keywords','mentions','clusters','briefings','alert_rules','alerts',
    'opponent_ads','journalists','responses','organic_groups','share_kits',
    'narrative_grids'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I_select on %I for select using (campaign_id in (select member_campaigns()))',
      t, t);
    execute format(
      'create policy %I_write on %I for all using (campaign_id in
         (select campaign_id from campaign_members
          where user_id = auth.uid() and role in (''owner'',''operator'')))
       with check (campaign_id in
         (select campaign_id from campaign_members
          where user_id = auth.uid() and role in (''owner'',''operator'')))',
      t, t);
  end loop;
end $$;

-- briefing_feedback: keyed by briefing → campaign
alter table briefing_feedback enable row level security;
create policy briefing_feedback_all on briefing_feedback for all
  using (briefing_id in (select id from briefings where campaign_id in (select member_campaigns())))
  with check (briefing_id in (select id from briefings where campaign_id in (select member_campaigns())));

-- §14 hard gate: approval must come from a real user session, never a worker.
create or replace function enforce_response_approval()
returns trigger
language plpgsql
as $$
begin
  if new.status in ('approved','published') and old.status = 'draft' then
    if auth.uid() is null then
      raise exception 'responses.status=approved may only be set by an authenticated user action';
    end if;
    new.approved_by := auth.uid();
    new.approved_at := coalesce(new.approved_at, now());
  end if;
  return new;
end;
$$;

create trigger responses_approval_gate
  before update on responses
  for each row execute function enforce_response_approval();
