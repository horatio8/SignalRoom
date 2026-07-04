# Integration setup guide

Everything SignalRoom talks to, in the order you should stand it up. Each
section says what the service does in the platform, what to sign up for, what
credential you need, and which env var it lands in. Copy `.env.example` to
`.env.local` (app) and mirror the secrets into Vercel/Supabase env settings —
never commit real keys.

Phase order (from spec §10): **0** Supabase + ingest sources → **1** Anthropic
enrichment + briefings + Resend/Slack alerts → **2** dashboard live on Vercel →
**3** auth/white-label/Stripe/SMS → **4** response rails (Zernio publish).

---

## 1. Supabase (database + auth) — required first

The single Postgres database (RLS multi-tenant), magic-link auth, and storage.

1. Create a project at [supabase.com/dashboard](https://supabase.com/dashboard)
   (org: your existing `horatio8`). Region close to Vercel deployment.
2. Apply the schema:
   ```bash
   npx supabase link --project-ref <project-ref>
   npx supabase db push          # applies supabase/migrations/*.sql in order
   psql "$SUPABASE_DB_URL" -f supabase/seed.sql   # demo campaigns + default rules
   ```
3. Auth → Providers → Email: enable **magic links** (passwordless). Set the
   site URL to your deployment URL so links redirect correctly.
4. Collect from Project Settings → API:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (safe for the browser; RLS enforces access)
   - `SUPABASE_SERVICE_ROLE_KEY` (**server only** — ingest routes and workers
     use it to bypass RLS; never expose to the client)
5. Invite users: insert rows into `campaign_members` (user_id, campaign_id,
   role). Roles: `owner` / `operator` / `client_viewer`. Briefing/alert
   recipients do **not** need accounts (M3) — they're plain addresses in
   `alert_rules.channels`.

## 2. Anthropic API (enrichment, briefings, alerts, responses)

- Enrichment is **built** (`src/lib/enrich/index.ts`): one forced-tool call per
  batch of 10 un-enriched mentions writes back relevance / sentiment / entities
  / topics / narrative theme / message-box quadrant, and assigns clusters. It
  runs on the model in `ENRICH_MODEL` (default `claude-sonnet-5`) and is driven
  by the enrich cron (`/api/cron/enrich`, every 15 min — see §7). Later phases
  add Sonnet for daily briefings (§6), the three response drafts (§14), and the
  S12 grid regeneration.
- Get a key at [console.anthropic.com](https://console.anthropic.com) →
  `ANTHROPIC_API_KEY`.
- Keep per-campaign LLM spend ≤ $40/mo (§9) — the admin cost meters exist to
  watch this. The Batch API (50% cost cut, §5) is a future optimization; the
  current worker uses synchronous calls for freshness.
- Prompts are versioned artifacts: store them under `/prompts` in this repo
  and write `prompt_version` + `model` on every AI output row (§2 principle 4).

## 3. Ingest sources (spec §4)

Two adapter shapes feed `mentions`. The **built** path is ScrapeCreators: a
poll-based runner driven by the ingest cron (no webhook — ScrapeCreators has no
push). The **planned** paths (NewsData, GNews, Apify, Bluesky, RSS, PodcastIndex,
and the optional-legacy KWatch) are each one Vercel route `/api/ingest/<source>`
authenticated by a per-source shared secret header `x-ingest-key` (generate long
random strings; rotate quarterly per §9). Every adapter normalizes into
`mentions` and dedupes via the unique `(campaign_id, source, external_id)` index
+ url/content hash.

### ScrapeCreators — primary keyword search (built; cron poll)

The primary keyword-search source, replacing the previously-planned KWatch as
the default trigger. The runner (`src/lib/ingest/index.ts` +
`scrapecreators.ts`) sweeps every **active campaign × active keyword ×
platform**, one GET per combination, normalizes results into `mentions`, and
upserts with `ignoreDuplicates` so re-polls no-op against the unique index.

**What it is.** [scrapecreators.com](https://scrapecreators.com) — pay-as-you-go
scraping API. Key from [app.scrapecreators.com](https://app.scrapecreators.com),
sent as the `x-api-key` header. **1 credit per request**, credits never expire,
no monthly commitment. Poll-only — there are **no webhooks**, so freshness is a
function of cron cadence, not push. Typical request latency 2–4s. Tiers (July
2026): ~$10/mo Solo (~5k credits), $47/mo Freelance (25k), $497/mo Business
(500k); pay-as-you-go top-ups on any tier.

**Platform coverage.** The runner's default platform set (`INGEST_PLATFORMS`,
default `reddit,youtube,tiktok,threads,instagram`) covers keyword search on:
- **TikTok, YouTube, Reddit** — full keyword search.
- **Threads** — keyword search, but max 10 results per call.
- **Instagram** — reels/hashtag search, backed by a Google index, so freshness
  lags and results are best-effort.

LinkedIn keyword search also exists at ScrapeCreators (Google-indexed) but is
**not yet wired** into the runner.

**What ScrapeCreators cannot do — be blunt about it.** There is **no X/Twitter
keyword search** and **no Facebook keyword post search** anywhere in the API, so
neither is covered. ScrapeCreators *can* still pull a specific X profile's
tweets and specific Facebook pages/groups by id (a watched-accounts pattern —
not yet wired) and search the Facebook Ad Library. It cannot see private/closed
Facebook groups, and no commercial product can — keep that expectation honest.

**Filling the gaps (options, not yet wired).** If X or public Facebook keyword
mentions matter for a campaign, supplement:
- **Syften** (~$35/mo) — X + Reddit + Hacker News + Bluesky keyword mentions
  delivered by webhook. The intended source for X.
- **Apify** actor `scrapeforge/facebook-search-posts` (~$2.59 per 1,000
  results) — public Facebook keyword posts. (`APIFY_TOKEN` already exists for
  the TikTok/Instagram actors below.)

Both would land through the normal `mentions` pipeline once adapters exist.

**Cost math (default cadence).** Ingest runs hourly and each run is capped at
`INGEST_MAX_REQUESTS` (default 60) requests → a hard ceiling of ~43,200
credits/month. A realistic single campaign (5 platforms × 8 keywords = 40
credits/run) lands around **29k credits/month**. That sits just above the
Freelance tier's 25k credits, so one campaign runs on **Freelance ($47)** plus
pay-as-you-go top-ups (credits never expire, so the margin is cheap). The
**Business tier ($497, 500k credits)** comfortably covers ~6 campaigns at the
same hourly cadence.

**Runner behaviour worth knowing.** Keywords are capped at 20 per campaign per
run. A `402` (out of credits) aborts that campaign's remaining calls cleanly; a
single bad platform×keyword is logged, counted, and skipped without killing the
run. The global request cap stops the sweep mid-run and reports `capped: true`.

**Go live end-to-end (runbook).**
1. Sign up at [scrapecreators.com](https://scrapecreators.com); copy your key
   from [app.scrapecreators.com](https://app.scrapecreators.com).
2. Set Vercel env vars (Project → Settings → Environment Variables, server
   scope):
   - `SCRAPECREATORS_API_KEY` — the key from step 1.
   - `CRON_SECRET` — `openssl rand -hex 32`; the cron routes reject anything but
     `Authorization: Bearer <CRON_SECRET>`.
   - `SUPABASE_SERVICE_ROLE_KEY` — the `sb_secret_…` **secret key** from
     Supabase → Settings → API Keys. (The `sb_publishable_…` key is your
     `NEXT_PUBLIC_SUPABASE_ANON_KEY`, not this one.)
   - `ANTHROPIC_API_KEY` — already set for enrichment.
   - Optional tuning: `ENRICH_MODEL`, `INGEST_PLATFORMS`, `INGEST_MAX_REQUESTS`.
3. Redeploy so the new env is live.
4. Add active keywords for the campaign. The primary path is now in the app:
   sign in as an owner or operator, open **Settings → Monitoring** (`/voss/
   settings`) and add each term with its kind (candidate / opponent / issue /
   misspelling). Rows write straight to the `keywords` table under RLS and apply
   at the next hourly sweep — there is no push step. For bulk seeding you can
   still insert directly. Example for the `voss` campaign — a candidate term, an
   opponent term, and two issue terms:
   ```sql
   insert into keywords (campaign_id, term, kind, segment, is_active)
   select c.id, k.term, k.kind, k.segment, true
   from campaigns c
   join (values
     ('Senator Voss',    'candidate', 'candidate'),
     ('Hale',            'opponent',  'opponent'),
     ('border security', 'issue',     'border'),
     ('water rights',    'issue',     'water')
   ) as k(term, kind, segment) on true
   where c.slug = 'voss';
   ```
5. Crons run automatically — ingest hourly (`0 * * * *`), enrich at `:00/:15/
   :30/:45` (`*/15 * * * *`). To trigger once manually:
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" \
     https://signal-room-rho.vercel.app/api/cron/ingest
   curl -H "Authorization: Bearer $CRON_SECRET" \
     https://signal-room-rho.vercel.app/api/cron/enrich
   ```
6. Sign in and open `/voss/feed`. Once `mentions` rows exist, the feed switches
   from fixtures to live rows automatically and shows the "live · N mentions"
   indicator (RLS scopes what each signed-in member sees — see §Backend live
   read path in docs/BACKEND.md).

### Issue campaigns (a cause/movement, no candidate)

SignalRoom supports ISSUE-BASED campaigns (e.g. "Farmers Fightback") alongside
candidate campaigns. They use the same tables; `campaigns.campaign_type` is the
discriminator (`'candidate'` default, or `'issue'`). The keyword `kind` enum is
shared and read **generically** by type: for an issue campaign `kind
'candidate'` means **our side** (the cause and its name variants) and `kind
'opponent'` means **the opposition**; `'issue'` and `'misspelling'` are
unchanged. Only display labels and the enrichment rubric adapt — the stored
kinds do not.

**Apply `supabase/migrations/0005_campaign_type.sql` in the Supabase SQL editor
first** (it adds the `campaign_type` column). Then create one end-to-end. The
`timezone` value is an IANA id — the setup UI offers the full Australian and US
zone lists (`src/lib/timezones.ts`); here we use `Australia/Sydney`:

```sql
-- 1. Create the campaign (campaign_type 'issue' — a cause/movement, no candidate).
insert into campaigns (slug, name, country, timezone, campaign_type)
values ('farmers-fightback', 'Farmers Fightback', 'AU', 'Australia/Sydney', 'issue');

-- 2. Make the signed-in user its owner (replace the email placeholder).
insert into campaign_members (user_id, campaign_id, role)
select u.id, c.id, 'owner'
from auth.users u, campaigns c
where u.email = 'you@example.org'          -- ← the signed-in operator's email
  and c.slug = 'farmers-fightback';

-- 3. Seed keywords. Kinds are generic for an issue campaign:
--    'candidate' = OUR SIDE (the cause + its name variants),
--    'opponent'  = THE OPPOSITION, 'issue' = a tracked issue.
insert into keywords (campaign_id, term, kind, segment, is_active)
select c.id, k.term, k.kind, k.segment, true
from campaigns c
join (values
  ('Farmers Fightback',         'candidate', 'cause'),      -- our side (the cause)
  ('supermarket price gouging', 'opponent',  'opposition'), -- the opposition
  ('farm gate prices',          'issue',     'prices')      -- a tracked issue
) as k(term, kind, segment) on true
where c.slug = 'farmers-fightback';
```

Once those rows exist, sign in as the owner and open `/farmers-fightback/feed`
— the campaign appears in the top-bar switcher (live campaigns are merged in
after the fixtures), the Settings keywords card relabels the kinds ("campaign" /
"opposition"), and enrichment scores mentions with the issue-mode rubric
(`prompt_version` `enrich-v2`).

### KWatch.io — optional legacy social webhook

No longer the primary trigger; kept as an optional supplementary source. If you
still want its push (sub-second) social alerts alongside ScrapeCreators:
1. Sign up at kwatch.io; create **one alert per campaign keyword group**
   (the S6 "Push to sources" button maintains these via their API).
2. Point each alert's webhook at
   `https://<app>/api/ingest/kwatch?campaign_id=<uuid>` with header
   `x-ingest-key: $INGEST_KEY_KWATCH`.
3. Env: `KWATCH_API_KEY` (for config pushes), `INGEST_KEY_KWATCH`.

### NewsData.io — news poll (cron every 15 min)
1. Key from newsdata.io (free tier: 200 credits/day). Env: `NEWSDATA_API_KEY`.
2. Vercel cron `*/15 * * * *` hits `/api/cron/newsdata`; query per campaign
   with keywords + `country=au,us`; persist the `nextPage` cursor and last-seen
   article ids so you don't re-bill credits.

### GNews — fallback only
Key from gnews.io → `GNEWS_API_KEY`. Enable only when NewsData quota
exhausts (the S6 source-health card shows "GNews armed").

### Apify — TikTok + Instagram scrapers (scheduled actors)
1. Account + token at apify.com → `APIFY_TOKEN`.
2. Schedule the TikTok and Instagram scraper actors with hashtags/handles from
   the `keywords` table (S6 push maintains the actor input).
3. Actor run-finish webhook → `/api/ingest/apify?campaign_id=<uuid>` with
   `x-ingest-key: $INGEST_KEY_APIFY`; the adapter fetches the dataset items.
4. Also used as fallback for Meta ad scraping (`facebook-ads-library-scraper`).

### Bluesky Jetstream — streaming consumer
- The one always-on process (everything else is serverless). Deploy a small
  worker on Fly.io/Railway that consumes the Jetstream websocket with a
  keyword filter and POSTs matches to `/api/ingest/bluesky`.
- No API key needed for the public stream. Env on the worker: the app URL +
  `INGEST_KEY_BLUESKY`.
- Fallback if you don't want an always-on box: cron-poll the Bluesky search
  API from Supabase cron.

### RSS — Google Alerts + F5Bot (lowest fidelity; relevance gate cleans up)
1. Create Google Alerts per keyword set → "Deliver to RSS feed"; store feed
   URLs per campaign.
2. F5Bot (Reddit/HN keyword emails): point its emails at an email-to-webhook
   bridge → `/api/ingest/rss`.
3. Cron `*/15` polls the feeds.

### PodcastIndex + Whisper — podcast monitoring (F4)
1. Free API key at podcastindex.org → `PODCASTINDEX_API_KEY` +
   `PODCASTINDEX_API_SECRET`.
2. Track the shows in S6 Settings per campaign; cron pulls new episodes,
   transcribes with Whisper (OpenAI API `OPENAI_API_KEY` at ~$0.006/min, or
   self-hosted), and inserts transcripts as `platform='podcast'` mentions.

## Per-client credentials (bring your own keys)

By default every campaign runs on the platform's own ingest keys (the env vars
above). Clients who prefer to use their own accounts — their own Apify org,
their own NewsData quota, their own Meta Ad Library token — can supply
per-campaign credentials instead.

- **Services that support BYOK** (the SURVEYING/MONITORING tools):
  `scrapecreators`, `kwatch`, `newsdata`, `gnews`, `apify`, `meta_ad_library`,
  `firecrawl`, `podcastindex`. ScrapeCreators is BYOK-capable per campaign like
  the rest — a client can supply their own ScrapeCreators key so its credits
  bill to their account. Delivery/publish tools (Zernio, Resend, Cellcast) stay
  **platform-level** for now — they are our sending identity, not the client's.
- **How resolution works:** the campaign's active row in `campaign_integrations`
  wins; when there is none the adapter falls back to the platform env var. This
  is `resolveCredentials(campaignId, service)` in
  `src/lib/integrations.server.ts` (the client-safe catalog `SURVEY_TOOLS` lives
  in `src/lib/integrations.ts`; the resolver is `server-only` — never import it
  from a client component). The ingest runner already resolves ScrapeCreators
  credentials this way per campaign before each sweep.
- **Where operators enter them:** S6 Settings → **Client integrations** card.
  Owner/operator only; `client_viewer` never sees this card or the rows.
- **Storage / encryption:** credentials land in `campaign_integrations.credentials`
  (jsonb). In production store the secret bytes in **Supabase Vault / pgsodium**
  and keep only a vault reference in the row — the migration comments mark this
  as the integration point. RLS on the table is stricter than the others: both
  read and write are restricted to owner/operator.

## 4. Delivery channels

### Resend — briefing + alert email
1. resend.com → create API key → `RESEND_API_KEY`.
2. Verify your sending domain (DNS records). White-label (Phase 3): verify
   each client's sender domain and store sender name/address per campaign.
3. Templates follow the §13 contracts (see `/[campaign]/templates` for the
   visual spec): briefing subject `☀ {Campaign} briefing — {top story} ({net})`,
   urgent `🔴 URGENT — {headline}`. Always generate the plain-text alternative.

### Slack — alert webhooks
Per campaign/client workspace: create an **Incoming Webhook**
(api.slack.com/apps → Incoming Webhooks) and paste the URL into the rule's
channels in S5 (stored in `alert_rules.channels`). Same severity blocks as
email with the red bar for urgent.

### Cellcast — urgent SMS (Phase 3, AU-friendly)
1. cellcast.com.au account → API key → `CELLCAST_API_KEY`.
2. SMS fires **only** for `urgent` severity, ≤ 320 chars, format per §13.
3. Register sender ID; check spend alerts — SMS is the expensive channel.

## 5. Response rails (Phase 4)

### Zernio — social publishing
1. Zernio account; connect the campaign's social accounts (multi-account:
   record each `account_id` per campaign).
2. API token → `ZERNIO_API_TOKEN`. Publishing uses `posts_publish_now` from
   the approved response; store the returned post id in
   `responses.channel_refs`.
3. Hard gate: the publish call sits behind the `responses` status check —
   the DB trigger refuses `approved` without an authenticated user.

### Meta Ad Library — opponent ads (F1)
1. Requires a Meta developer account **with identity confirmation** for the
   Ad Library API (political ads access) — start this early, verification
   takes days: developers.facebook.com → Ad Library API.
2. Token → `META_AD_LIBRARY_TOKEN`. Daily cron pulls per tracked opponent
   page → `opponent_ads`.
3. Fallback while access is pending: the Apify
   `facebook-ads-library-scraper` actor.

### Google Ads Transparency Center — US races
No official API. Use an Apify/Firecrawl scrape of the transparency center per
advertiser, normalized into `opponent_ads` with `platform='google'`.

## 6. S11 Organic Reach

### Firecrawl — group discovery
1. firecrawl.dev API key → `FIRECRAWL_API_KEY`.
2. The discovery run executes the runbook's query matrix
   (`site:facebook.com/groups -inurl:posts <keyword> <geo>`) via Firecrawl
   search, resolves group ids, dedupes against `organic_groups`, and scores
   relevance 1–5. Wire the S11 "Run discovery" button to this job.

### Airtable — runbook base sync (optional)
If you keep the existing "Organic Reach Finder" Airtable base as the working
surface: personal access token → `AIRTABLE_TOKEN` + `AIRTABLE_BASE_ID`; run a
two-way sync job between the base's `Groups` table and `organic_groups`.
Otherwise point `organic_reach_finder.py` straight at Postgres and skip
Airtable.

**Chatter ingestion caution:** only member-visible content via authentic
staff accounts / compliant scrapers for public groups; respect platform ToS
and the runbook's ground rules (no sock puppets, one strike, vary + stagger).

## 7. Vercel (hosting + crons)

1. `vercel link` → project under the Teller Consulting team; connect the
   GitHub repo for deploy-on-push.
2. Add every env var from `.env.example` in Project → Settings → Environment
   Variables (service keys as **server** env only).
3. Crons registered in `vercel.json` today: **ingest** (`/api/cron/ingest`,
   hourly `0 * * * *`), **enrichment** (`/api/cron/enrich`, every 15 min
   `*/15 * * * *`) and **Airtable mirror** (`/api/cron/sync-airtable`,
   `7,22,37,52 * * * *` — offset from enrich so enrichment tends to land first).
   All require `Authorization: Bearer $CRON_SECRET`. Planned additions as those
   workers land: spike detector, news/RSS polls, briefing generator (hourly),
   opponent-ads pull (daily), cluster label/close (nightly).

## 8. Stripe (Phase 3 billing)

1. Stripe account → products for the three plans (monitor / advise / fight),
   one subscription per campaign.
2. Keys: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`; webhook
   `/api/stripe/webhook` updates `campaigns.plan` and pauses ingestion on
   non-payment after grace.

## 9. Observability

- Vercel logs cover route exceptions; optionally add Sentry
  (`SENTRY_DSN`) for the workers.
- The `/admin` screen expects: ingest counts per source/hour, queue depth
  (`enriched_at is null`), duplicate rate, LLM spend, delivery failures —
  emit these as rows/counters as you build each worker (§9).

## Airtable audit mirror

Mirrors **every** mention recorded in Supabase into an Airtable table so the
operator has a full, auditable record of what was captured — across all
platforms and sources, not just organic reach. It's read-only from Airtable's
point of view: SignalRoom writes rows, and `airtable_synced_at` on `mentions`
makes the sync idempotent (each mention is written exactly once and re-runs
skip already-mirrored rows).

Setup:

1. Apply migration `0006_airtable_sync.sql` first (adds
   `mentions.airtable_synced_at` + its partial index).
2. Create a **personal access token** at
   [airtable.com/create/tokens](https://airtable.com/create/tokens) with scope
   `data.records:write` on the SignalRoom base, and set it as `AIRTABLE_TOKEN`
   in Vercel (and `.env.local`). This token is what enables the mirror — with it
   absent the sync is a clean no-op and `/api/cron/sync-airtable` returns 503.
3. Base and table default to the provided ids (`AIRTABLE_BASE_ID` =
   `appldd3J5iWvlu2dV`, `AIRTABLE_TABLE_ID` = `tbls41mIlyJCyjn2Y`); override
   either via env if you point at a different base/table. The table's fields
   already exist and are written by name with `typecast:true` — you do not need
   to create fields. `AIRTABLE_MAX_RECORDS` (default 200) bounds one run.

When it runs:

- Cron `/api/cron/sync-airtable` on `7,22,37,52 * * * *` (offset from enrich's
  `*/15` so enrichment tends to land first). Requires
  `Authorization: Bearer $CRON_SECRET`.
- Manually: `curl -H "Authorization: Bearer $CRON_SECRET"
  https://<deployment>/api/cron/sync-airtable`.

Sync rule: a mention is mirrored once it reaches a **terminal enrichment state**
(`enriched_at` set OR `enrich_failed = true`) — so sentiment/relevance land with
it — **or** after a **2h safety window** from capture if enrichment is stuck, so
nothing is ever lost. Airtable caps writes at 10 records/request and 5 req/sec
per base, so the worker chunks by 10 and pauses ~220ms between requests; only
successfully written chunks get stamped, so a failed chunk simply retries next
run.

---

## Secrets checklist

| Env var | Service | Where used |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase | client (anon = `sb_publishable_…`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase | server only (the `sb_secret_…` key) |
| `ANTHROPIC_API_KEY` | Anthropic | workers |
| `ENRICH_MODEL` | Anthropic | optional — enrich model override (default `claude-sonnet-5`) |
| `CRON_SECRET` | Vercel Cron | ingest + enrich route auth (`openssl rand -hex 32`) |
| `SCRAPECREATORS_API_KEY` | ScrapeCreators | primary keyword-search ingest |
| `INGEST_PLATFORMS`, `INGEST_MAX_REQUESTS` | ingest runner | optional tuning (defaults `reddit,youtube,tiktok,threads,instagram` / `60`) |
| `KWATCH_API_KEY`, `INGEST_KEY_KWATCH` | KWatch (optional legacy) | config push / webhook auth |
| `NEWSDATA_API_KEY`, `GNEWS_API_KEY` | news polls | cron |
| `APIFY_TOKEN`, `INGEST_KEY_APIFY` | Apify | actors / webhook auth |
| `INGEST_KEY_BLUESKY`, `INGEST_KEY_RSS`, `INGEST_KEY_MANUAL` | ingest auth | webhooks |
| `PODCASTINDEX_API_KEY`, `PODCASTINDEX_API_SECRET`, `OPENAI_API_KEY` | podcasts (F4) | cron |
| `RESEND_API_KEY` | email | delivery |
| `CELLCAST_API_KEY` | SMS | delivery (urgent only) |
| `ZERNIO_API_TOKEN` | publishing | Phase 4 |
| `META_AD_LIBRARY_TOKEN` | opponent ads (F1) | daily cron |
| `FIRECRAWL_API_KEY` | S11 discovery | job |
| `AIRTABLE_TOKEN`, `AIRTABLE_BASE_ID`, `AIRTABLE_TABLE_ID`, `AIRTABLE_MAX_RECORDS` | Airtable audit mirror | cron (`/api/cron/sync-airtable`) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | billing | Phase 3 |
| `SENTRY_DSN` | observability | optional |

Rotation policy (§9): per-source ingest secrets quarterly; the `/admin`
header shows the reminder. Keep service keys only in Vercel/Supabase env.
