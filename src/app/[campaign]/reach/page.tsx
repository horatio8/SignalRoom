"use client";

/**
 * S11 Organic Reach — /[campaign]/reach (operator+)
 *
 * Live group management: the operator curates the list of organic groups whose
 * member-visible chatter is worth watching, and drives each group's join
 * lifecycle + monitor flag. Real rows in `organic_groups` through useGroups()
 * (RLS-scoped read, owner/operator writes — 0002_rls.sql).
 *
 * Automated discovery (finding new groups from the open web) needs Firecrawl and
 * is a later phase — see the honest note below. What is real here is the list
 * itself, the join queue (join_status), and the monitored set (monitored) that
 * feeds group chatter into the enrichment pipeline.
 */

import React from "react";
import { useParams } from "next/navigation";
import { useApp } from "@/lib/state";
import {
  useGroups,
  groupChip,
  type AddGroupInput,
  type GroupPlatform,
  type GroupJoinStatus,
  type LiveGroup,
} from "@/lib/data/liveGroups";
import { PlatformChip } from "@/components/app/PlatformChip";
import { EmptyState } from "@/components/app/EmptyState";
import { Switch } from "@/components/ds";
import { cardSurface, displayType, monoMeta, overline, relDots } from "@/lib/ui";

/** Add-form platform options (DB value → sentence-case label). */
const PLATFORMS: { value: GroupPlatform; label: string }[] = [
  { value: "facebook", label: "Facebook" },
  { value: "x", label: "X" },
  { value: "reddit", label: "Reddit" },
  { value: "discord", label: "Discord" },
];

/** join_status → sentence-case label for the per-row control. */
const JOIN_LABELS: Record<GroupJoinStatus, string> = {
  none: "Not joined",
  requested: "Requested",
  joined: "Joined",
  rejected: "Rejected",
  do_not_post: "Do not post",
};

const JOIN_ORDER: GroupJoinStatus[] = [
  "requested",
  "joined",
  "none",
  "rejected",
  "do_not_post",
];

/** Section headings — the design's join queue / monitored set / candidates split. */
const SECTION_LABELS: Record<GroupJoinStatus, string> = {
  requested: "Join queue",
  joined: "Joined",
  none: "Candidates",
  rejected: "Rejected",
  do_not_post: "Do not post",
};

const inputStyle: React.CSSProperties = {
  height: 30,
  padding: "0 10px",
  borderRadius: 8,
  background: "var(--surface-panel)",
  border: "1px solid var(--border-default)",
  fontFamily: "var(--font-ui)",
  fontSize: 12.5,
  color: "var(--text-primary)",
  outline: "none",
  minWidth: 0,
};

const selectStyle: React.CSSProperties = {
  height: 28,
  padding: "0 8px",
  borderRadius: 8,
  background: "var(--surface-raised)",
  border: "1px solid var(--border-default)",
  fontFamily: "var(--font-ui)",
  fontSize: 11.5,
  color: "var(--text-primary)",
  outline: "none",
  flex: "none",
};

