"use client";

import { CSSProperties, ReactNode } from "react";

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
    <Card style={{ padding: "14px 16px", minWidth: 130, flex: "1 1 130px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span className="section-label">{label}</span>
        {icon && <span style={{ fontSize: 15, opacity: 0.65, lineHeight: 1 }}>{icon}</span>}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.1, marginTop: 6, color: tone || "var(--text)" }}>
        {value}
      </div>
      {sub != null && (
        <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>
          {sub}
        </div>
      )}
    </Card>
  );
}
