"use client";

import { CSSProperties, ReactNode } from "react";
import { ProjectStatus } from "@/lib/api";

// Shared visual primitives for the foundational design system. Everything is
// theme-aware via CSS variables (see globals.css) and works in light + dark.

// Priority → accent color (mid-saturation, legible on both themes).
export const PRIORITY_COLOR: Record<string, string> = {
  urgent: "#dc2626",
  high: "#ea580c",
  medium: "#d97706",
  low: "#0891b2",
  none: "var(--text-dim)",
};

export function priorityColor(p: string | null | undefined): string {
  return PRIORITY_COLOR[p || "none"] || "var(--text-dim)";
}

// Derived project status → label + color (matches the backend rollup).
export const PROJECT_STATUS_META: Record<ProjectStatus, { label: string; color: string }> = {
  not_started: { label: "Not started", color: "#6b7280" },
  in_progress: { label: "In progress", color: "#d97706" },
  done: { label: "Done", color: "#16a34a" },
};

// A slim 0..100 progress bar. `color` fills; the rest is a soft track.
export function ProgressBar({
  value,
  color = "var(--primary)",
  height = 8,
  style,
}: {
  value: number;
  color?: string;
  height?: number;
  style?: CSSProperties;
}) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div style={{ height, borderRadius: 999, background: "var(--surface-2)", overflow: "hidden", ...style }}>
      <div
        style={{
          width: `${v}%`,
          height: "100%",
          background: color,
          borderRadius: 999,
          transition: "width 0.4s var(--ease)",
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lightweight, dependency-free charts (hand-rolled SVG). Theme-aware via CSS
// vars (track = --surface-2), sized entirely via props so they drop into cards
// and stat rows. No chart library — same zero-bundle approach as the bar charts.
// ---------------------------------------------------------------------------

function clampPct(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, n));
}

export interface Segment {
  value: number;
  color: string;
  label?: string;
}

// A segmented ring. Pass `total` to render a partial ring (segments summing to
// less than `total` leave the track visible); omit it to treat the segments as
// the whole. `center` renders centered content (a number, a label, …).
export function Donut({
  segments,
  total,
  size = 128,
  thickness = 16,
  center,
  trackColor = "var(--surface-2)",
  rounded = false,
}: {
  segments: Segment[];
  total?: number;
  size?: number;
  thickness?: number;
  center?: ReactNode;
  trackColor?: string;
  rounded?: boolean;
}) {
  const sum = segments.reduce((s, x) => s + Math.max(0, x.value), 0);
  const whole = total ?? sum;
  const r = (size - thickness) / 2;
  const circ = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackColor} strokeWidth={thickness} />
        {whole > 0 &&
          segments.map((s, i) => {
            const len = (Math.max(0, s.value) / whole) * circ;
            const off = acc;
            acc += len;
            if (len <= 0) return null;
            return (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={thickness}
                strokeLinecap={rounded ? "round" : "butt"}
                strokeDasharray={`${len} ${circ - len}`}
                strokeDashoffset={-off}
                style={{ transition: "stroke-dasharray .5s var(--ease), stroke-dashoffset .5s var(--ease)" }}
              />
            );
          })}
      </svg>
      {center != null && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            lineHeight: 1.15,
          }}
        >
          {center}
        </div>
      )}
    </div>
  );
}

