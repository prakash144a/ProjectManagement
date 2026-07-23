"use client";

import { CSSProperties } from "react";

const LETTER: Record<string, string> = {
  low: "L",
  medium: "M",
  high: "H",
  urgent: "U",
};

const LABEL: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

// Variant B ("Soft accent"): Low/Medium are plain outlined letters; only High
// and Urgent carry a muted tint so they stand out. "None" renders nothing.
export function PriorityBadge({ priority }: { priority: string }) {
  const letter = LETTER[priority];
  if (!letter) return null;

  const accent =
    priority === "high"
      ? { color: "var(--pri-high)", borderColor: "var(--pri-high)", background: "var(--pri-high-soft)" }
      : priority === "urgent"
        ? { color: "var(--pri-urg)", borderColor: "var(--pri-urg)", background: "var(--pri-urg-soft)" }
        : { color: "var(--text-dim)", borderColor: "var(--border)", background: "transparent" };

  const style: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 18,
    height: 18,
    borderRadius: 4,
    flexShrink: 0,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    fontSize: 11,
    fontWeight: 700,
    lineHeight: 1,
    userSelect: "none",
    borderWidth: 1,
    borderStyle: "solid",
    ...accent,
  };

  return (
    <span style={style} title={`Priority: ${LABEL[priority]}`}>
      {letter}
    </span>
  );
}
