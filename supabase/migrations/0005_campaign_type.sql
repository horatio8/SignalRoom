-- SignalRoom — Campaign type (candidate vs issue campaigns).
-- Adds a discriminator so the platform can serve ISSUE-BASED campaigns (a
-- cause/movement with no candidate, e.g. "Farmers Fightback") alongside the
-- existing candidate campaigns. Additive and backfilled: every existing row
-- defaults to 'candidate', so the two fixture campaigns and any pre-existing
-- DB campaign keep their current behaviour unchanged.
-- Applies after 0001_schema.sql … 0004_auth.sql. See docs/INTEGRATIONS.md
-- (§Issue campaigns) for the end-to-end create-a-campaign runbook.

alter table campaigns
  add column campaign_type text not null default 'candidate'
    check (campaign_type in ('candidate', 'issue'));

comment on column campaigns.campaign_type is
  'Campaign mode. ''candidate'' = a candidate/race campaign (our candidate vs an '
  'opponent). ''issue'' = a cause/movement campaign with no candidate (the cause '
  'vs its opposition). The keywords.kind enum is shared and read generically by '
  'campaign_type: kind ''candidate'' means "our side" (the candidate, or the '
  'cause and its name variants) and kind ''opponent'' means "the opposition"; '
  'kind ''issue'' and ''misspelling'' are unchanged in both modes. Only display '
  'labels and the enrichment rubric vary by type — the stored kinds do not.';
