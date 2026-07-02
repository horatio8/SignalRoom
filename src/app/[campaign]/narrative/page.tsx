"use client";

/**
 * S12 Narrative — /[campaign]/narrative (all roles; action links hidden for clients)
 * Narrative control meter (our ground / contested / their ground — never red) ·
 * the message box (Leesburg grid): generative + editable, strategy rows persist
 * through regeneration · what's driving it · how we address it.
 */

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { useApp, type CampaignId, type GridQuad, type GridRows, type GridRow } from "@/lib/state";
import { dataFor, type ChipToneKey } from "@/lib/data";
import { cardSurface, displayType, monoMeta, overline } from "@/lib/ui";

const CHIP_TONE: Record<ChipToneKey, { bg: string; fg: string }> = {
  pos: { bg: "var(--pos-subtle)", fg: "var(--pos-text)" },
  neg: { bg: "var(--neg-subtle)", fg: "var(--neg-text)" },
  warn: { bg: "var(--warn-subtle)", fg: "var(--warn-text)" },
  neutral: { bg: "var(--surface-raised)", fg: "var(--text-secondary)" },
};

const DRIVER_BADGE: Record<string, { bg: string; fg: string; label: string }> = {
  coordinated: { bg: "var(--warn-subtle)", fg: "var(--warn-text)", label: "coordinated" },
  press: { bg: "var(--accent-subtle)", fg: "var(--accent-text)", label: "press" },
  paid: { bg: "var(--neg-subtle)", fg: "var(--neg-text)", label: "opponent paid" },
  organic: { bg: "var(--pos-subtle)", fg: "var(--pos-text)", label: "organic" },
  groups: { bg: "var(--pos-subtle)", fg: "var(--pos-text)", label: "groups" },
};

const QUADS: GridQuad[] = ["usUs", "usThem", "themUs", "themThem"];

const QUAD_HEADERS: Record<
  GridQuad,
  { title: string; headBg: string; headFg: string; border: string }
> = {
  usUs: { title: "We say about us", headBg: "var(--accent-subtle)", headFg: "var(--accent-text)", border: "var(--accent-border)" },
  usThem: { title: "We say about them", headBg: "var(--surface-raised)", headFg: "var(--text-secondary)", border: "var(--border-subtle)" },
  themUs: {
    title: "They say about us — the threat quadrant",
    headBg: "var(--warn-subtle)",
    headFg: "var(--warn-text)",
    border: "var(--warn)",
  },
  themThem: { title: "They say about themselves", headBg: "var(--surface-raised)", headFg: "var(--text-secondary)", border: "var(--border-subtle)" },
};

