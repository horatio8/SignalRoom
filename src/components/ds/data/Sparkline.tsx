"use client";

import React from "react";

export interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  /** True renders the line in heat orange (hot cluster). */
  hot?: boolean;
  /** Draws a dashed gray reference line at this value. */
  baseline?: number;
  /** Explicit stroke override (e.g. a specific heat step). Wins over `hot`. */
  stroke?: string;
  /** Scale to the container width (keeps the viewBox aspect). */
  fluid?: boolean;
  style?: React.CSSProperties;
}

/** Minimal SVG sparkline: 1.5px line, dot on last point only, optional baseline. */
export function Sparkline({
  data = [],
  width = 120,
  height = 32,
  hot = false,
  baseline,
  stroke,
  fluid = false,
  style,
}: SparklineProps) {
  if (!data.length) return null;
  const min = Math.min(...data, baseline ?? Infinity);
  const max = Math.max(...data, baseline ?? -Infinity);
  const range = max - min || 1;
  const pad = 3;
  const x = (i: number) => pad + (i / (data.length - 1 || 1)) * (width - pad * 2);
  const y = (v: number) => height - pad - ((v - min) / range) * (height - pad * 2);
  const points = data.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const line = stroke ?? (hot ? "var(--heat-4)" : "var(--chart-us)");
  const dims = fluid
    ? { viewBox: `0 0 ${width} ${height}` }
    : { width, height };
  return (
    <svg {...dims} style={{ flex: "none", ...(fluid ? { width: "100%", display: "block" } : {}), ...style }}>
      {baseline != null && (
        <line
          x1={pad}
          y1={y(baseline)}
          x2={width - pad}
          y2={y(baseline)}
          stroke="var(--chart-them)"
          strokeWidth="1"
          strokeDasharray="3 3"
        />
      )}
      <polyline points={points} fill="none" stroke={line} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(data.length - 1)} cy={y(data[data.length - 1])} r="2.5" fill={line} />
    </svg>
  );
}
