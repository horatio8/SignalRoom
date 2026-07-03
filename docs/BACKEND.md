# Backend wiring guide

The app currently runs on an in-repo mock data layer that implements the
prototype's `dataFor()` view-model contracts exactly. This document maps every
mock surface to its production source of truth so the Supabase swap is a
data-layer change, not a UI rewrite.

## The swap point

All screen data flows through `src/lib/data/index.ts` (`dataFor(campaign)`),
and all interactive state through `src/lib/state.tsx`. To go live:

1. Create a Supabase project and apply `supabase/migrations/*.sql`
   (`0001_schema.sql`, then `0002_rls.sql`), then `supabase/seed.sql`.
2. Add env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   (client), `SUPABASE_SERVICE_ROLE_KEY` (ingest routes / workers only).
3. Replace `dataFor()` with RLS-scoped queries returning the same shapes in
   `src/lib/data/types.ts` (they are the UI's expected view models).
4. Replace the demo role switcher with Supabase Auth magic link; role comes
   from `campaign_members.role` per session.

## State → production mapping (from the design handoff)

| Prototype state (src/lib/state.tsx) | Production source of truth |
|---|---|
| `campaign` switch + `dataFor()` mock | route param `/[campaign]/…`, RLS-scoped queries (§3) |
| `role` switcher | `campaign_members.role` via Supabase Auth session |
| `hiddenIds` / `addedMentions` | `mentions.is_hidden` soft flag + `POST /api/ingest/manual` (M2) |
| `customKeywords` + push | `keywords` CRUD + KWatch/Apify config push (§4, S6) |
| `customRules` / `rulesOff` | `alert_rules` CRUD (§7 rule grammar jsonb) |
| `briefSel` archive | `briefings` by `briefing_date` (+ `kind='mini'` for M4) |
| `respStatus`, `draftSel` | `responses` + §14 pipeline (drafts jsonb, `approved_by` set by trigger from `auth.uid()`) |
| `chat` (canned answers) | M5 agent: SQL over `mentions` + Claude API |
| `joinMap`, `discoveredGroups`, `joinsToday` | `organic_groups` join-status updates + discovery runs (S11); daily cap enforced per posting profile |
| `monitorMap`, `sharedMap` | `organic_groups.monitored` flag + `share_kits` queue rows (S11) |
| S12 grid/drivers/actions | SQL aggregates over theme-classified mentions + `campaigns.message_platform`; `narrative_grids` versioned rows (auto vs strategy source) |
| `dark` toggle | user preference (already persisted per user via localStorage; move to profile if desired) |
| `vote` (briefing feedback) | `briefing_feedback` (§6 quality loop) |
| `byoKeys` (Settings client-integrations card) | `campaign_integrations` + `resolveCredentials()` fallback (campaign key wins, platform env is fallback) |

## Screen → query mapping

- **S1 Overview** — aggregates over `mentions`/`clusters`; baselines computed
  in SQL (§6 input assembly). Heat strip = per-hour counts mapped to the
  `--heat-0..5` ramp. Ask-the-monitor = SQL over mentions + Claude (M5).
- **S2 Feed** — `mentions where relevance >= 30 and duplicate_of is null and
  not is_hidden` (clients additionally never see low-relevance noise),
  infinite scroll; segments come from `keywords.segment` (M1); manual add =
  `POST /api/ingest/manual` → `is_manual`, normal enrichment.
- **S3 Stories** — `clusters` (featured = max velocity; `is_coordinated` from
  F7 heuristics); Opposition ads = `opponent_ads` (Meta Ad Library + Google
  Transparency daily pulls); Press corps = `journalists` grown from bylines.
- **S4 Briefings** — `briefings` by date; feedback → `briefing_feedback`;
  weekly PDF + clips format render from the same `stats` jsonb (F3).
- **S5 Alerts** — `alerts` history (delivery receipts in `delivered`), rules =
  `alert_rules`; M3 recipients are plain addresses inside `channels`.
- **S6 Settings** — `keywords` CRUD; "Push to sources" calls KWatch/Apify
  config APIs; source health from ingest counters (§9 observability);
  recipients + briefing hours on `campaigns` / `alert_rules`; per-client BYOK
  keys on `campaign_integrations` (resolved via `resolveCredentials()`,
  owner/operator only).
- **S7 Admin** — cross-campaign counters: ingest per source/hour, queue depth
  (`enriched_at is null`), duplicate rate, LLM spend meters, golden-set eval
  (§9). Owner-only route.
- **S8 Onboarding** — inserts `campaigns` + `keywords`, pushes source configs,
  installs the default rule set (see `supabase/seed.sql`), then starts the F5
  backfill job (12 months of news context; progress = archived-article count).
- **S10 Respond** — `responses` pipeline (§14). The `responses_approval_gate`
  trigger enforces the hard gate: `status='approved'` only via a user session.
  Publish fan-out: Zernio post + media statement email + candidate SMS +
  `share_kits` rows (staggered, wording varied).
- **S11 Reach** — `organic_groups` (Airtable ↔ Postgres mirror of the Organic
  Reach Finder base, or move the base into Postgres and point
  `organic_reach_finder.py` here). Discovery = the runbook's script/Claude flow
  triggered from the UI. Chatter ingestion = a `groups` adapter producing
  normal `mentions` rows (`raw.group_id` set) — member-visible content only,
  via authentic staff accounts / compliant scrapers for public groups;
  respect platform ToS and the runbook's ground rules.
- **S12 Narrative** — needs (1) `campaigns.message_platform` (versioned like
  prompts) and (2) enrichment writing `narrative_theme` +
  `message_box_quadrant` per mention (add to the §5 JSON contract). Control
  meter + grid shares are SQL aggregates; drivers join theme volume against
  coordination flags, outlet tiers, `opponent_ads`, and `organic_groups`.
- **Templates** — build as Resend email templates, not app routes; the
  `/[campaign]/templates` screen is the visual contract (§13).
- **Login** — Supabase Auth magic link (§8); roles travel with invites;
  briefing/alert recipients need no account (M3).

## Out of scope for the UI build (external services)

Ingest adapters (KWatch, NewsData/GNews, Apify, Bluesky Jetstream, RSS,
PodcastIndex+Whisper), the enrichment/clustering/spike-detector workers,
Resend/Cellcast delivery, Zernio publishing, and Stripe billing are backend
services per spec §2–§7 — the schema above is ready for them.
