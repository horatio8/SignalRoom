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

- Haiku: per-mention enrichment (relevance/sentiment/entities, §5) and alert
  situation reads (§7). Sonnet: daily briefings (§6), the three response
  drafts (§14), and the S12 grid regeneration.
- Get a key at [console.anthropic.com](https://console.anthropic.com) →
  `ANTHROPIC_API_KEY`.
- Use the Batch API for enrichment (50% cost cut, §5). Keep per-campaign LLM
  spend ≤ $40/mo (§9) — the admin cost meters exist to watch this.
- Prompts are versioned artifacts: store them under `/prompts` in this repo
  and write `prompt_version` + `model` on every AI output row (§2 principle 4).

## 3. Ingest sources (spec §4)

Each adapter is one Vercel route: `/api/ingest/<source>`, authenticated by a
per-source shared secret header `x-ingest-key` (generate long random strings;
rotate quarterly per §9). All adapters normalize into `mentions` and dedupe
via the unique `(campaign_id, source, external_id)` index + url/content hash.

### KWatch.io — primary social trigger (push, seconds)
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
3. Crons in `vercel.json`: enrichment worker (`*/5`), spike detector (`*/5`),
   newsdata/rss polls (`*/15`), briefing generator (hourly), opponent-ads
   pull (daily), cluster label/close (nightly).

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

---

## Secrets checklist

| Env var | Service | Where used |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase | client |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase | server only |
| `ANTHROPIC_API_KEY` | Anthropic | workers |
| `KWATCH_API_KEY`, `INGEST_KEY_KWATCH` | KWatch | config push / webhook auth |
| `NEWSDATA_API_KEY`, `GNEWS_API_KEY` | news polls | cron |
| `APIFY_TOKEN`, `INGEST_KEY_APIFY` | Apify | actors / webhook auth |
| `INGEST_KEY_BLUESKY`, `INGEST_KEY_RSS`, `INGEST_KEY_MANUAL` | ingest auth | webhooks |
| `PODCASTINDEX_API_KEY`, `PODCASTINDEX_API_SECRET`, `OPENAI_API_KEY` | podcasts (F4) | cron |
| `RESEND_API_KEY` | email | delivery |
| `CELLCAST_API_KEY` | SMS | delivery (urgent only) |
| `ZERNIO_API_TOKEN` | publishing | Phase 4 |
| `META_AD_LIBRARY_TOKEN` | opponent ads (F1) | daily cron |
| `FIRECRAWL_API_KEY` | S11 discovery | job |
| `AIRTABLE_TOKEN`, `AIRTABLE_BASE_ID` | S11 sync (optional) | job |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | billing | Phase 3 |
| `SENTRY_DSN` | observability | optional |

Rotation policy (§9): per-source ingest secrets quarterly; the `/admin`
header shows the reminder. Keep service keys only in Vercel/Supabase env.
