/**
 * View-model contracts for every screen, extracted 1:1 from the prototype's
 * dataFor() (SignalRoom.dc.html). These shapes are what the UI expects; the
 * production build replaces the two mock datasets with Supabase queries that
 * return the same shapes — see docs/BACKEND.md for the table-by-table mapping.
 */

export type MediaType = "news" | "social";
export type Severity = "info" | "watch" | "urgent";
export type KeywordKind = "candidate" | "opponent" | "issue" | "misspelling";
export type PoliticalRules = "yes" | "no" | "check";
export type JoinStatus = "none" | "requested" | "joined" | "rejected";
export type ChipToneKey = "pos" | "neg" | "warn" | "neutral";

export interface Kpi {
  label: string;
  value: string;
  delta: string;
  /** CSS color var for the delta line. */
  tone: string;
  /** 0–5; >0 heat-tints the whole card (S1 "Active urgent alerts"). */
  heat: number;
}

export interface Story {
  label: string;
  vel: string;
  /** Heat level 0–5 for the velocity square. */
  h: number;
  mentions: string;
  mix: string;
  sentV: number;
  coordinated?: boolean;
}

export interface ClusterListItem extends Story {
  status: "open" | "fading" | "closed";
}

export interface FeaturedCluster {
  label: string;
  vel: string;
  velBg: string;
  border: string;
  status: string;
  coordinated: boolean;
  sentV: number;
  meta: string;
  summary: string;
  path: string;
  /** Velocity sparkline values (mentions/hr) with dashed baseline. */
  spark: number[];
  sparkBaseline: number;
  sparkColor: string;
  mediaMixPct: number;
  mixLabel: string;
  mentionsLabel: string;
}

export interface Mention {
  id: number;
  pf: string;
  media: MediaType;
  segs: string[];
  title: string;
  body: string;
  meta: string;
  time: string;
  sentV: number;
  // Permalink to the original post/article, when the source exposes one.
  // Fixtures omit it; live rows carry it so the feed can link out.
  url?: string | null;
}

export interface FeedTab {
  id: string;
  label: string;
  count: string;
}

export interface Segment {
  id: string;
  label: string;
}

export interface Keyword {
  id: string;
  term: string;
  kind: KeywordKind;
  matches: string;
}

export interface PodcastShow {
  name: string;
  meta: string;
}

export interface Journalist {
  name: string;
  outlet: string;
  count: string;
  sentV: number;
  last: string;
}

export interface OppoAd {
  pf: string;
  advertiser: string;
  creative: string;
  spend: string;
  impressions: string;
  regions: string;
  dates: string;
  active: "active" | "ended";
}

export interface Recipient {
  email: string;
  gets: string;
}

export interface MomentumStat {
  k: string;
  v: string;
  d: string;
  /** CSS color var for the delta. */
  dc: string;
}

export interface MustItem {
  issue: string;
  why: string;
  line: string;
}

export interface Brief {
  date: string;
  metaLine: string;
  title: string;
  sent: string;
  overnight: string;
  overnightEm: string;
  media: string;
  social: string;
  diverge: string;
  momentum: MomentumStat[];
  musts: MustItem[];
  watchlist: string;
}

export interface ChatMsg {
  q: string;
  a: string;
}

/* ---------- S11 Organic Reach ---------- */

export interface ReachGroup {
  id: string;
  pf: string;
  name: string;
  members: string;
  category: string;
  region: string;
  rel: number;
  pol: PoliticalRules;
  status: JoinStatus;
  cadence: string;
  last?: string;
  isNew?: boolean;
}

export interface ReachData {
  target: number;
  base: number;
  geo: string;
  issues: string[];
  query: string;
  lastRun: string;
  publicSent: string;
  chatter: Record<string, { vol: number; sent: number }>;
  chatterInsight: string;
  notable: { group: string; quote: string; time: string; sentV: number }[];
  newGroups: ReachGroup[];
  groups: ReachGroup[];
}

/* ---------- S12 Narrative ---------- */

export interface NarrativeDriver {
  rank: string;
  name: string;
  type: "coordinated" | "press" | "paid" | "organic" | "groups";
  share: number;
  note: string;
}

export interface NarrativeGridSeed {
  theme: string;
  share: string;
  chip: string;
  tone: ChipToneKey;
}

export interface NarrativeAction {
  theme: string;
  action: string;
  status: string;
  statusTone: "accent" | "warn";
  go: string;
  goLabel: string;
}

export interface NarrativeData {
  meta: string;
  control: {
    ours: number;
    contested: number;
    theirs: number;
    delta: string;
    deltaTone: string;
  };
  controlRead: string;
  drivers: NarrativeDriver[];
  grid: {
    usUs: NarrativeGridSeed[];
    usThem: NarrativeGridSeed[];
    themUs: NarrativeGridSeed[];
    themThem: NarrativeGridSeed[];
  };
  actions: NarrativeAction[];
}

/* ---------- Campaign dataset ---------- */

export interface CampaignData {
  name: string;
  code: string;
  tz: string;
  alertBadge: string | null;
  respondBadge: string | null;
  kpis: Kpi[];
  /** 30-day volume series (15 points, Jun 2 → Jul 2). */
  chartUs: number[];
  chartThem: number[];
  mediaCount: number;
  socialCount: number;
  mediaPct: number;
  splitNote: string;
  sovUs: number;
  hours: number[];
  stories: Story[];
  otherClusters: ClusterListItem[];
  fc: FeaturedCluster;
  chatIntro: ChatMsg;
  mentions: Mention[];
  feedTabs: FeedTab[];
  segs: Segment[];
  keywords: Keyword[];
  podcasts: PodcastShow[];
  pressCorps: Journalist[];
  oppoAds: OppoAd[];
  adsNote: string;
  recipients: Recipient[];
  briefs: Brief[];
  reach: ReachData;
  narrative: NarrativeData;
}
