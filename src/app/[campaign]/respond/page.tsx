"use client";

/**
 * S10 Respond — /[campaign]/respond (operator+, Phase 4)
 * Alert context (heat border) · three drafts in distinct registers ·
 * edit & approve · compliance strip · approval dialog (records approved_by) ·
 * published receipt with organic fan-out + case-study linkback.
 * Hard gate per §14: status='approved' only ever set by a user action.
 */

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { useApp, type CampaignId } from "@/lib/state";
import { responseDrafts } from "@/lib/data";
import { cardSurface, displayType, monoMeta } from "@/lib/ui";

export default function RespondPage() {
  const { campaign } = useParams<{ campaign: CampaignId }>();
  const router = useRouter();
  const { state, set } = useApp();
  const { draftSel, respStatus, approveOpen } = state;

  const statusMap = {
    draft: { label: "status: draft", bg: "var(--surface-raised)", fg: "var(--text-secondary)" },
    published: { label: "status: published", bg: "var(--pos-subtle)", fg: "var(--pos-text)" },
    spiked: { label: "status: spiked", bg: "var(--neg-subtle)", fg: "var(--neg-text)" },
  } as const;
  const st = statusMap[respStatus];
  const published = respStatus === "published";

  return (
    <div data-screen-label="S10 Respond" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ ...displayType, fontSize: 20, fontWeight: 600 }}>Respond</span>
        <span style={monoMeta}>spike → published response &lt; 15 min · human approves every word</span>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 11,
            fontWeight: 500,
            padding: "3px 10px",
            borderRadius: 999,
            background: st.bg,
            color: st.fg,
          }}
        >
          {st.label}
        </span>
      </div>

      {/* Alert context */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          padding: "14px 16px",
          borderRadius: 14,
          background: "var(--surface-panel)",
          border: "1px solid var(--heat-4)",
          boxShadow: "var(--shadow-card-light)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "3px 10px",
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              background: "var(--sev-urgent-subtle)",
              color: "var(--neg-text)",
              flex: "none",
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--sev-urgent)" }} />
            Urgent
          </span>
          <span style={{ fontSize: 13.5, fontWeight: 600 }}>Negative spike: town hall clip accelerating</span>
          <span style={{ ...monoMeta, marginLeft: "auto" }}>alert #a-4821 · cluster #c-1097 · fired 07:40</span>
        </div>
        <span style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>
          Velocity 5.4× baseline, sentiment −38, coordinated-pattern amplification. The edit removes the six-minute
          water answer. Full video is the strongest correction; masthead inquiry logged 06:40.
        </span>
      </div>

      {/* Three drafts */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
        {responseDrafts.map((d, i) => {
          const on = draftSel === i;
          return (
            <button
              key={d.register}
              onClick={() => set({ draftSel: i })}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                padding: 16,
                borderRadius: 14,
                border: `1px solid ${on ? "var(--accent-border)" : "var(--border-subtle)"}`,
                background: on ? "var(--accent-subtle)" : "var(--surface-panel)",
                cursor: "pointer",
                textAlign: "left",
                fontFamily: "var(--font-ui)",
                boxShadow: "var(--shadow-card-light)",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 600,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: d.tagColor,
                  }}
                >
                  {d.register}
                </span>
                <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-tertiary)" }}>
                  {d.check}
                </span>
              </span>
              <span style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--text-primary)" }}>{d.text}</span>
            </button>
          );
        })}
      </div>

      {/* Edit & approve */}
      <div style={{ ...cardSurface, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>Edit &amp; approve</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-tertiary)" }}>
            {responseDrafts[draftSel].register} draft selected
          </span>
        </div>
        <textarea
          key={draftSel}
          rows={4}
          defaultValue={responseDrafts[draftSel].text}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: 12,
            borderRadius: 10,
            background: "var(--surface-raised)",
            border: "1px solid var(--border-default)",
            fontFamily: "var(--font-ui)",
            fontSize: 13,
            lineHeight: 1.6,
            color: "var(--text-primary)",
            outline: "none",
            resize: "vertical",
          }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 12px",
            borderRadius: 10,
            background: "var(--surface-sunken)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-secondary)" }}>
            ✓ US paid-content compliance check passed · AU campaigns auto-append s 321D authorisation · nothing
            publishes without explicit human approval
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
            Publish fan-out: social via Zernio · media statement email · talking-point SMS ·{" "}
            <a
              href={`/${campaign}/reach`}
              onClick={(e) => {
                e.preventDefault();
                router.push(`/${campaign}/reach`);
              }}
              style={{ color: "var(--accent-text)", textDecoration: "underline" }}
            >
              share kit to organic groups
            </a>{" "}
            (top-relevance, political-ok, wording varied + staggered)
          </span>
          <button
            onClick={() => set({ respStatus: "spiked" })}
            style={{
              marginLeft: "auto",
              height: 34,
              padding: "0 14px",
              borderRadius: 10,
              border: "1px solid var(--border-default)",
              background: "var(--surface-raised)",
              fontFamily: "var(--font-ui)",
              fontSize: 12.5,
              fontWeight: 500,
              color: "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            Spike it
          </button>
          <button
            onClick={() => !published && set({ approveOpen: true })}
            style={{
              height: 34,
              padding: "0 18px",
              borderRadius: 10,
              border: "none",
              background: published ? "var(--pos)" : "var(--accent)",
              color: "#fff",
              fontFamily: "var(--font-ui)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {published ? "✓ Published" : "Approve and publish…"}
          </button>
        </div>
      </div>

      {/* Published receipt */}
      {published && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            padding: "14px 16px",
            borderRadius: 14,
            background: "var(--pos-subtle)",
            border: "1px solid var(--pos)",
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--pos-text)" }}>
            Published — 11 min from spike detection
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, lineHeight: 1.8, color: "var(--text-secondary)" }}>
            zernio post #z-8812 · live 07:51 → media statement to 14 outlets · 07:51 → SMS to candidate · delivered 07:52
            <br />
            organic share kit → 6 political-ok groups queued · staggered 08:10–11:40 · wording varied per group
            <br />
            response linked: alert #a-4821 → cluster #c-1097 → 1,038 mentions · watching for sentiment turn
          </span>
        </div>
      )}

      {/* Approval dialog */}
      {approveOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) set({ approveOpen: false });
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") set({ approveOpen: false });
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "var(--scrim)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            style={{
              width: 440,
              maxWidth: "100%",
              background: "var(--surface-overlay)",
              border: "1px solid var(--border-default)",
              borderRadius: 14,
              boxShadow: "var(--shadow-overlay)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                padding: "16px 20px",
                borderBottom: "1px solid var(--border-subtle)",
              }}
            >
              <span style={{ fontSize: 16, fontWeight: 600 }}>Approve and publish</span>
              <button
                onClick={() => set({ approveOpen: false })}
                style={{
                  marginLeft: "auto",
                  border: "none",
                  background: "transparent",
                  color: "var(--text-tertiary)",
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                ✕
              </button>
            </div>
            <div style={{ padding: 20, fontSize: 13, lineHeight: 1.6, color: "var(--text-secondary)" }}>
              This publishes to Zernio, emails the media statement to 14 outlets, and texts talking points to the
              candidate. Your approval is recorded as{" "}
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-primary)" }}>
                approved_by: tk@teller
              </span>
              .
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
                padding: "14px 20px",
                borderTop: "1px solid var(--border-subtle)",
              }}
            >
              <button
                onClick={() => set({ approveOpen: false })}
                style={{
                  height: 32,
                  padding: "0 14px",
                  borderRadius: 10,
                  border: "1px solid var(--border-default)",
                  background: "var(--surface-raised)",
                  fontFamily: "var(--font-ui)",
                  fontSize: 12.5,
                  fontWeight: 500,
                  color: "var(--text-primary)",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => set({ approveOpen: false, respStatus: "published" })}
                style={{
                  height: 32,
                  padding: "0 16px",
                  borderRadius: 10,
                  border: "none",
                  background: "var(--accent)",
                  color: "#fff",
                  fontFamily: "var(--font-ui)",
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Approve and publish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
