"use client";

import { useState } from "react";
import { Status, Task } from "@/lib/api";
import { PriorityBadge } from "./PriorityBadge";

function ColumnAdd({ onAdd }: { onAdd: (title: string) => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (!title.trim()) return;
    setBusy(true);
    try {
      await onAdd(title.trim());
      setTitle("");
    } finally {
      setBusy(false);
    }
  }
  return (
    <input
      value={title}
      onChange={(e) => setTitle(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && submit()}
      placeholder="+ Add"
      disabled={busy}
      style={{ fontSize: 13, marginTop: 6 }}
    />
  );
}

export function Kanban({
  tasks,
  statuses,
  selectedTaskId,
  onSelectTask,
  onMoveTask,
  onCreateTask,
}: {
  tasks: Task[];
  statuses: Status[];
  selectedTaskId: string | null;
  onSelectTask: (t: Task) => void;
  onMoveTask: (taskId: string, statusId: string) => Promise<void>;
  onCreateTask: (title: string, statusId: string) => Promise<void>;
}) {
  const [dragOver, setDragOver] = useState<string | null>(null);

  const columns: { id: string | null; name: string; color: string | null }[] = [];
  if (tasks.some((t) => !t.status_id)) {
    columns.push({ id: null, name: "No status", color: null });
  }
  for (const s of statuses) columns.push({ id: s.id, name: s.name, color: s.color });

  return (
    <div style={{ display: "flex", gap: 12, padding: 16, overflowX: "auto", height: "100%" }}>
      {columns.map((col) => {
        const items = tasks.filter((t) => (t.status_id ?? null) === col.id);
        const isTarget = dragOver === (col.id ?? "__none__");
        return (
          <div
            key={col.id ?? "__none__"}
            onDragOver={(e) => {
              if (col.id) {
                e.preventDefault();
                setDragOver(col.id);
              }
            }}
            onDragLeave={() => setDragOver(null)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(null);
              const taskId = e.dataTransfer.getData("text/plain");
              if (taskId && col.id) onMoveTask(taskId, col.id);
            }}
            className="card"
            style={{
              width: 280,
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              background: isTarget ? "var(--surface-2)" : undefined,
              borderColor: isTarget ? "var(--primary)" : undefined,
              maxHeight: "100%",
            }}
          >
            <div
              style={{
                padding: "10px 12px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontWeight: 600,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: col.color || "var(--text-dim)",
                  display: "inline-block",
                }}
              />
              {col.name}
              <span className="muted" style={{ fontWeight: 400 }}>
                {items.length}
              </span>
            </div>

            <div style={{ padding: 10, overflowY: "auto", flex: 1 }}>
              {items.map((t) => (
                <div
                  key={t.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", t.id)}
                  onClick={() => onSelectTask(t)}
                  className="card-hover"
                  style={{
                    background: "var(--surface)",
                    border: `1px solid ${t.id === selectedTaskId ? "var(--primary)" : "var(--border)"}`,
                    borderRadius: 8,
                    boxShadow: "var(--shadow-sm)",
                    padding: "9px 11px",
                    marginBottom: 8,
                    cursor: "grab",
                  }}
                >
                  <div className="row" style={{ gap: 6, alignItems: "flex-start" }}>
                    <PriorityBadge priority={t.priority} />
                    <span style={{ flex: 1 }}>{t.title}</span>
                  </div>
                  {t.due_date && (
                    <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                      due {t.due_date}
                    </div>
                  )}
                </div>
              ))}
              {col.id && <ColumnAdd onAdd={(title) => onCreateTask(title, col.id!)} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}
