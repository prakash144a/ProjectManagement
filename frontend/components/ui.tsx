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
