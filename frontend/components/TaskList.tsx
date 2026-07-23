"use client";

import { useState } from "react";
import { Status, Task, TaskGroup } from "@/lib/api";
import { PriorityBadge } from "./PriorityBadge";
import { Pill, ProgressBar } from "./ui";

function AddTask({ onAdd }: { onAdd: (title: string) => Promise<void> }) {
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
    <div style={{ padding: "6px 0" }}>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="+ Add a task"
        disabled={busy}
        style={{ fontSize: 13 }}
      />
    </div>
  );
}

function AddGroup({ onAdd }: { onAdd: (name: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onAdd(name.trim());
      setName("");
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{ fontSize: 13 }}>
        + Add task group
      </button>
    );
  }
  return (
    <div className="row" style={{ maxWidth: 360 }}>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Task group name"
        style={{ fontSize: 13 }}
      />
      <button className="primary" disabled={busy} onClick={submit}>
        Add
      </button>
      <button onClick={() => setOpen(false)}>Cancel</button>
    </div>
  );
}

type RowHint = { id: string; half: "top" | "bottom" };

export function TaskList({
  tasks,
  statuses,
  taskGroups,
  selectedTaskId,
  onSelectTask,
  onCreateTask,
  onCreateTaskGroup,
  onReorder,
}: {
  tasks: Task[];
  statuses: Status[];
  taskGroups: TaskGroup[];
  selectedTaskId: string | null;
  onSelectTask: (t: Task) => void;
  onCreateTask: (title: string, groupId: string | null) => Promise<void>;
  onCreateTaskGroup: (name: string) => Promise<void>;
  onReorder: (groupId: string | null, orderedTaskIds: string[]) => Promise<void>;
}) {
  const statusById = new Map(statuses.map((s) => [s.id, s]));
  const [overBucket, setOverBucket] = useState<string | null>(null);
  const [overRow, setOverRow] = useState<RowHint | null>(null);

  const buckets: { id: string | null; name: string }[] = [
    ...taskGroups.map((g) => ({ id: g.id as string | null, name: g.name })),
  ];
  if (tasks.some((t) => !t.project_task_group_id)) {
    buckets.push({ id: null, name: "Ungrouped" });
  }
  if (buckets.length === 0) buckets.push({ id: null, name: "Tasks" });

  function dropOnRow(
    bucketId: string | null,
    items: Task[],
    draggedId: string,
    targetId: string,
    half: "top" | "bottom",
  ) {
    const base = items.filter((t) => t.id !== draggedId).map((t) => t.id);
    const ti = base.indexOf(targetId);
    const insertAt = half === "top" ? ti : ti + 1;
    const next = [...base.slice(0, insertAt), draggedId, ...base.slice(insertAt)];
    onReorder(bucketId, next);
  }

  function dropOnBucket(bucketId: string | null, items: Task[], draggedId: string) {
    const base = items.filter((t) => t.id !== draggedId).map((t) => t.id);
    onReorder(bucketId, [...base, draggedId]);
  }

  return (
    <div style={{ padding: 16, overflowY: "auto", height: "100%" }}>
      {buckets.map((bucket) => {
        const bucketKey = bucket.id ?? "ungrouped";
        const items = tasks.filter((t) => (t.project_task_group_id ?? null) === bucket.id);
        return (
          <div key={bucketKey} style={{ marginBottom: 22 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>
              {bucket.name}{" "}
              <span className="muted" style={{ fontWeight: 400 }}>
                ({items.length})
              </span>
            </div>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setOverBucket(bucketKey);
              }}
              onDragLeave={() => setOverBucket((b) => (b === bucketKey ? null : b))}
              onDrop={(e) => {
                e.preventDefault();
                const draggedId = e.dataTransfer.getData("text/plain");
                setOverBucket(null);
                setOverRow(null);
                if (draggedId) dropOnBucket(bucket.id, items, draggedId);
              }}
              className="card"
              style={{
                borderColor: overBucket === bucketKey && !overRow ? "var(--primary)" : undefined,
                overflow: "hidden",
                background: overBucket === bucketKey && !overRow ? "var(--surface-2)" : undefined,
              }}
            >
              {items.map((t) => {
                const status = t.status_id ? statusById.get(t.status_id) : undefined;
                const done = status?.is_completed;
                const hint = overRow?.id === t.id ? overRow.half : null;
                return (
                  <div
                    key={t.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", t.id)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const r = e.currentTarget.getBoundingClientRect();
                      const half = e.clientY < r.top + r.height / 2 ? "top" : "bottom";
                      setOverRow({ id: t.id, half });
                      setOverBucket(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const draggedId = e.dataTransfer.getData("text/plain");
                      const half = overRow?.id === t.id ? overRow.half : "bottom";
                      setOverRow(null);
                      setOverBucket(null);
                      if (draggedId && draggedId !== t.id)
                        dropOnRow(bucket.id, items, draggedId, t.id, half);
                    }}
                    onClick={() => onSelectTask(t)}
                    className="list-row"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "9px 14px",
                      borderBottom: "1px solid var(--border)",
                      borderTop: hint === "top" ? "2px solid var(--primary)" : undefined,
                      boxShadow:
                        hint === "bottom" ? "inset 0 -2px 0 0 var(--primary)" : undefined,
                      cursor: "grab",
                      background: t.id === selectedTaskId ? "var(--surface-2)" : undefined,
                    }}
                  >
                    <span style={{ color: "var(--text-dim)" }}>⠿</span>
                    <PriorityBadge priority={t.priority} />
                    <span
                      style={{
                        flex: 1,
                        textDecoration: done ? "line-through" : "none",
                        color: done ? "var(--text-dim)" : "var(--text)",
                      }}
                    >
                      {t.title}
                    </span>
                    {!done && t.progress > 0 && (
                      <span
                        style={{ display: "inline-flex", alignItems: "center", gap: 6, width: 78 }}
                        title={`${t.progress}% complete`}
                      >
                        <ProgressBar value={t.progress} height={5} style={{ flex: 1 }} />
                        <span className="muted" style={{ fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
                          {t.progress}%
                        </span>
                      </span>
                    )}
                    {t.due_date && (
                      <span className="muted" style={{ fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
                        {t.due_date}
                      </span>
                    )}
                    {status && (
                      <Pill color={status.color || "var(--text-dim)"} dot>
                        {status.name}
                      </Pill>
                    )}
                  </div>
                );
              })}
              <div style={{ padding: "2px 12px", background: "var(--surface)" }}>
                <AddTask onAdd={(title) => onCreateTask(title, bucket.id)} />
              </div>
            </div>
          </div>
        );
      })}
      <AddGroup onAdd={onCreateTaskGroup} />
    </div>
  );
}
