-- Fix ingest dedupe. The original unique index (0001) was PARTIAL
-- (… where external_id is not null). PostgREST's upsert issues
-- `on conflict (campaign_id, source, external_id)` with no predicate, and
-- Postgres refuses to match a bare ON CONFLICT to a partial index (error
-- 42P10), so every ingest insert failed and no mentions were ever stored.
--
-- A plain (non-partial) unique index on the same columns is matched by that
-- ON CONFLICT. NULL external_ids remain distinct under the default NULLS
-- DISTINCT, so rows without an external_id still never dedupe — identical
-- effective behaviour to the partial index, minus the breakage.
drop index if exists mentions_campaign_id_source_external_id_idx;
create unique index if not exists mentions_campaign_id_source_external_id_idx
  on mentions (campaign_id, source, external_id);
