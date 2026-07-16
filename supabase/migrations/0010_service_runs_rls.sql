-- Tighten service_runs read access. 0008 allowed any authenticated user
-- (auth.uid() is not null) to SELECT — but the rows carry cross-campaign
-- operational metadata (slugs, request/credit counts, token spend, error
-- strings) that a client_viewer must not see. Restrict reads to staff: users
-- who hold an owner/operator membership on at least one campaign.
--
-- Note: service_runs rows are global (a run spans all campaigns), so this does
-- not achieve per-tenant isolation — an operator at a multi-client consultancy
-- still sees aggregate activity across clients. Per-tenant metrics would require
-- restructuring the table to be campaign-scoped; tracked as a follow-up.
drop policy if exists service_runs_select on service_runs;
create policy service_runs_select on service_runs
  for select using (
    exists (
      select 1 from campaign_members
      where user_id = auth.uid() and role in ('owner', 'operator')
    )
  );
