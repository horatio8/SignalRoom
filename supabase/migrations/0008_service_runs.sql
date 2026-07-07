-- Operational usage/cost metrics. Every cron job (ingest, enrich, Airtable
-- sync) writes one row here at the end of its run so the UI can show real
-- service usage — requests made per source, rows processed, credits remaining
-- (where a vendor reports them), Anthropic token spend, and errors — instead of
-- the operator having to read Vercel logs and each vendor dashboard.
--
-- Rows are written by the service-role client (cron routes), which bypasses
-- RLS. Reads are open to any authenticated staff user; the data is operational
-- metadata, not campaign content, so it is not campaign-scoped.
create table service_runs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('ingest', 'enrich', 'sync_airtable')),
  created_at timestamptz not null default now(),
  requests int not null default 0,   -- API requests made (ingest) / model batches (enrich) / Airtable chunks (sync)
  processed int not null default 0,  -- rows inserted (ingest) / enriched (enrich) / synced (sync)
  errors int not null default 0,
  tokens int,                        -- Anthropic tokens used (enrich only; null otherwise)
  -- Full run summary: per-source request counts, latest credits_remaining per
  -- source, error messages, and any kind-specific fields.
  detail jsonb not null default '{}'
);
create index on service_runs (kind, created_at desc);
create index on service_runs (created_at desc);

alter table service_runs enable row level security;
-- Any signed-in staff user may read operational metrics.
create policy service_runs_select on service_runs
  for select using (auth.uid() is not null);
-- No insert/update/delete policy: writes happen only via the service-role
-- client in the cron routes, which bypasses RLS.
