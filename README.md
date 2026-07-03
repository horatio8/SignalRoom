# SignalRoom — Election Intelligence Platform

Multi-tenant monitoring and intelligence platform for political campaigns
(US + AU). This is the full implementation of the SignalRoom design handoff:
the "Situation Desk" design system (tokens + 27-component library) and all
screens S1–S12 plus login and message templates, built with Next.js App
Router, TypeScript, and Recharts.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000 → redirects to /voss/overview
```

`npm run build && npm start` for a production build.

**Demo walkthrough:** `docs/DEMO.md` is a click-by-click script covering every
functionality (~10 min) — use it to test the build or demonstrate to clients.

## What's here

| Route | Screen |
|---|---|
| `/[campaign]/overview` | S1 — KPIs, 30d volume chart, media/social split, share of voice, heat strip, top stories, ask-the-monitor |
| `/[campaign]/feed` | S2 — filterable mention feed, keyword segments (M1), hide/suppress + add missed article (M2) |
| `/[campaign]/stories` | S3 — clusters (featured hot-cluster card), opposition ads (F1), press corps (F2) |
| `/[campaign]/briefings` | S4 — archive + the 7 fixed briefing sections, clips toggle + weekly PDF (F3), feedback loop |
| `/[campaign]/alerts` | S5 — history with situation reads + delivery receipts, rule management (§7) |
| `/[campaign]/settings` | S6 — keywords CRUD + push-to-sources, podcasts (F4), source health, delivery (M3/M4), honest limits |
| `/admin` | S7 — cross-campaign ops, cost meters with 80% alarm, golden-set eval (owner only) |
| `/onboarding` | S8 — 5-step wizard incl. backfill (F5); target: live in < 1 hour |
| (role switch → Client) | S9 — client portal: S1–S4 white-labeled, read-only, gated nav |
| `/[campaign]/respond` | S10 — three drafts in distinct registers, approval dialog, publish receipt (§14 hard gate) |
| `/[campaign]/reach` | S11 — organic reach: group discovery, join queue + daily cap, chatter monitoring, share kits |
| `/[campaign]/narrative` | S12 — narrative control meter, editable Leesburg grid (strategy rows persist regeneration), drivers, actions |
| `/[campaign]/templates` | Message-template visual contracts (§13) |
| `/login` | Magic-link login (Supabase Auth in production) |

Two demo campaigns ship with contrasting datasets so the heat semantics read:
**Voss for Senate** (US-AZ, hot/crisis day) and **Marsh for Mayor** (AU-Sydney,
calm day). The top-bar campaign switcher swaps every data surface; the role
switcher (Owner / Operator / Client) previews role gating; ◐ toggles dark
"ops mode".

## Architecture

- `src/styles/tokens/` — the handoff's design tokens, **imported verbatim**
  (single source of truth). Fonts are self-hosted via `next/font`
  (Archivo incl. the wide display cut, IBM Plex Mono, Source Serif 4) —
  the production swap the handoff prescribes for its Google Fonts CDN import.
- `src/components/ds/` — the ported design-system library (Button…MustCallout),
  typed to the handoff's `.d.ts` prop contracts.
- `src/lib/data/` — typed view-model contracts + both mock datasets extracted
  1:1 from the prototype's `dataFor()`. **This is the Supabase swap point.**
- `src/lib/state.tsx` — app state, a faithful port of the prototype's state
  object (campaign-switch reset semantics included); navigation moved to real
  routes per spec §8.
- `public/icons/` — platform brand SVGs bundled locally from Simple Icons
  (CC0) per the handoff's production note; NEWS/POD/RSS/WEB/LI fall back to
  typographic monograms.
- `supabase/` — production schema (spec §3 + F1/F2 + §14 responses + S11
  organic reach + S12 narrative grids), RLS policies, approval-gate trigger,
  and seed. Not applied to any project yet — see `docs/BACKEND.md` for the
  wiring guide.

## Design-system rules enforced throughout

1. No number without its baseline delta.
2. Red = negative sentiment, never "the opponent" (opponent data is always
   neutral gray).
3. Exactly three severities — info | watch | urgent.
4. The heat ramp encodes intensity only; text flips white from heat-3 up.
5. Every data value is IBM Plex Mono; sentence case; uppercase only for
   overlines; no emoji in UI (emoji live only in the email/SMS contracts).

## Status

- All data is the handoff's mock fixtures — the shapes are the production
  view-model contracts (see `docs/BACKEND.md` for the table-by-table swap).
- No Supabase project has been provisioned and nothing is deployed; the
  migrations are ready to apply when a project/org is chosen.
