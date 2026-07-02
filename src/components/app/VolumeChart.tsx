"use client";

/**
 * S1 30-day volume chart, rebuilt with Recharts per the handoff:
 * sunken plot bg, gray grid, us = accent line with end dot, opponent = neutral
 * gray, mono 10px axis labels. Opponent is NEVER red (system rule 02).
 */

import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";

const X_LABELS: Record<number, string> = { 0: "Jun 2", 5: "Jun 12", 10: "Jun 22", 14: "Jul 2" };

function LastPointDot(props: {
  cx?: number;
  cy?: number;
  index?: number;
  dataLength: number;
}) {
  const { cx, cy, index, dataLength } = props;
  if (index !== dataLength - 1 || cx == null || cy == null) return null;
  return <circle cx={cx} cy={cy} r={3.5} fill="var(--chart-us)" />;
}

export function VolumeChart({ us, them }: { us: number[]; them: number[] }) {
  const data = us.map((v, i) => ({ i, us: v, them: them[i] }));
  return (
    <div
      style={{
        background: "var(--surface-sunken)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 10,
        padding: "12px 12px 6px",
      }}
    >
      <ResponsiveContainer width="100%" height={185}>
        <LineChart data={data} margin={{ top: 8, right: 26, bottom: 0, left: 10 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeWidth={1} />
          <XAxis
            dataKey="i"
            ticks={[0, 5, 10, 14]}
            tickFormatter={(v: number) => X_LABELS[v] ?? ""}
            tick={{ fontFamily: "var(--font-mono)", fontSize: 10, fill: "var(--text-tertiary)" }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis hide domain={["dataMin - 10", "dataMax + 10"]} />
          <Line
            type="linear"
            dataKey="them"
            stroke="var(--chart-them)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="linear"
            dataKey="us"
            stroke="var(--chart-us)"
            strokeWidth={2}
            dot={<LastPointDot dataLength={data.length} />}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
