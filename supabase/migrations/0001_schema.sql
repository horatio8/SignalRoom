-- SignalRoom — Election Intelligence Platform
-- Schema per spec §3 (+ §14 responses, §15 F1/F2 tables, S11 organic reach,
-- S12 narrative grids, §6 briefing feedback).
-- Apply with: supabase db push  (or the Supabase MCP apply_migration tool)

-- ============ Tenancy ============
create table campaigns (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,                     -- route param /[campaign]/…
  name text not null,
  country text not null check (country in ('AU','US')),
  timezone text not null default 'Australia/Sydney',
  status text not null default 'active',        -- active | paused | archived
  briefing_hour int not null default 6,          -- local hour to send briefing
  digest_hours int[] not null default '{}',      -- M4: optional second digest
  plan text not null default 'internal',         -- internal | monitor | advise | fight
  -- white-label (Phase 3)
  logo_url text,
  accent_color text,                             -- overrides --accent per client
  -- S12: versioned message platform document (our pillars + opponent's)
  message_platform jsonb,
  message_platform_version text,
  created_at timestamptz default now()
);

-- ============ Keywords (pushed to sources, matched on ingest; M1 segments) ============
create table keywords (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id),
  term text not null,                             -- may be boolean expr for KWatch
  kind text not null check (kind in ('candidate','opponent','issue','misspelling')),
  entity_name text,                               -- canonical entity this maps to
  segment text,                                   -- M1: named segment reused across feed/rules/reports
  is_active boolean default true,
  created_at timestamptz default now()
);

-- ============ The core fact table ============
create table mentions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id),
  source text not null,        -- kwatch | apify | newsdata | gnews | bluesky | rss | podcast | manual | groups
  platform text not null,      -- reddit | x | youtube | linkedin | facebook | quora | tiktok |
                               -- instagram | bluesky | news | web | podcast
  media_type text not null check (media_type in ('news','social')),
  external_id text,
  url text,
  author text,
  author_followers int,
  title text,
  body text,
  language text,
  country_hint text,
  published_at timestamptz,
  captured_at timestamptz default now(),
  raw jsonb not null,          -- untouched source payload (raw.group_id set for S11 chatter)
  -- dedupe
  url_hash text generated always as (md5(coalesce(url,''))) stored,
  content_hash text,           -- simhash/minhash of normalized text
  duplicate_of uuid references mentions(id),
  syndication_count int default 0,
  -- moderation (M2)
  is_hidden boolean default false,               -- operator suppress (soft flag → precision tuning)
  is_manual boolean default false,               -- added via POST /api/ingest/manual
  -- enrichment (null until worker runs)
  enriched_at timestamptz,
  relevance smallint,          -- 0..100 (< 30 = noise-gated)
  sentiment smallint,          -- -100..100, stance-aware toward our candidate
  entities jsonb,              -- [{name, kind, salience}]
  topics text[],
  reach_score int,
  cluster_id uuid,
  -- S12: theme classification against the message platform
  narrative_theme text,
  message_box_quadrant text check (message_box_quadrant in ('usUs','usThem','themUs','themThem')),
  enrich_failed boolean default false,
  prompt_version text
);
create index on mentions (campaign_id, published_at desc);
create index on mentions (campaign_id, enriched_at) where enriched_at is null;
create unique index on mentions (campaign_id, source, external_id)
  where external_id is not null;
create index on mentions (campaign_id, cluster_id);

-- ============ Clusters ============
create table clusters (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id),
  label text,                  -- AI-written story label
  summary text,
  first_seen timestamptz,
  last_seen timestamptz,
  mention_count int default 0,
  avg_sentiment smallint,
  peak_velocity numeric,       -- mentions/hour at peak
  media_pct smallint,          -- media vs social mix
  origin_path text,            -- "X clip · Tue 22:04 → r/arizona · 22:31 → …"
  is_coordinated boolean default false,  -- F7 heuristics flag
  status text default 'open'   -- open | fading | closed
);

-- ============ Briefings ============
create table briefings (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id),
  briefing_date date not null,
  kind text not null default 'morning',          -- morning | mini (M4 second digest)
  content_md text not null,
  stats jsonb,                 -- volumes, sentiment deltas, top clusters, momentum row
  prompt_version text,
  model text,
  sent_at timestamptz,
  unique (campaign_id, briefing_date, kind)
);