// A single 0..100 metric as a ring with a big number in the middle (the hero
// KPI). The track shows the remaining-to-100 portion.
export function RadialStat({
  value,
  color = "var(--primary)",
  size = 128,
  thickness = 14,
  label,
  suffix = "%",
}: {
  value: number;
  color?: string;
  size?: number;
  thickness?: number;
  label?: ReactNode;
  suffix?: string;
}) {
  const v = clampPct(Math.round(value));
  return (
    <Donut
      total={100}
      size={size}
      thickness={thickness}
      rounded
      segments={[{ value: v, color }]}
      center={
        <>
          <span style={{ fontSize: Math.round(size * 0.24), fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
            {v}
            <span style={{ fontSize: "0.58em", fontWeight: 600, opacity: 0.7 }}>{suffix}</span>
          </span>
          {label && (
            <span className="section-label" style={{ marginTop: 3 }}>
              {label}
            </span>
          )}
        </>
      }
    />
  );
}

export interface GaugeZone {
  upto: number; // inclusive upper bound, in value units
  color: string;
}

// A 180° gauge for one value against a range, with threshold-colored fill.
// `zones` (sorted ascending) pick the fill color by which band `value` lands in;
// or pass an explicit `color`.
export function GaugeArc({
  value,
  max = 100,
  zones,
  color,
  size = 150,
  thickness = 12,
  label,
  display,
}: {
  value: number;
  max?: number;
  zones?: GaugeZone[];
  color?: string;
  size?: number;
  thickness?: number;
  label?: ReactNode;
  display?: ReactNode;
}) {
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const f = clampPct(max ? value / max : 0, 0, 1);
  const svgH = size / 2 + thickness / 2 + 2;
  // Trace the arc as a sampled polyline (0° = right, 90° = top, 180° = left, with
  // y flipped so the arc bulges up). Sampling sidesteps SVG arc-flag ambiguity —
  // the gauge always renders over the top regardless of direction.
  const arc = (startDeg: number, endDeg: number) => {
    const steps = Math.max(2, Math.round(Math.abs(startDeg - endDeg) / 3));
    let d = "";
    for (let i = 0; i <= steps; i++) {
      const deg = startDeg + ((endDeg - startDeg) * i) / steps;
      const x = cx + r * Math.cos((deg * Math.PI) / 180);
      const y = cy - r * Math.sin((deg * Math.PI) / 180);
      d += `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)} `;
    }
    return d.trim();
  };
  const fillColor =
    color || (zones ? zones.find((z) => value <= z.upto)?.color ?? zones[zones.length - 1].color : "var(--primary)");
  const endAngle = 180 - 180 * f;
  return (
    <div style={{ position: "relative", width: size, height: svgH, flexShrink: 0 }}>
      <svg width={size} height={svgH} viewBox={`0 0 ${size} ${svgH}`}>
        <path d={arc(180, 0)} fill="none" stroke="var(--surface-2)" strokeWidth={thickness} strokeLinecap="round" />
        {f > 0 && (
          <path d={arc(180, endAngle)} fill="none" stroke={fillColor} strokeWidth={thickness} strokeLinecap="round" />
        )}
      </svg>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          lineHeight: 1.1,
        }}
      >
        <span style={{ fontSize: Math.round(size * 0.17), fontWeight: 700, fontVariantNumeric: "tabular-nums", color: fillColor }}>
          {display ?? Math.round(value)}
        </span>
        {label && (
          <span className="section-label" style={{ marginTop: 2 }}>
            {label}
          </span>
        )}
      </div>
    </div>
  );
}

// A single 100%-wide segmented bar — the dense alternative to a donut for a
// small categorical breakdown (e.g. priority mix).
export function StackedBar({ segments, height = 10 }: { segments: Segment[]; height?: number }) {
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0) || 1;
  return (
    <div style={{ display: "flex", height, borderRadius: 999, overflow: "hidden", background: "var(--surface-2)" }}>
      {segments.map((s, i) => (
        <div
          key={i}
          title={s.label}
          style={{ width: `${(Math.max(0, s.value) / total) * 100}%`, background: s.color, transition: "width 0.4s var(--ease)" }}
        />
      ))}
    </div>
  );
}

