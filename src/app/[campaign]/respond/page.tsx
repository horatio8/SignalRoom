"use client";

/**
 * S10 Respond — /[campaign]/respond (operator+)
 * The live draft → approve pipeline over the `responses` table. Operators draft
 * a response to a spike, and every word is human-approved before it can go out:
 * approval flows through the §14 hard gate (the responses_approval_gate trigger
 * in 0002_rls.sql), which only lets an authenticated user set status='approved'
 * and stamps approved_by = auth.uid() itself.
 *
 * Publishing to external channels (social/email/SMS) is a LATER phase — this
 * screen drafts, human-approves, and stores; it does not fan out. All writes go
 * through the RLS-scoped browser client (owner/operator only); denials surface
 * as toasts via notify().
 */

import React from "react";
import { useParams } from "next/navigation";
import { useApp } from "@/lib/state";
import {
  useResponses,
  type LiveResponse,
  type ResponseStatus,
} from "@/lib/data/liveResponses";
import { EmptyState } from "@/components/app/EmptyState";
import { cardSurface, displayType, monoMeta, overline } from "@/lib/ui";

/** The three registers the schema's `drafts` describes, offered in the composer. */
const REGISTERS = ["factual rebuttal", "values pivot", "counter-attack"] as const;

/** Status pill styling from the shared tokens. */
function statusMeta(s: ResponseStatus): { label: string; bg: string; fg: string } {
  switch (s) {
    case "approved":
      return { label: "approved", bg: "var(--pos-subtle)", fg: "var(--pos-text)" };
    case "published":
      return { label: "published", bg: "var(--accent-subtle)", fg: "var(--accent-text)" };
    case "spiked":
      return { label: "spiked", bg: "var(--neg-subtle)", fg: "var(--neg-text)" };
    default:
      return { label: "draft", bg: "var(--surface-raised)", fg: "var(--text-secondary)" };
  }
}

/** Board columns. Published (a later phase) rides in the Approved column. */
const COLUMNS: { key: "draft" | "approved" | "spiked"; label: string; note: string }[] = [
  { key: "draft", label: "Draft", note: "awaiting approval" },
  { key: "approved", label: "Approved", note: "cleared the §14 gate" },
  { key: "spiked", label: "Spiked", note: "killed, not sent" },
];

function bucket(s: ResponseStatus): "draft" | "approved" | "spiked" {
  if (s === "draft") return "draft";
  if (s === "spiked") return "spiked";
  return "approved"; // approved + (future) published
}

function fmtTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function RespondPage() {
  const { campaign } = useParams<{ campaign: string }>();
  const { notify } = useApp();
  const mgr = useResponses(campaign);

  // Composer state (the "New draft" affordance).
  const [composing, setComposing] = React.useState(false);
  const [text, setText] = React.useState("");
  const [register, setRegister] = React.useState<string>(REGISTERS[0]);
  const [target, setTarget] = React.useState("");
  const [channel, setChannel] = React.useState("");

  const resetComposer = () => {
    setText("");
    setRegister(REGISTERS[0]);
    setTarget("");
    setChannel("");
    setComposing(false);
  };

  const submitDraft = async () => {
    if (!text.trim()) return;
    const err = await mgr.createDraft({ text, register, target, channel });
    if (err) return notify(err);
    notify("Draft saved — pending human approval before it can go out");
    resetComposer();
  };

  const onApprove = async (id: string) => {
    const err = await mgr.approve(id);
    if (err) return notify(err); // RLS/trigger denial surfaces here
    notify("Approved — stamped to your session as the §14 sign-off");
  };

  const onReject = async (id: string) => {
    const err = await mgr.reject(id);
    if (err) return notify(err);
    notify("Draft spiked — it can never go out");
  };

  const onDiscard = async (id: string) => {
    const err = await mgr.discard(id);
    if (err) return notify(err);
    notify("Draft discarded");
  };

  const fieldStyle: React.CSSProperties = {
    height: 32,
    padding: "0 10px",
    borderRadius: 10,
    background: "var(--surface-panel)",
    border: "1px solid var(--border-default)",
    fontFamily: "var(--font-ui)",
    fontSize: 12.5,
    color: "var(--text-primary)",
    outline: "none",
  };

  const btnPrimary: React.CSSProperties = {
    height: 30,
    padding: "0 14px",
    borderRadius: 8,
    border: "none",
    background: "var(--accent)",
    color: "#fff",
    fontFamily: "var(--font-ui)",
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
  };

  const btnGhost: React.CSSProperties = {
    height: 30,
    padding: "0 12px",
    borderRadius: 8,
    border: "1px solid var(--border-default)",
    background: "var(--surface-panel)",
    fontFamily: "var(--font-ui)",
    fontSize: 12,
    fontWeight: 500,
    color: "var(--text-primary)",
    cursor: "pointer",
  };

  return (
    <div data-screen-label="S10 Respond" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ ...displayType, fontSize: 20, fontWeight: 600 }}>Respond</span>
        <span style={monoMeta}>{campaign}</span>
        {mgr.ready && (
          <button
            onClick={() => setComposing((v) => !v)}
            style={{ ...btnPrimary, marginLeft: "auto" }}
          >
            {composing ? "Close" : "New draft"}
          </button>
        )}
      </div>

      {/* Honest note — the §14 gate, and publishing as a later phase. */}
      <div
        style={{
          borderRadius: 14,
          background: "var(--surface-sunken)",
          border: "1px solid var(--border-subtle)",
          padding: "12px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <span style={overline}>Draft → approve · §14 gate</span>
        <span style={{ fontSize: 12, lineHeight: 1.6, color: "var(--text-secondary)" }}>
          This screen drafts and human-approves responses — every word is signed off before it can go
          out. Approval is the audited §14 gate: only an authenticated owner/operator can approve, and
          the sign-off is stamped to their session. Publishing to external channels (social, email,
          SMS) is a later phase — nothing here fans out to a channel yet.
        </span>
      </div>

      {/* Composer */}
      {mgr.ready && composing && (
        <div style={{ ...cardSurface, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 600 }}>New draft</span>
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="The response wording — the exact words that would go out, once approved."
            rows={4}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 10,
              background: "var(--surface-panel)",
              border: "1px solid var(--border-default)",
              fontFamily: "var(--font-ui)",
              fontSize: 13,
              lineHeight: 1.55,
              color: "var(--text-primary)",
              outline: "none",
              resize: "vertical",
            }}
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 160px" }}>
              <span style={overline}>Register</span>
              <select value={register} onChange={(e) => setRegister(e.target.value)} style={fieldStyle}>
                {REGISTERS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 200px" }}>
              <span style={overline}>Target — what it answers</span>
              <input
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="e.g. the water-allocation clip"
                style={fieldStyle}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 200px" }}>
              <span style={overline}>Channel — intended (not sent)</span>
              <input
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                placeholder="e.g. media statement · X thread"
                style={fieldStyle}
              />
            </label>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={() => void submitDraft()} disabled={!text.trim()} style={{ ...btnPrimary, opacity: text.trim() ? 1 : 0.5 }}>
              Save draft
            </button>
            <button onClick={resetComposer} style={btnGhost}>
              Cancel
            </button>
            <span style={{ ...monoMeta, marginLeft: "auto" }}>saved as a draft · never auto-sent</span>
          </div>
        </div>
      )}

      {/* Body */}
      {!mgr.ready ? (
        <div style={{ ...cardSurface }}>
          <EmptyState
            title="Respond runs on live data"
            note="Sign in to a campaign to draft and approve responses. There are no fixtures here — approvals must pass the §14 gate, which needs a real, authenticated session."
          />
        </div>
      ) : mgr.responses.length === 0 ? (
        <div style={{ ...cardSurface }}>
          <EmptyState
            title="No responses yet"
            note="Draft a response to a spike here; every word is human-approved before it can go out."
          />
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 12,
            alignItems: "start",
          }}
        >
          {COLUMNS.map((col) => {
            const items = mgr.responses.filter((r) => bucket(r.status) === col.key);
            return (
              <div key={col.key} style={{ ...cardSurface, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{col.label}</span>
                  <span style={monoMeta}>{items.length}</span>
                  <span style={{ ...monoMeta, marginLeft: "auto" }}>{col.note}</span>
                </div>
                {items.length === 0 ? (
                  <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", padding: "8px 2px" }}>
                    none
                  </span>
                ) : (
                  items.map((r) => (
                    <ResponseCard
                      key={r.id}
                      r={r}
                      onApprove={() => void onApprove(r.id)}
                      onReject={() => void onReject(r.id)}
                      onDiscard={() => void onDiscard(r.id)}
                    />
                  ))
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ResponseCard({
  r,
  onApprove,
  onReject,
  onDiscard,
}: {
  r: LiveResponse;
  onApprove: () => void;
  onReject: () => void;
  onDiscard: () => void;
}) {
  const sm = statusMeta(r.status);
  const isDraft = r.status === "draft";
  const actionBtn: React.CSSProperties = {
    height: 26,
    padding: "0 10px",
    borderRadius: 7,
    fontFamily: "var(--font-ui)",
    fontSize: 11.5,
    fontWeight: 500,
    cursor: "pointer",
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: 12,
        borderRadius: 10,
        background: "var(--surface-raised)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            padding: "2px 8px",
            borderRadius: 6,
            background: sm.bg,
            color: sm.fg,
          }}
        >
          {sm.label}
        </span>
        {r.register && (
          <span style={{ ...overline, color: "var(--text-secondary)" }}>{r.register}</span>
        )}
      </div>

      <span style={{ fontSize: 13, lineHeight: 1.55, color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>
        {r.text || "(no wording)"}
      </span>

      {(r.target || r.channel) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {r.target && (
            <span style={monoMeta}>
              target: <span style={{ color: "var(--text-secondary)" }}>{r.target}</span>
            </span>
          )}
          {r.channel && (
            <span style={monoMeta}>
              channel: <span style={{ color: "var(--text-secondary)" }}>{r.channel}</span>
            </span>
          )}
        </div>
      )}

      {/* Approval provenance — who + when (the §14 audit trail). */}
      {r.approved_by && (
        <span style={monoMeta}>
          approved by {r.approved_by.slice(0, 8)}… · {fmtTime(r.approved_at)}
        </span>
      )}
      {r.published_at && <span style={monoMeta}>published {fmtTime(r.published_at)}</span>}

      {isDraft && (
        <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
          <button
            onClick={onApprove}
            style={{ ...actionBtn, border: "none", background: "var(--accent)", color: "#fff" }}
          >
            Approve
          </button>
          <button
            onClick={onReject}
            style={{
              ...actionBtn,
              border: "1px solid var(--border-default)",
              background: "var(--surface-panel)",
              color: "var(--text-secondary)",
            }}
          >
            Reject
          </button>
          <button
            onClick={onDiscard}
            style={{
              ...actionBtn,
              border: "none",
              background: "none",
              color: "var(--text-tertiary)",
              textDecoration: "underline",
              padding: "0 4px",
            }}
          >
            Discard
          </button>
        </div>
      )}
    </div>
  );
}
