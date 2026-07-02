/**
 * Data surfaces the prototype renders identically for both campaigns:
 * alert history, default rules, source health, respond drafts, admin ops.
 * (Marked illustrative in the handoff — replaced by real queries in production.)
 */

import type { Severity } from "./types";

export interface AlertHistoryRow {
  sv: Severity;
  headline: string;
  read: string;
  time: string;
  channels: string[];
  stats: string;
  respondable: boolean;
}

export const alertRows: AlertHistoryRow[] = [
  {
    sv: "urgent",
    headline: "Negative spike: town hall clip accelerating",
    read: "Cluster velocity 5.4× baseline, sentiment −38, driven by coordinated-pattern amplification on X and TikTok. Full-video release is the fastest correction; masthead inquiry logged 06:40 raises print risk today.",
    time: "07:40 · 18 min ago",
    channels: ["email", "slack", "sms"],
    stats: "5.4× · −38 · reach 210k",
    respondable: true,
  },
  {
    sv: "urgent",
    headline: "Big-reach hit: Republic water analysis",
    read: "Single mention above P95 reach (tier-1 outlet, 38 syndicated copies). Negative framing on rural allocations; our response quoted in paragraph nine.",
    time: "06:16 · 1 h 42 min",
    channels: ["email", "slack"],
    stats: "P95 reach · −18",
    respondable: true,
  },
  {
    sv: "watch",
    headline: "Opponent surge: Hale volume 3.1× their baseline",
    read: "Two new Meta creatives (water-themed, Maricopa-targeted) plus organic pickup. Spend pace 2.1× week-over-week.",
    time: "Tue 22:50",
    channels: ["email"],
    stats: "3.1× opponent baseline",
    respondable: false,
  },
  {
    sv: "watch",
    headline: "New narrative: “growers react” stitch format",
    read: "New cluster reached 15 mentions in 74 minutes. Sub-1k accounts dominant; one 48k-follower account joined 23:40.",
    time: "Tue 23:44",
    channels: ["email", "slack"],
    stats: "15 mentions / 2h",
    respondable: false,
  },
  {
    sv: "info",
    headline: "Sentiment slide check passed — no day-over-day breach",
    read: "24h average moved −9 vs yesterday, inside the 15-point threshold. No action needed.",
    time: "Tue 20:00",
    channels: ["slack"],
    stats: "−9 d-o-d",
    respondable: false,
  },
];

export interface DefaultRule {
  id: string;
  name: string;
  when: string;
  sv: Severity;
  cooldown: string;
  channels: string;
}

/** The 5 default rules (spec §7) + the S11 group-chatter rule. */
export const defaultRules: DefaultRule[] = [
  { id: "neg", name: "Negative spike", when: "cluster_velocity > 3× baseline AND avg sentiment < −20", sv: "urgent", cooldown: "60 min", channels: "email · slack · sms" },
  { id: "reach", name: "Big-reach hit", when: "single_mention reach > P95 AND sentiment < 0", sv: "urgent", cooldown: "60 min", channels: "email · slack" },
  { id: "oppo", name: "Opponent surge", when: "opponent volume > 3× their baseline", sv: "watch", cooldown: "120 min", channels: "email" },
  { id: "new", name: "New narrative", when: "new cluster ≥ 15 mentions within 2h", sv: "watch", cooldown: "60 min", channels: "email · slack" },
  { id: "slide", name: "Sentiment slide", when: "24h avg sentiment drops > 15 pts day-over-day", sv: "watch", cooldown: "24 h", channels: "email" },
  { id: "grp", name: "Group chatter shift", when: "monitored_groups avg sentiment drops > 12 pts day-over-day OR volume > 3× baseline", sv: "watch", cooldown: "24 h", channels: "email" },
];

export interface SourceHealth {
  name: string;
  status: "healthy" | "degraded" | "down";
  dot: string;
  fg: string;
  meta: string;
}

export const sourceHealth: SourceHealth[] = [
  { name: "kwatch", status: "healthy", dot: "var(--pos)", fg: "var(--pos-text)", meta: "42/hr · 2 min ago" },
  { name: "newsdata", status: "degraded", dot: "var(--warn)", fg: "var(--warn-text)", meta: "84% quota · GNews armed" },
  { name: "apify", status: "healthy", dot: "var(--pos)", fg: "var(--pos-text)", meta: "TT+IG · run 05:00" },
  { name: "bluesky", status: "healthy", dot: "var(--pos)", fg: "var(--pos-text)", meta: "stream up 14 d" },
  { name: "rss", status: "healthy", dot: "var(--pos)", fg: "var(--pos-text)", meta: "6 feeds · 15 min poll" },
  { name: "podcast", status: "healthy", dot: "var(--pos)", fg: "var(--pos-text)", meta: "3 shows · Whisper ok" },
];