-- §6 quality loop
create table briefing_feedback (
  id uuid primary key default gen_random_uuid(),
  briefing_id uuid not null references briefings(id),
  user_id uuid,
  vote text check (vote in ('up','down')),
  note text,
  created_at timestamptz default now()
);

-- ============ Alerting (§7) ============
create table alert_rules (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id),
  name text,
  rule jsonb not null,         -- §7 rule grammar
  severity text not null check (severity in ('info','watch','urgent')),
  channels jsonb not null,     -- [{type: email|slack|sms|webhook, target}] — M3: plain addresses, no account
  cooldown_minutes int default 60,
  is_active boolean default true
);

create table alerts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id),
  rule_id uuid references alert_rules(id),
  cluster_id uuid references clusters(id),
  severity text check (severity in ('info','watch','urgent')),
  headline text,
  situation_read text,         -- one-paragraph AI read
  stats_line text,             -- "5.4× · −38 · reach 210k"
  fired_at timestamptz default now(),
  delivered jsonb              -- delivery receipts per channel
);

-- ============ Auth mapping (Phase 3) ============
create table campaign_members (
  user_id uuid references auth.users(id),
  campaign_id uuid references campaigns(id),
  role text check (role in ('owner','operator','client_viewer')),
  primary key (user_id, campaign_id)
);

-- ============ F1 · Opponent ad tracking ============
create table opponent_ads (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id),
  platform text not null,             -- meta | google
  advertiser text,
  page_id text,
  creative_text text,
  creative_url text,
  spend_range text,
  impressions_range text,
  regions jsonb,
  demographics jsonb,
  first_seen date,
  last_seen date,
  is_active boolean,
  raw jsonb
);

-- ============ F2 · Journalist intelligence (grown from bylines) ============
create table journalists (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id),
  name text not null,
  outlet text,
  mention_count int default 0,
  avg_sentiment smallint,
  last_wrote_at timestamptz,
  contact jsonb
);

-- ============ §14 · Response rails (Phase 4) ============
create table responses (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id),
  alert_id uuid references alerts(id),
  cluster_id uuid references clusters(id),
  kind text,
  drafts jsonb,                -- three registers: factual rebuttal | values pivot | counter-attack
  chosen text,
  status text not null default 'draft' check (status in ('draft','approved','published','spiked')),
  -- HARD GATE: status='approved' is only ever set by a user action, never a worker.
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  published_at timestamptz,
  channel_refs jsonb           -- zernio post id, media statement recipients, SMS receipts, share-kit queue
);

-- ============ S11 · Organic reach (runbook Airtable ↔ Postgres mirror) ============
create table organic_groups (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id),
  platform text not null,             -- facebook | x | reddit | discord
  name text not null,
  url text,
  members text,                        -- display string ("12.8k")
  category text,                       -- advocacy | industry | noticeboard | trade | politics | regional | identity | lifestyle | interest
  region text,
  relevance smallint check (relevance between 1 and 5),
  privacy text,
  allows_political text check (allows_political in ('yes','no','check')),
  join_status text not null default 'none'
    check (join_status in ('none','requested','joined','rejected','do_not_post')),
  last_posted timestamptz,
  cadence text,
  monitored boolean default false,     -- chatter enters the enrichment pipeline
  source_query text,
  first_seen timestamptz default now()
);
create index on organic_groups (campaign_id, relevance desc);

-- share-kit queue rows (S10 publish fan-out → S11 groups; staggered sends)
create table share_kits (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id),
  response_id uuid references responses(id),
  group_id uuid not null references organic_groups(id),
  wording text,                        -- varied per group
  scheduled_at timestamptz,            -- staggered send time
  posted_at timestamptz,
  status text not null default 'queued' check (status in ('queued','posted','skipped'))
);

-- ============ S12 · Narrative grids (versioned per campaign) ============
create table narrative_grids (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id),
  generated_at timestamptz default now(),
  model text,
  platform_version text,
  -- rows: [{quadrant, theme, share, chip, tone, source: 'auto'|'strategy', author}]
  rows jsonb not null
);
create index on narrative_grids (campaign_id, generated_at desc);