// A compact trend line for a small series (e.g. weekly throughput).
export function Sparkline({
  points,
  width = 72,
  height = 24,
  color = "var(--primary)",
  fill = true,
}: {
  points: number[];
  width?: number;
  height?: number;
  color?: string;
  fill?: boolean;
}) {
  if (!points || points.length < 2) return null;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const step = width / (points.length - 1);
  const pad = 2.5;
  const h = height - pad * 2;
  const xy = points.map((p, i) => [i * step, pad + h - ((p - min) / range) * h] as const);
  const line = xy.map(([x, y], i) => `${i ? "L" : "M"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L ${width.toFixed(1)} ${height} L 0 ${height} Z`;
  const [lx, ly] = xy[xy.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block", overflow: "visible" }}>
      {fill && <path d={area} fill={color} opacity={0.12} />}
      <path d={line} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r={2.2} fill={color} />
    </svg>
  );
}

// A vertical legend for the charts above: color dot + label + optional value.
export function ChartLegend({
  items,
  style,
}: {
  items: { label: ReactNode; color: string; value?: ReactNode }[];
  style?: CSSProperties;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, ...style }}>
      {items.map((it, i) => (
        <div key={i} className="row" style={{ justifyContent: "space-between", gap: 12 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <Dot color={it.color} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13 }}>{it.label}</span>
          </span>
          {it.value != null && (
            <strong style={{ fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{it.value}</strong>
          )}
        </div>
      ))}
    </div>
  );
}

export function Card({
  children,
  hover,
  style,
  onClick,
}: {
  children: ReactNode;
  hover?: boolean;
  style?: CSSProperties;
  onClick?: () => void;
}) {
  return (
    <div className={hover ? "card card-hover" : "card"} style={style} onClick={onClick}>
      {children}
    </div>
  );
}

export function SectionLabel({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div className="section-label" style={style}>
      {children}
    </div>
  );
}

export function Dot({ color, size = 8 }: { color: string; size?: number }) {
  return (
    <span
      style={{ width: size, height: size, borderRadius: "50%", background: color, display: "inline-block", flexShrink: 0 }}
    />
  );
}

// A soft, GitHub-label-style pill. `color` is the strong text color; the
// background is derived from it at low opacity so any status/priority hue works.
export function Pill({
  color = "var(--text-dim)",
  dot,
  children,
  title,
  style,
}: {
  color?: string;
  dot?: boolean;
  children: ReactNode;
  title?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className="pill"
      title={title}
      style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)`, ...style }}
    >
      {dot && <Dot color={color} size={7} />}
      {children}
    </span>
  );
}

// A small up/down delta chip (period-over-period). `goodWhenUp` flips the color
// semantics for metrics where a decrease is the good outcome (e.g. overdue).
export function Delta({
  value,
  goodWhenUp = true,
  suffix,
}: {
  value: number;
  goodWhenUp?: boolean;
  suffix?: string;
}) {
  if (value === 0) {
    return (
      <span className="muted" style={{ fontSize: 12, fontWeight: 600 }}>
        · no change
      </span>
    );
  }
  const up = value > 0;
  const good = up === goodWhenUp;
  const color = good ? "var(--up)" : "var(--down)";
  return (
    <span style={{ color, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>
      {up ? "▲" : "▼"} {Math.abs(value)}
      {suffix ? ` ${suffix}` : ""}
    </span>
  );
}

// Executive KPI card: uppercase label + optional icon, a large number, and an
// optional sub-line (trend/context).
export function StatCard({
  label,
  value,
  icon,
  sub,
  tone,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  sub?: ReactNode;
  tone?: string;
}) {
  return (
    <Card hover style={{ padding: "14px 16px", minWidth: 130, flex: "1 1 130px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span className="section-label">{label}</span>
        {icon && <span style={{ fontSize: 15, opacity: 0.65, lineHeight: 1 }}>{icon}</span>}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.1, marginTop: 6, color: tone || "var(--text)" }}>
        {value}
      </div>
      {sub != null && (
        <div className="muted" style={{ fontSize: 12, marginTop: 3, display: "flex", alignItems: "center", gap: 6 }}>
          {sub}
        </div>
      )}
    </Card>
  );
}

// Stable 32-bit hash of a string — drives all deterministic pickers below so a
// given project/person always maps to the same icon/hue.
function hashStr(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h;
}

// Deterministic avatar: initials on a soft, name-derived hue. Works for any
// person (member/comment author/current user) with no image dependency.
const AVATAR_HUES = [210, 260, 330, 20, 150, 190, 280, 45];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function hueFor(seed: string): number {
  return AVATAR_HUES[hashStr(seed) % AVATAR_HUES.length];
}

// Deterministic "cool" icon per project — derived from its id (or name), so it's
// stable and needs no storage. Curated to read as project/work-themed glyphs.
const PROJECT_ICONS = [
  "🚀", "📊", "🐛", "🎨", "💡", "🔥", "⭐", "🎯",
  "🧩", "⚡", "🛠️", "📦", "🌱", "🧭", "🏗️", "🎬",
  "📈", "🧪", "🌐", "🔬", "🗂️", "🎸", "🧠", "📌",
];

export function projectIcon(seed: string): string {
  return PROJECT_ICONS[hashStr(seed || "?") % PROJECT_ICONS.length];
}

// A project's icon on a soft, matching tint — a mini "app icon" for the project.
export function ProjectIcon({ seed, size = 24 }: { seed: string; size?: number }) {
  const hue = AVATAR_HUES[hashStr(seed || "?") % AVATAR_HUES.length];
  return (
    <span
      style={{
        width: size,
        height: size,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        borderRadius: Math.round(size * 0.28),
        fontSize: Math.round(size * 0.58),
        lineHeight: 1,
        background: `color-mix(in srgb, hsl(${hue} 65% 55%) 16%, var(--surface))`,
        border: `1px solid color-mix(in srgb, hsl(${hue} 65% 55%) 30%, var(--border))`,
      }}
    >
      {projectIcon(seed)}
    </span>
  );
}

export function Avatar({
  name,
  size = 28,
  seed,
}: {
  name: string;
  size?: number;
  seed?: string;
}) {
  const hue = hueFor(seed || name || "?");
  return (
    <span
      className="avatar"
      title={name}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.4),
        color: `hsl(${hue} 55% 42%)`,
        background: `hsl(${hue} 70% 92%)`,
        border: `1px solid hsl(${hue} 55% 82%)`,
      }}
    >
      {initials(name)}
    </span>
  );
}

// A single shimmering placeholder block. Compose several for skeleton screens.
export function Skeleton({
  w = "100%",
  h = 14,
  radius = 6,
  style,
}: {
  w?: number | string;
  h?: number | string;
  radius?: number;
  style?: CSSProperties;
}) {
  return <div className="skeleton" style={{ width: w, height: h, borderRadius: radius, ...style }} />;
}

// Friendly empty state for no-data views.
export function EmptyState({
  emoji = "✨",
  title,
  desc,
  action,
}: {
  emoji?: string;
  title: string;
  desc?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="emoji">{emoji}</div>
      <div className="title">{title}</div>
      {desc && <div className="desc">{desc}</div>}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}
