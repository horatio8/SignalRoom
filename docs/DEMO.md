# Demo script — every functionality, in order

A click-by-click pathway to test and demonstrate everything SignalRoom does.
Works identically on the live deployment and locally (`npm run dev`).
Total run time: ~10 minutes. No login or setup required — the app ships with
two contrasting demo campaigns and an in-memory data layer.

**Start at:** `/` (redirects to `/voss/overview`).

**The three global controls (top bar), use them throughout:**
- **Campaign switcher** — Voss for Senate (US-AZ, a crisis day) vs Marsh for
  Mayor (AU-NSW, a calm day). Switching swaps every data surface; the point is
  that the heat semantics visibly change.
- **Role switcher** — Owner / Operator / Client. Client = the white-labeled
  read-only portal (S9); Owner adds the Admin screen.
- **◐** — dark "ops mode". Persists across reloads.

---

## 1 · Overview (S1)

- Four KPI cards, each value with its baseline delta (the "no number without
  a delta" rule). On Voss the **Active urgent alerts** card is heat-tinted
  orange with white text; switch to Marsh and it goes quiet gray — that's the
  heat ramp encoding intensity, never sentiment.
- 30-day volume chart: us = blue accent with an end dot, opponent = neutral
  gray (never red — red is reserved for negative sentiment).
- Media-vs-social split, share-of-voice bar, and the 24-cell hour-by-hour
  heat strip.
- **Top stories**: heat-coded velocity squares; the Voss clip story carries a
  "possibly coordinated" flag (F7). Click any row → Stories.
- **Ask the monitor** (M5, Phase-4 preview): type a question, press Ask — it
  answers from the campaign's current numbers.

## 2 · Narrative (S12)

- **Narrative control meter**: our ground (accent) / contested (amber) /
  their ground (gray), with day-over-day delta and an analyst read. Compare
  Voss (−9 pts, losing ground to the clip) vs Marsh (+3 pts, holding).
- **The message box (Leesburg grid)** — the flagship interaction:
  - Click **✎** on any row, change the text, press Enter → it saves and gains
    a **strategy** badge.
  - Click **+** on a quadrant header → add your own line.
  - Click **⟳ Regenerate from coverage** → two-stage progress runs, auto rows
    refresh, and your strategy rows survive. That persistence is the demo.
  - Note the threat quadrant ("They say about us") is amber; opponent
    quadrants stay neutral gray by system rule.
- **What's driving it**: ranked drivers typed coordinated / press / paid /
  organic / groups with share bars.
- **How we address it**: action queue with statuses; each deep-links to
  Respond, Reach, or Stories (links hidden in Client role).

## 3 · Feed (S2)

- Filter chips (Combined / Media / Social) **compose** with keyword segments
  (M1) — try Social ∧ Group chatter.
- Hover a row → **Hide** (M2 suppress); the row dims to 40% with Restore.
- **+ Add missed article** (M2): paste any URL → a "pending enrichment" row
  appears at the top and a toast confirms.
- Footer states the honest limits: syndication collapsed, 24-month retention.

## 4 · Stories (S3)

- **Clusters** tab: the featured hot-cluster card (heat border, velocity
  square, coordinated flag, origin→spread path, velocity sparkline vs dashed
  baseline, media/social mix). **Draft response →** jumps to Respond.
- **Opposition ads** tab (F1): new-creative alert banner + ad cards with
  spend/impressions/regions. On Marsh, creatives carry the AU s 321D
  authorisation text.
- **Press corps** tab (F2): journalist table with per-byline sentiment.

## 5 · Briefings (S4)

- Archive rail on the left — Voss includes a **16:00 mini-brief** (M4).
- The 7 fixed sections, incl. the accent-washed **divergence** early-warning
  callout and amber **Must address today** callouts (issue → why now →
  suggested line in serif italic).
- Header meta shows model + prompt version; footer 👍/👎 feeds prompt tuning.
- **Clips format** toggle + **↓ Weekly PDF report** (F3, toasts in demo).

## 6 · Alerts (S5) — operator+

- **History**: severity pills (the fixed info/watch/urgent language),
  AI situation reads, delivery-receipt chips (EMAIL/SLACK/SMS),
  **Respond →** on urgents.
- **Rules**: the 5 default rules (§7) + the S11 **Group chatter shift** rule,
  in mono rule grammar, with cooldowns and active switches. **+ Add rule**
  appends a custom row. Note the M3 banner: recipients need no accounts.

## 7 · Respond (S10) — the crisis loop

1. Read the urgent alert context card (heat border, alert/cluster ids).
2. Click between the **three drafts** — Factual rebuttal / Values pivot /
   Counter-attack — each with a compliance check.
3. Edit the text, then **Approve and publish…** → the confirmation dialog
   records `approved_by` (the §14 hard gate: nothing publishes without a
   human).
4. Confirm → status flips to published and the **green receipt** shows the
   Zernio post id, 14-outlet media statement, candidate SMS, the organic
   share-kit queue with staggered times, and the case-study linkback
   (response → alert → cluster → mentions).
5. Try **Spike it** for the other terminal state.

## 8 · Reach (S11) — organic distribution + chatter

- **Groups list**: platform chips, category badges, relevance as 5 mono dots,
  political-rules badges, join-status buttons. Click **Request to join** —
  the daily cap counter ticks (amber at ≥15/20).
- **Chatter monitoring**: toggle the small monitor switch on a joined group;
  the summary strip (monitored count · 24h volume · net chatter sentiment vs
  public) recomputes live. On Voss the insight is the demo line: member
  chatter is milder than the amplified public number → supports the
  coordination read.
- **Run discovery**: 3-stage progress (query matrix → raw results → dedupe),
  then NEW-badged groups load into the list and the target progress bar moves.
- **Share** on a joined political-ok group → "✓ Queued", wording varied,
  staggered.
- **Notable chatter** quotes; **View all group chatter in Feed →** deep-links
  to the Feed pre-filtered to the Group-chatter segment.

## 9 · Settings (S6) — operator+

- **Keywords**: mono boolean terms with kind badges and 24h match counts; add
  one, then **Push to sources** → "✓ Pushed to KWatch + Apify".
- **Podcast shows** (F4), **Source health** grid (note newsdata "degraded ·
  GNews armed"), **Delivery** (briefing hour, second digest, recipients — add
  one, no account needed), and the **honest limits** panel.
- **Client integrations** (BYOK): click **Add key** on any surveying tool,
  paste anything, Enter → the row flips to a green **client key** pill with
  the masked key. Switch campaigns to show keys are per-campaign; Remove
  falls back to the platform key.

## 10 · Client portal (S9)

Switch role to **Client**: the white-label banner appears, the sidebar
collapses to Overview/Narrative/Feed/Stories/Briefings, manage affordances
disappear (no Hide, no add-article, no feedback, no grid editing), and
visiting a gated URL bounces to Overview.

## 11 · Admin (S7) — switch role to Owner

Cross-campaign table with LLM spend meters (red past the 80% tick),
ingest volume by source, ops numbers, the $250 platform cost meter, the
golden-set eval card, and the secrets-rotation reminder in the header.

## 12 · Onboarding (S8)

Sidebar → **+ New campaign**: walk the 5 steps — Basics (plan picker) →
Keywords (auto-suggested misspellings + the boolean preview of what KWatch
receives) → Sources (6 adapter toggles) → Delivery (default rules install
note) → **Backfill** (F5, the 12-months-of-context progress). "Open
dashboard" returns to Overview.

## 13 · Templates + Login

- **Templates**: the §13 message contracts — briefing email with white-label
  header slot, 🔴 urgent email/Slack block, ≤320-char SMS bubble, watch
  digest / weekly PDF notes.
- Sidebar user block → **sign out**: the magic-link login card; Send magic
  link → sent state → "(demo) Open the link →" returns you in.

---

## What to say about the data

Everything on screen is the design handoff's authored fixture data (the two
campaigns are deliberately contrasting so the heat semantics read). The
shapes are the production view-model contracts — `docs/BACKEND.md` maps each
surface to its Supabase query, and `docs/INTEGRATIONS.md` is the go-live
checklist.