export default function NarrativePage() {
  const { campaign } = useParams<{ campaign: CampaignId }>();
  const router = useRouter();
  const { state, set, notify } = useApp();
  const D = dataFor(campaign);
  const N = D.narrative;
  const { role, editKey, editText, narrGen, narrGenStatus, gridState } = state;
  const canEditGrid = role !== "client";

  const baseRows: GridRows = React.useMemo(() => {
    const b = {} as GridRows;
    QUADS.forEach((k) => {
      b[k] = N.grid[k].map((r) => ({ ...r, src: "auto" as const }));
    });
    return b;
  }, [N]);

  const store = gridState[campaign];
  const rows: GridRows = store ? store.rows : baseRows;

  const clone = (): GridRows => {
    const c = {} as GridRows;
    QUADS.forEach((k) => {
      c[k] = rows[k].map((r) => ({ ...r }));
    });
    return c;
  };

  const commit = (c: GridRows, stamp?: string) =>
    set((s) => ({
      gridState: {
        ...s.gridState,
        [campaign]: { rows: c, stamp: stamp || s.gridState[campaign]?.stamp },
      },
    }));

  const saveGridEdit = () => {
    const key = state.editKey;
    if (!key) return;
    const [quad, iS] = key.split(":");
    const i = +iS;
    const c = clone();
    const q = c[quad as GridQuad];
    if (q && q[i]) {
      const t = state.editText.trim();
      if (t) q[i].theme = t;
      q[i].src = "strategy";
    }
    commit(c);
    set({ editKey: "", editText: "" });
    notify("Saved as a strategy row — regeneration preserves it");
  };

  const addTo = (quad: GridQuad) => {
    if (!canEditGrid) return;
    const c = clone();
    c[quad].push({ theme: "New strategy line", share: "—", chip: "manual", tone: "neutral", src: "strategy" });
    commit(c);
    set({ editKey: quad + ":" + (c[quad].length - 1), editText: "New strategy line" });
  };

  const removeRow = (quad: GridQuad, i: number) => {
    const c = clone();
    c[quad].splice(i, 1);
    commit(c);
    if (state.editKey === quad + ":" + i) set({ editKey: "", editText: "" });
    notify("Row removed from the grid");
  };

  const genGrid = () => {
    if (state.narrGen === "running") return;
    set({ narrGen: "running", narrGenStatus: "reading message platform + 24h classified coverage…" });
    setTimeout(() => set({ narrGenStatus: "mapping themes to quadrants · scoring share, velocity, landing state…" }), 900);
    setTimeout(() => {
      const strat = {} as GridRows;
      QUADS.forEach((k) => {
        strat[k] = rows[k].filter((r) => r.src === "strategy").map((r) => ({ ...r }));
      });
      const c = {} as GridRows;
      QUADS.forEach((k) => {
        c[k] = [...baseRows[k].map((r) => ({ ...r })), ...strat[k]];
      });
      commit(c, "regenerated just now · sonnet · platform v3");
      set({ narrGen: "done", narrGenStatus: "" });
      notify("Grid regenerated — auto rows refreshed from coverage, strategy rows preserved");
    }, 1900);
  };

  const gridStamp = store?.stamp ?? "generated 06:04 with the morning briefing";

  const renderQuad = (quad: GridQuad) => {
    const h = QUAD_HEADERS[quad];
    return (
      <div key={quad} style={{ ...cardSurface, border: `1px solid ${h.border}`, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", padding: "8px 14px", background: h.headBg }}>
          <span style={{ ...overline, color: h.headFg }}>{h.title}</span>
          {canEditGrid && (
            <button
              onClick={() => addTo(quad)}
              title="Add strategy row"
              style={{
                marginLeft: "auto",
                width: 20,
                height: 20,
                borderRadius: 6,
                border: "none",
                background: "transparent",
                color: h.headFg,
                fontSize: 13,
                cursor: "pointer",
                lineHeight: 1,
              }}
            >
              +
            </button>
          )}
        </div>
        {rows[quad].map((r: GridRow, i: number) => {
          const key = quad + ":" + i;
          if (editKey === key) {
            return (
              <div
                key={key}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderTop: "1px solid var(--border-subtle)" }}
              >
                <input
                  autoFocus
                  value={editText}
                  onChange={(e) => set({ editText: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveGridEdit();
                    if (e.key === "Escape") set({ editKey: "", editText: "" });
                  }}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    height: 26,
                    padding: "0 8px",
                    borderRadius: 6,
                    border: "1px solid var(--accent)",
                    background: "var(--surface-panel)",
                    fontFamily: "var(--font-ui)",
                    fontSize: 12,
                    color: "var(--text-primary)",
                    outline: "none",
                  }}
                />
                <button
                  onClick={saveGridEdit}
                  style={{
                    flex: "none",
                    height: 26,
                    padding: "0 10px",
                    borderRadius: 6,
                    border: "none",
                    background: "var(--accent)",
                    color: "#fff",
                    fontFamily: "var(--font-ui)",
                    fontSize: 11,
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  Save
                </button>
                <button
                  onClick={() => set({ editKey: "", editText: "" })}
                  style={{
                    flex: "none",
                    height: 26,
                    padding: "0 8px",
                    borderRadius: 6,
                    border: "1px solid var(--border-default)",
                    background: "var(--surface-raised)",
                    color: "var(--text-secondary)",
                    fontFamily: "var(--font-ui)",
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                >
                  ✕
                </button>
              </div>
            );
          }
          const ct = CHIP_TONE[r.tone];
          return (
            <div
              key={key}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderTop: "1px solid var(--border-subtle)" }}
            >
              <span style={{ fontSize: 12.5, fontWeight: 500, flex: 1, minWidth: 0, lineHeight: 1.4 }}>
                {r.theme}{" "}
                {r.src === "strategy" && (
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 600,
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                      padding: "1px 6px",
                      borderRadius: 5,
                      background: "var(--accent-subtle)",
                      color: "var(--accent-text)",
                      verticalAlign: 1,
                    }}
                  >
                    strategy
                  </span>
                )}
              </span>
              <span style={{ flex: "none", fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-tertiary)" }}>
                {r.share}
              </span>
              <span
                style={{
                  flex: "none",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10.5,
                  fontWeight: 500,
                  padding: "1px 7px",
                  borderRadius: 6,
                  background: ct.bg,
                  color: ct.fg,
                }}
              >
                {r.chip}
              </span>
              {canEditGrid && (
                <>
                  <button
                    onClick={() => set({ editKey: key, editText: r.theme })}
                    title="Edit"
                    style={{
                      flex: "none",
                      width: 20,
                      height: 20,
                      border: "none",
                      background: "transparent",
                      color: "var(--text-tertiary)",
                      fontSize: 11,
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => removeRow(quad, i)}
                    title="Remove"
                    style={{
                      flex: "none",
                      width: 20,
                      height: 20,
                      border: "none",
                      background: "transparent",
                      color: "var(--text-tertiary)",
                      fontSize: 11,
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    ✕
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div data-screen-label="S12 Narrative" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <span style={{ ...displayType, fontSize: 20, fontWeight: 600 }}>Narrative</span>
        <span style={monoMeta}>{N.meta}</span>
      </div>

      {/* Narrative control meter */}
      <div style={{ ...cardSurface, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>Narrative control</span>
          <span style={monoMeta}>share of mapped coverage · 24h</span>
          <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 500, color: N.control.deltaTone }}>
            {N.control.delta}
          </span>
        </div>
        <div style={{ display: "flex", height: 14, borderRadius: 999, overflow: "hidden", gap: 2 }}>
          <span style={{ width: `${N.control.ours}%`, background: "var(--chart-us)" }} />
          <span style={{ width: `${N.control.contested}%`, background: "var(--warn)" }} />
          <span style={{ flex: 1, background: "var(--chart-them)" }} />
        </div>
        <div style={{ display: "flex", gap: 20, ...monoMeta }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: "var(--chart-us)" }} />
            our ground {N.control.ours}%
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: "var(--warn)" }} />
            contested {N.control.contested}%
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: "var(--chart-them)" }} />
            their ground {N.control.theirs}%
          </span>
        </div>
        <span
          style={{
            fontSize: 13,
            lineHeight: 1.55,
            color: "var(--text-secondary)",
            borderLeft: "2px solid var(--accent)",
            paddingLeft: 12,
            maxWidth: 820,
          }}
        >
          {N.controlRead}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.7fr 1fr", gap: 12, alignItems: "start" }}>
        {/* The message box */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>The message box</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-tertiary)" }}>
              Leesburg grid · {gridStamp}
            </span>
            {canEditGrid && (
              <button
                onClick={genGrid}
                style={{
                  marginLeft: "auto",
                  height: 28,
                  padding: "0 12px",
                  borderRadius: 8,
                  border: "none",
                  background: "var(--accent)",
                  color: "#fff",
                  fontFamily: "var(--font-ui)",
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                  flex: "none",
                }}
              >
                {narrGen === "running" ? "Generating…" : "⟳ Regenerate from coverage"}
              </button>
            )}
          </div>
          {narrGen === "running" && (
            <div
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                background: "var(--accent-subtle)",
                border: "1px solid var(--accent-border)",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--accent-text)",
              }}
            >
              {narrGenStatus}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {QUADS.map(renderQuad)}
          </div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-tertiary)" }}>
            share = % of theme-mapped 24h coverage · chips carry velocity, sentiment, or landing state · auto rows
            refresh on regenerate; strategy rows persist · opponent quadrants stay neutral gray by system rule
          </span>
        </div>

        {/* Right column: drivers + actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ ...cardSurface, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontSize: 16, fontWeight: 600 }}>What&apos;s driving it</span>
              <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-tertiary)" }}>
                share of 24h narrative volume
              </span>
            </div>
            {N.drivers.map((dr) => {
              const badge = DRIVER_BADGE[dr.type];
              return (
                <div key={dr.rank} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--accent-text)", flex: "none" }}>
                      {dr.rank}
                    </span>
                    <span
                      style={{
                        fontSize: 12.5,
                        fontWeight: 600,
                        flex: 1,
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {dr.name}
                    </span>
                    <span
                      style={{
                        flex: "none",
                        fontSize: 10,
                        fontWeight: 500,
                        padding: "1px 7px",
                        borderRadius: 6,
                        background: badge.bg,
                        color: badge.fg,
                      }}
                    >
                      {badge.label}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ position: "relative", flex: 1, height: 5, borderRadius: 999, background: "var(--surface-sunken)", overflow: "hidden" }}>
                      <span
                        style={{
                          position: "absolute",
                          inset: "0 auto 0 0",
                          width: `${dr.share}%`,
                          borderRadius: 999,
                          background: "var(--accent)",
                        }}
                      />
                    </span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-tertiary)", flex: "none" }}>
                      {dr.share}%
                    </span>
                  </div>
                  <span style={{ fontSize: 11, lineHeight: 1.5, color: "var(--text-secondary)" }}>{dr.note}</span>
                </div>
              );
            })}
          </div>

          <div style={{ ...cardSurface, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>How we address it</span>
            {N.actions.map((na, i) => {
              const st =
                na.statusTone === "accent"
                  ? { bg: "var(--accent-subtle)", fg: "var(--accent-text)" }
                  : { bg: "var(--warn-subtle)", fg: "var(--warn-text)" };
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 5,
                    padding: "10px 12px",
                    borderRadius: 10,
                    background: "var(--surface-raised)",
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        color: "var(--text-tertiary)",
                        flex: "none",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      {na.theme}
                    </span>
                    <span
                      style={{
                        marginLeft: "auto",
                        flex: "none",
                        fontSize: 10,
                        fontWeight: 600,
                        letterSpacing: "0.05em",
                        textTransform: "uppercase",
                        padding: "1px 7px",
                        borderRadius: 6,
                        background: st.bg,
                        color: st.fg,
                      }}
                    >
                      {na.status}
                    </span>
                  </div>
                  <span style={{ fontSize: 12.5, lineHeight: 1.45 }}>{na.action}</span>
                  {role !== "client" && (
                    <button
                      onClick={() => router.push(`/${campaign}/${na.go}`)}
                      style={{
                        alignSelf: "flex-start",
                        height: 22,
                        padding: "0 9px 0 0",
                        borderRadius: 6,
                        border: "none",
                        background: "transparent",
                        color: "var(--accent-text)",
                        fontFamily: "var(--font-ui)",
                        fontSize: 11,
                        fontWeight: 500,
                        cursor: "pointer",
                        textDecoration: "underline",
                      }}
                    >
                      {na.goLabel} →
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
