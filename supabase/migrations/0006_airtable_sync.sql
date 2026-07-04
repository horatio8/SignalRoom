-- SignalRoom — Airtable audit mirror stamp.
-- Adds the idempotency stamp for the Airtable audit sync (src/lib/sync/airtable).
-- Every mention recorded in Supabase is mirrored once to an Airtable table so the
-- operator can audit the full record of what was captured from any platform. The
-- sync fires after a mention reaches a terminal enrichment state (or a 2h safety
-- window elapses) so sentiment/relevance are captured when available and nothing
-- is ever lost. `airtable_synced_at` makes the sync idempotent and self-healing:
-- a row is only picked up while the stamp is null, and stamped once mirrored.
-- Additive; applies after 0005_campaign_type.sql. See docs/INTEGRATIONS.md
-- (§Airtable audit mirror).

alter table mentions add column airtable_synced_at timestamptz;

-- Partial index over the sync worker's scan predicate (unsynced, oldest first).
create index on mentions (captured_at) where airtable_synced_at is null;

comment on column mentions.airtable_synced_at is
  'Audit-mirror stamp. null = not yet mirrored to Airtable; a timestamp = the '
  'moment this mention was written to the Airtable audit table. Set by the '
  'Airtable sync worker (src/lib/sync/airtable) and used to make it idempotent.';
