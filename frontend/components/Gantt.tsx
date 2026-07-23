"use client";

import { useEffect, useRef, useState } from "react";
import { Status, Task } from "@/lib/api";
import { PriorityBadge } from "./PriorityBadge";

const DAY_W = 32;
const ROW_H = 34;
const LABEL_W = 220;

function parse(s: string): Date {
  return new Date(s + "T00:00:00");
}
function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function dayDiff(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function taskSpan(t: Task): { start: Date; end: Date } | null {
  const s = t.start_date || t.due_date;
  const e = t.due_date || t.start_date;
  if (!s || !e) return null;
  const ds = parse(s);
  const de = parse(e);
  return de < ds ? { start: de, end: ds } : { start: ds, end: de };
}

export function Gantt({
  tasks,
  statuses,
  onSelectTask,
  onReschedule,
}: {
  tasks: Task[];
  statuses: Status[];
  onSelectTask: (t: Task) => void;
  onReschedule: (taskId: string, startISO: string, dueISO: string) => Promise<void>;
}) {
  const statusById = new Map(statuses.map((s) => [s.id, s]));
  type DragMode = "move" | "resize-start" | "resize-end";
  const [drag, setDrag] = useState<
    { taskId: string; mode: DragMode; startX: number; delta: number } | null
  >(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;

  useEffect(() => {
    if (!drag) return;
    function onMove(e: MouseEvent) {
      const d = dragRef.current;
      if (!d) return;
      setDrag({ ...d, delta: Math.round((e.clientX - d.startX) / DAY_W) });
    }
    function onUp() {
      const d = dragRef.current;
      if (d && d.delta !== 0) {
        const t = tasks.find((x) => x.id === d.taskId);
        const span = t ? taskSpan(t) : null;
        if (span) {
          // Days between start and end; clamp resizes so the span stays >= 1 day.
          const spanDays = dayDiff(span.start, span.end);
          let s = span.start;
          let e = span.end;
          if (d.mode === "move") {
            s = addDays(s, d.delta);
            e = addDays(e, d.delta);
          } else if (d.mode === "resize-start") {
            s = addDays(s, Math.min(d.delta, spanDays));
          } else if (d.mode === "resize-end") {
            e = addDays(e, Math.max(d.delta, -spanDays));
          }
          onReschedule(d.taskId, iso(s), iso(e));
        }
      }
      setDrag(null);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [drag, onReschedule, tasks]);

  // Date range across all task spans (fallback: today .. +14d), padded.
  const spans = tasks.map(taskSpan).filter(Boolean) as { start: Date; end: Date }[];
  const today = parse(iso(new Date()));
  let rangeStart = today;
  let rangeEnd = addDays(today, 14);
  if (spans.length) {
    rangeStart = spans.reduce((m, s) => (s.start < m ? s.start : m), spans[0].start);
    rangeEnd = spans.reduce((m, s) => (s.end > m ? s.end : m), spans[0].end);
  }
  rangeStart = addDays(rangeStart, -2);
  rangeEnd = addDays(rangeEnd, 3);
  const numDays = Math.max(1, dayDiff(rangeStart, rangeEnd) + 1);
  const gridW = numDays * DAY_W;

  const dated = tasks.filter((t) => taskSpan(t));
  const undated = tasks.filter((t) => !taskSpan(t));

  return (
    <div style={{ overflow: "auto", height: "100%" }}>
      <div style={{ width: LABEL_W + gridW, minWidth: "100%" }}>
        {/* Header: day cells */}
        <div style={{ display: "flex", position: "sticky", top: 0, zIndex: 2 }}>
          <div
            style={{
              width: LABEL_W,
              flexShrink: 0,
              position: "sticky",
              left: 0,
              zIndex: 3,
              background: "var(--surface)",
              borderRight: "1px solid var(--border)",
              borderBottom: "1px solid var(--border)",
              padding: "6px 12px",
              fontSize: 12,
              color: "var(--text-dim)",
            }}
          >
            Task
          </div>
          <div style={{ display: "flex", background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
            {Array.from({ length: numDays }).map((_, i) => {
              const d = addDays(rangeStart, i);
              const weekend = d.getDay() === 0 || d.getDay() === 6;
              return (
                <div
                  key={i}
                  style={{
                    width: DAY_W,
                    flexShrink: 0,
                    textAlign: "center",
                    fontSize: 10,
                    padding: "4px 0",
                    color: "var(--text-dim)",
                    background: weekend ? "var(--surface-2)" : undefined,
                    borderRight: "1px solid var(--border)",
                  }}
                >
                  {d.getDate() === 1 || i === 0
                    ? d.toLocaleString(undefined, { month: "short" })
                    : ""}
                  <div>{d.getDate()}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Rows */}
        {dated.map((t) => {
          const span = taskSpan(t)!;
          const left = dayDiff(rangeStart, span.start) * DAY_W;
          const width = (dayDiff(span.start, span.end) + 1) * DAY_W;
          const status = t.status_id ? statusById.get(t.status_id) : undefined;
          const isDragging = drag?.taskId === t.id;
          const spanDays = dayDiff(span.start, span.end);
          // Live preview geometry while dragging (move / resize either edge).
          let barLeft = left;
          let barWidth = width;
          if (isDragging && drag) {
            if (drag.mode === "move") {
              barLeft = left + drag.delta * DAY_W;
            } else if (drag.mode === "resize-start") {
              const dd = Math.min(drag.delta, spanDays);
              barLeft = left + dd * DAY_W;
              barWidth = width - dd * DAY_W;
            } else if (drag.mode === "resize-end") {
              const dd = Math.max(drag.delta, -spanDays);
              barWidth = width + dd * DAY_W;
            }
          }
          const previewStart =
            isDragging && drag
              ? drag.mode === "move"
                ? addDays(span.start, drag.delta)
                : drag.mode === "resize-start"
                  ? addDays(span.start, Math.min(drag.delta, spanDays))
                  : span.start
              : span.start;
          const previewEnd =
            isDragging && drag
              ? drag.mode === "move"
                ? addDays(span.end, drag.delta)
                : drag.mode === "resize-end"
                  ? addDays(span.end, Math.max(drag.delta, -spanDays))
                  : span.end
              : span.end;
          return (
            <div key={t.id} style={{ display: "flex", height: ROW_H }}>
              <div
                style={{
                  width: LABEL_W,
                  flexShrink: 0,
                  position: "sticky",
                  left: 0,
                  zIndex: 1,
                  background: "var(--surface)",
                  borderRight: "1px solid var(--border)",
                  borderBottom: "1px solid var(--border)",
                  padding: "0 12px",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13,
                }}
                title={t.title}
              >
                <PriorityBadge priority={t.priority} />
                <span style={{ overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                  {t.title}
                </span>
              </div>
              <div style={{ position: "relative", width: gridW, borderBottom: "1px solid var(--border)" }}>
                <div
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setDrag({ taskId: t.id, mode: "move", startX: e.clientX, delta: 0 });
                  }}
                  onClick={() => !isDragging && onSelectTask(t)}
                  title={`${iso(previewStart)} → ${iso(previewEnd)}\nDrag middle to move · drag either edge to resize`}
                  style={{
                    position: "absolute",
                    top: 6,
                    left: barLeft,
                    width: barWidth,
                    height: ROW_H - 14,
                    background: status?.color || "var(--primary)",
                    opacity: isDragging ? 0.7 : 1,
                    borderRadius: 5,
                    cursor: "grab",
                    color: "#fff",
                    fontSize: 11,
                    lineHeight: `${ROW_H - 14}px`,
                    paddingLeft: 10,
                    paddingRight: 10,
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    userSelect: "none",
                  }}
                >
                  {/* Left resize handle → moves start date */}
                  <div
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDrag({ taskId: t.id, mode: "resize-start", startX: e.clientX, delta: 0 });
                    }}
                    onClick={(e) => e.stopPropagation()}
                    title="Drag to change start date"
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: 8,
                      cursor: "ew-resize",
                      borderTopLeftRadius: 5,
                      borderBottomLeftRadius: 5,
                    }}
                  />
                  {t.title}
                  {/* Right resize handle → moves due date */}
                  <div
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDrag({ taskId: t.id, mode: "resize-end", startX: e.clientX, delta: 0 });
                    }}
                    onClick={(e) => e.stopPropagation()}
                    title="Drag to change due date"
                    style={{
                      position: "absolute",
                      right: 0,
                      top: 0,
                      bottom: 0,
                      width: 8,
                      cursor: "ew-resize",
                      borderTopRightRadius: 5,
                      borderBottomRightRadius: 5,
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}

        {undated.length > 0 && (
          <div style={{ padding: "12px", color: "var(--text-dim)", fontSize: 13 }}>
            {undated.length} task(s) have no dates — set a start/due date to place them on the timeline.
          </div>
        )}
        {dated.length === 0 && undated.length === 0 && (
          <div style={{ padding: 24 }} className="muted">
            No tasks yet.
          </div>
        )}
      </div>
    </div>
  );
}