export default function ReachPage() {
  const { campaign } = useParams<{ campaign: string }>();
  const { notify } = useApp();
  const gm = useGroups(campaign);

  const [platform, setPlatform] = React.useState<GroupPlatform>("facebook");
  const [name, setName] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [members, setMembers] = React.useState("");

  const addGroupLive = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const input: AddGroupInput = { platform, name: trimmed, url, members };
    const err = await gm.addGroup(input);
    if (err) return notify(err);
    notify("Group added");
    setName("");
    setUrl("");
    setMembers("");
  };

  const toggleMonitor = async (row: LiveGroup) => {
    const err = await gm.setMonitored(row.id, !row.monitored);
    if (err) return notify(err);
    notify(row.monitored ? "Monitoring paused" : "Monitoring on — chatter enters enrichment");
  };

  const changeJoin = async (row: LiveGroup, status: GroupJoinStatus) => {
    if (status === row.join_status) return;
    const err = await gm.setJoinStatus(row.id, status);
    if (err) return notify(err);
    notify(`Join status → ${JOIN_LABELS[status].toLowerCase()}`);
  };

  const removeGroupLive = async (row: LiveGroup) => {
    const err = await gm.removeGroup(row.id);
    if (err) return notify(err);
    notify("Group removed");
  };

  const monitoredCount = gm.groups.filter((g) => g.monitored).length;
  const joinedCount = gm.groups.filter((g) => g.join_status === "joined").length;
  const queueCount = gm.groups.filter((g) => g.join_status === "requested").length;

  // Non-overlapping partition by join_status → the design's sections.
  const sections = JOIN_ORDER.map((status) => ({
    status,
    rows: gm.groups.filter((g) => g.join_status === status),
  })).filter((s) => s.rows.length > 0);

  return (
    <div data-screen-label="S11 Organic Reach" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ ...displayType, fontSize: 20, fontWeight: 600 }}>Organic reach</span>
        <span style={monoMeta}>{campaign}</span>
        {gm.groups.length > 0 && (
          <span style={{ ...monoMeta, marginLeft: "auto" }}>
            {gm.groups.length} groups · {monitoredCount} monitored · {joinedCount} joined · {queueCount} in queue
          </span>
        )}
      </div>

      {/* Honest scope note — the list + join/monitor state is real; discovery is later. */}
      <div
        style={{
          borderRadius: 14,
          background: "var(--surface-sunken)",
          border: "1px solid var(--border-subtle)",
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <span style={overline}>How this works</span>
        <span style={{ fontSize: 12, lineHeight: 1.6, color: "var(--text-secondary)" }}>
          Manage the organic groups you track, their join lifecycle, and which ones are monitored —
          monitored groups have their member-visible chatter pulled into the enrichment pipeline.
          Automated discovery (finding new groups from the open web) needs Firecrawl and is a later
          phase; for now you add groups by hand.
        </span>
      </div>

      {/* Add group */}
      <div style={{ ...cardSurface, overflow: "hidden" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "14px 16px",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <span style={{ fontSize: 16, fontWeight: 600 }}>Add group</span>
          <span style={{ ...monoMeta, marginLeft: "auto" }}>facebook · x · reddit · discord</span>
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            padding: "12px 16px",
            background: "var(--surface-raised)",
          }}
        >
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value as GroupPlatform)}
            style={{ ...inputStyle, flex: "none", width: 120 }}
          >
            {PLATFORMS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void addGroupLive();
            }}
            placeholder="group name"
            style={{ ...inputStyle, flex: 2, minWidth: 160 }}
          />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void addGroupLive();
            }}
            placeholder="url (optional)"
            style={{ ...inputStyle, flex: 2, minWidth: 160, fontFamily: "var(--font-mono)", fontSize: 12 }}
          />
          <input
            value={members}
            onChange={(e) => setMembers(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void addGroupLive();
            }}
            placeholder="members (e.g. 12.8k)"
            style={{ ...inputStyle, flex: "none", width: 140, fontFamily: "var(--font-mono)", fontSize: 12 }}
          />
          <button
            onClick={() => void addGroupLive()}
            style={{
              height: 30,
              padding: "0 14px",
              borderRadius: 8,
              border: "1px solid var(--border-default)",
              background: "var(--surface-panel)",
              fontFamily: "var(--font-ui)",
              fontSize: 12,
              fontWeight: 500,
              color: "var(--text-primary)",
              cursor: "pointer",
              flex: "none",
            }}
          >
            Add group
          </button>
        </div>
      </div>

      {/* Group list, partitioned by join status */}
      {gm.groups.length === 0 ? (
        <div style={{ ...cardSurface }}>
          <EmptyState
            title="No groups yet"
            note="Add organic groups to monitor member-visible chatter; automated discovery comes later."
          />
        </div>
      ) : (
        sections.map((section) => (
          <div key={section.status} style={{ ...cardSurface, overflow: "hidden" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "12px 16px",
                borderBottom: "1px solid var(--border-subtle)",
              }}
            >
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>{SECTION_LABELS[section.status]}</span>
              <span style={monoMeta}>{section.rows.length}</span>
            </div>
            {section.rows.map((row) => (
              <div
                key={row.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 16px",
                  borderBottom: "1px solid var(--border-subtle)",
                }}
              >
                <PlatformChip pf={groupChip(row.platform)} size={24} style={{ flex: "none" }} />
                <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    {row.url ? (
                      <a
                        href={row.url}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "var(--text-primary)",
                          textDecoration: "none",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {row.name}
                      </a>
                    ) : (
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {row.name}
                      </span>
                    )}
                  </div>
                  <span style={{ ...monoMeta }}>
                    {[
                      row.members ? `${row.members} members` : null,
                      row.category,
                      row.region,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </span>
                </div>

                {/* Relevance as five mono dots (runbook 1–5). */}
                <span
                  title={row.relevance != null ? `relevance ${row.relevance}/5` : "unscored"}
                  style={{
                    flex: "none",
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    letterSpacing: "0.05em",
                    color: "var(--text-tertiary)",
                    width: 56,
                  }}
                >
                  {row.relevance != null ? relDots(row.relevance) : "—"}
                </span>

                {/* Monitor toggle — flips organic_groups.monitored. */}
                <Switch
                  checked={row.monitored}
                  onChange={() => void toggleMonitor(row)}
                  label={<span style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>monitor</span>}
                  style={{ flex: "none" }}
                />

                {/* Join lifecycle — writes organic_groups.join_status. */}
                <select
                  value={row.join_status}
                  onChange={(e) => void changeJoin(row, e.target.value as GroupJoinStatus)}
                  style={selectStyle}
                >
                  {JOIN_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {JOIN_LABELS[s]}
                    </option>
                  ))}
                </select>

                <button
                  onClick={() => void removeGroupLive(row)}
                  style={{
                    flex: "none",
                    border: "none",
                    background: "none",
                    padding: 0,
                    fontFamily: "var(--font-ui)",
                    fontSize: 11,
                    color: "var(--text-tertiary)",
                    textDecoration: "underline",
                    cursor: "pointer",
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}
