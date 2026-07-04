/**
 * Canonical timezone list for campaign setup. The IANA `value` of the chosen
 * zone is what lands in campaigns.timezone; the `label` is display only. Covers
 * the full Australian IANA set plus the US zones, grouped Australia then USA so
 * a <select> can render them under <optgroup> headings. Pure module (no
 * "use client") so any surface that picks or shows a timezone can import it.
 */

export interface CampaignTimezone {
  value: string; // IANA id, e.g. "Australia/Sydney"
  label: string; // sentence-case, informative
}

export interface CampaignTimezoneGroup {
  region: string;
  zones: CampaignTimezone[];
}

export const CAMPAIGN_TIMEZONES: CampaignTimezoneGroup[] = [
  {
    region: "Australia",
    zones: [
      { value: "Australia/Sydney", label: "Sydney — AEST/AEDT" },
      { value: "Australia/Melbourne", label: "Melbourne — AEST/AEDT" },
      { value: "Australia/Brisbane", label: "Brisbane — AEST (no DST)" },
      { value: "Australia/Adelaide", label: "Adelaide — ACST/ACDT" },
      { value: "Australia/Perth", label: "Perth — AWST (no DST)" },
      { value: "Australia/Hobart", label: "Hobart — AEST/AEDT" },
      { value: "Australia/Darwin", label: "Darwin — ACST (no DST)" },
      { value: "Australia/Broken_Hill", label: "Broken Hill — ACST/ACDT" },
      { value: "Australia/Lord_Howe", label: "Lord Howe Island — LHST/LHDT" },
      { value: "Australia/Eucla", label: "Eucla — ACWST (no DST)" },
      { value: "Australia/Lindeman", label: "Lindeman — AEST (no DST)" },
    ],
  },
  {
    region: "United States",
    zones: [
      { value: "America/New_York", label: "New York — Eastern (ET)" },
      { value: "America/Chicago", label: "Chicago — Central (CT)" },
      { value: "America/Denver", label: "Denver — Mountain (MT)" },
      { value: "America/Phoenix", label: "Phoenix — MST (no DST)" },
      { value: "America/Los_Angeles", label: "Los Angeles — Pacific (PT)" },
      { value: "America/Anchorage", label: "Anchorage — Alaska (AKT)" },
      { value: "America/Adak", label: "Adak — Aleutian (HAST/HADT)" },
      { value: "Pacific/Honolulu", label: "Honolulu — Hawaii (HST)" },
    ],
  },
];

/** Default zone per country code, used when a country choice sets the timezone. */
export const DEFAULT_TIMEZONE_BY_COUNTRY: Record<"AU" | "US", string> = {
  AU: "Australia/Sydney",
  US: "America/New_York",
};
