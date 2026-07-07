/**
 * Non-campaign scaffolding for the onboarding wizard (S8). This is static form
 * content — step labels, plan cards, source toggles — not synthetic campaign
 * data, so it survives the move to a live-data-only app. The old illustrative
 * fixtures (alert history, default rules, source health, respond drafts, admin
 * ops) were removed with the mock datasets; the screens that showed them now
 * render honest empty states until they are wired to live data.
 */

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
