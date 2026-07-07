"use client";

/**
 * App-wide client state — a faithful port of the prototype's single state
 * object (SignalRoom.dc.html). Navigation ("screen") moved to Next.js routes;
 * everything else keeps the prototype's shape and reset semantics so every
 * interaction behaves exactly as designed.
 *
 * Production mapping (handoff "State management" table): each field here maps
 * to a Supabase table / route param — see docs/BACKEND.md.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

export type Role = "owner" | "operator" | "client";
/** A campaign slug. Was a fixture union ("voss" | "marsh"); now any live slug. */
export type CampaignId = string;

export interface AddedMention {
  id: number;
  pf: string;
  media: "news" | "social";
  segs: string[];
  title: string;
  body: string;
  meta: string;
  time: string;
  sentV: number;
  url?: string | null;
}

export interface GridRow {
  theme: string;
  share: string;
  chip: string;
  tone: "pos" | "neg" | "warn" | "neutral";
  src: "auto" | "strategy";
}
export type GridQuad = "usUs" | "usThem" | "themUs" | "themThem";
export type GridRows = Record<GridQuad, GridRow[]>;

export interface CustomKeyword {
  id: string;
  term: string;
  kind: "candidate" | "opponent" | "issue" | "misspelling";
  matches: string;
}

export interface CustomRule {
  id: string;
  name: string;
  when: string;
  sv: "info" | "watch" | "urgent";
  cooldown: string;
  channels: string;
}

export interface DiscoveredGroup {
  id: string;
  pf: string;
  name: string;
  members: string;
  category: string;
  region: string;
  rel: number;
  pol: "yes" | "no" | "check";
  status: "none" | "requested" | "joined" | "rejected";
  cadence: string;
  last?: string;
  isNew?: boolean;
}

export interface AppState {
  role: Role;
  dark: boolean;
  campaign: CampaignId;
  feedTab: string;
  seg: string;
  hiddenIds: number[];
  addOpen: boolean;
  storyTab: string;
  clips: boolean;
  vote: "up" | "down" | null;
  alertTab: string;
  rulesOff: string[];
  kwOff: string[];
  pushed: boolean;
  obStep: number;
  obPlan: string;
  obSrcOff: string[];
  draftSel: number;
  respStatus: "draft" | "published" | "spiked";
  approveOpen: boolean;
  loginState: "idle" | "sent";
  reachPf: string;
  reachPol: string;
  joinMap: Record<string, DiscoveredGroup["status"] | undefined>;
  joinsToday: number;
  discovery: "idle" | "running" | "done";
  discoveryStatus: string;
  discoveredGroups: DiscoveredGroup[];
  monitorMap: Record<string, boolean>;
  sharedMap: Record<string, boolean>;
  gridState: Partial<
    Record<CampaignId, { rows: GridRows; stamp?: string }>
  >;
  editKey: string;
  editText: string;
  narrGen: "idle" | "running" | "done";
  narrGenStatus: string;
  kwInput: string;
  urlInput: string;
  askInput: string;
  chat: { q: string; a: string }[];
  customKeywords: CustomKeyword[];
  customRules: CustomRule[];
  addedRecipients: { email: string; gets: string }[];
  addedMentions: AddedMention[];
  briefSel: number;
  rcInput: string;
  toast: string;
  /**
   * Per-campaign bring-your-own API keys for the surveying tools, keyed by
   * campaign then by IntegrationService id. Kept per campaign so switching the
   * campaign switcher surfaces each campaign's own keys (and is deliberately
   * excluded from campaignResetPatch so keys survive the switch).
   * Production: campaign_integrations table (campaign_id, service, encrypted
   * secret), resolved server-side before the platform key — see src/lib/integrations.ts.
   */
  byoKeys: Partial<Record<CampaignId, Partial<Record<string, string>>>>;
}

export const initialState: AppState = {
  role: "operator",
  dark: false,
  // Empty until routing sets it from the URL slug (the [campaign] layout owns it).
  campaign: "",
  feedTab: "all",
  seg: "all",
  hiddenIds: [],
  addOpen: false,
  storyTab: "clusters",
  clips: false,
  vote: null,
  alertTab: "history",
  rulesOff: [],
  kwOff: [],
  pushed: false,
  obStep: 0,
  obPlan: "advise",
  obSrcOff: [],
  draftSel: 0,
  respStatus: "draft",
  approveOpen: false,
  loginState: "idle",
  reachPf: "all",
  reachPol: "all",
  joinMap: {},
  joinsToday: 3,
  discovery: "idle",
  discoveryStatus: "",
  discoveredGroups: [],
  monitorMap: {},
  sharedMap: {},
  gridState: {},
  editKey: "",
  editText: "",
  narrGen: "idle",
  narrGenStatus: "",
  kwInput: "",
  urlInput: "",
  askInput: "",
  chat: [],
  customKeywords: [],
  customRules: [],
  addedRecipients: [],
  addedMentions: [],
  briefSel: 0,
  rcInput: "",
  toast: "",
  byoKeys: {},
};

/** The keys the prototype resets when the campaign switcher changes. */
export const campaignResetPatch: Partial<AppState> = {
  briefSel: 0,
  feedTab: "all",
  seg: "all",
  hiddenIds: [],
  addedMentions: [],
  chat: [],
  storyTab: "clusters",
  alertTab: "history",
  reachPf: "all",
  reachPol: "all",
  joinMap: {},
  discovery: "idle",
  discoveredGroups: [],
};

type Updater = Partial<AppState> | ((s: AppState) => Partial<AppState>);

interface AppContextValue {
  state: AppState;
  set: (patch: Updater) => void;
  notify: (msg: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(initialState);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );

  const set = useCallback((patch: Updater) => {
    setState((s) => ({
      ...s,
      ...(typeof patch === "function" ? patch(s) : patch),
    }));
  }, []);

  const notify = useCallback(
    (msg: string) => {
      clearTimeout(toastTimer.current);
      set({ toast: msg });
      toastTimer.current = setTimeout(() => set({ toast: "" }), 2600);
    },
    [set]
  );

  // Dark "ops mode" — user preference, persisted per user (handoff state table).
  useEffect(() => {
    const stored =
      typeof window !== "undefined" && localStorage.getItem("sr-theme");
    if (stored === "dark") set({ dark: true });
  }, [set]);

  useEffect(() => {
    document.documentElement.dataset.theme = state.dark ? "dark" : "";
    localStorage.setItem("sr-theme", state.dark ? "dark" : "light");
  }, [state.dark]);

  return (
    <AppContext.Provider value={{ state, set, notify }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