/** S10 — three drafts in distinct registers (Phase 4 pipeline). */
export interface ResponseDraft {
  register: string;
  tagColor: string;
  check: string;
  text: string;
}

export const responseDrafts: ResponseDraft[] = [
  {
    register: "Factual rebuttal",
    tagColor: "var(--accent-text)",
    check: "compliance ✓",
    text: "The clip cuts a six-minute answer to 40 seconds. Here’s the full exchange — I said rural water allocations must be guaranteed in statute, and our amendment does exactly that.",
  },
  {
    register: "Values pivot",
    tagColor: "var(--pos-text)",
    check: "compliance ✓",
    text: "Arizonans deserve a straight conversation about water, not doctored clips. I’ll be in Mesa Thursday to answer every question — unedited, as long as it takes.",
  },
  {
    register: "Counter-attack",
    tagColor: "var(--warn-text)",
    check: "compliance ✓",
    text: "My opponent’s allies are pushing a deceptively edited clip because they can’t defend his record: he voted against the only water bill that protects rural growers.",
  },
];

/** S7 Admin — illustrative cross-campaign ops numbers. */
export const adminCampaigns = [
  { name: "Voss for Senate", plan: "fight · US-AZ", status: "active", stBg: "var(--pos-subtle)", stFg: "var(--pos-text)", vol: "1,204", queue: "14", qColor: "var(--text-primary)", dup: "3.2%", dupColor: "var(--text-primary)", spend: "$34", spendPct: "85%", spendColor: "var(--neg)", spendTextColor: "var(--neg-text)" },
  { name: "Marsh for Mayor", plan: "advise · AU-NSW", status: "active", stBg: "var(--pos-subtle)", stFg: "var(--pos-text)", vol: "311", queue: "0", qColor: "var(--text-primary)", dup: "4.1%", dupColor: "var(--text-primary)", spend: "$18", spendPct: "45%", spendColor: "var(--pos)", spendTextColor: "var(--text-secondary)" },
  { name: "Housing Now Coalition", plan: "monitor · US-CA", status: "paused", stBg: "var(--warn-subtle)", stFg: "var(--warn-text)", vol: "—", queue: "—", qColor: "var(--text-tertiary)", dup: "—", dupColor: "var(--text-tertiary)", spend: "$6", spendPct: "15%", spendColor: "var(--pos)", spendTextColor: "var(--text-secondary)" },
];

export const ingestRows = [
  { name: "kwatch", pct: "84%", color: "var(--chart-us)", meta: "42/hr · push" },
  { name: "bluesky", pct: "56%", color: "var(--chart-social)", meta: "28/hr · stream" },
  { name: "newsdata", pct: "24%", color: "var(--chart-media)", meta: "12/hr · poll 15m" },
  { name: "apify", pct: "18%", color: "var(--chart-social)", meta: "9/hr · scheduled" },
  { name: "rss", pct: "12%", color: "var(--chart-media)", meta: "6/hr · poll 15m" },
  { name: "podcast", pct: "4%", color: "var(--chart-media)", meta: "2/hr · transcripts" },
];

/** S8 Onboarding — static wizard content. */
export const onboardingSteps = ["Basics", "Keywords", "Sources", "Delivery", "Backfill"];

export const onboardingPlans = [
  { id: "monitor", name: "Monitor", desc: "Feed, briefings, alerts" },
  { id: "advise", name: "Advise", desc: "+ response drafts, reports" },
  { id: "fight", name: "Fight", desc: "+ publish rails, ads watch" },
];

export const onboardingSources = [
  { id: "kwatch", name: "kwatch", desc: "social webhook · seconds" },
  { id: "newsdata", name: "newsdata", desc: "news poll · 15 min" },
  { id: "apify", name: "apify", desc: "TikTok + Instagram actors" },
  { id: "bluesky", name: "bluesky", desc: "jetstream consumer" },
  { id: "rss", name: "rss", desc: "Google Alerts + F5Bot" },
  { id: "podcast", name: "podcast", desc: "PodcastIndex + Whisper" },
];
