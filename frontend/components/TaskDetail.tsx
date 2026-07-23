"use client";

import { useEffect, useState } from "react";
import { api, ApiError, Member, Status, Task, TaskGroup } from "@/lib/api";
import { CommentThread } from "./CommentThread";

const PRIORITIES = ["none", "low", "medium", "high", "urgent"];

export function TaskDetail({
  task,
  statuses,
  members,
  taskGroups,
  currentUserId,
  onSaved,
  onDeleted,
  onClose,
}: {
  task: Task;
  statuses: Status[];
  members: Member[];
  taskGroups: TaskGroup[];
  currentUserId: string;
  onSaved: (t: Task) => void;
  onDeleted: (id: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Task>(task);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setDraft(task);
    setError("");
  }, [task]);

  function set<K extends keyof Task>(key: K, value: Task[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      const patch: Partial<Task> = {
        title: draft.title,
        description: draft.description,
        status_id: draft.status_id,
        priority: draft.priority,
        assignee_id: draft.assignee_id,
        project_task_group_id: draft.project_task_group_id,
        start_date: draft.start_date,
        due_date: draft.due_date,
      };
      const updated = await api.tasks.update(task.id, patch);
      onSaved(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete task "${task.title}"? This cannot be undone.`)) return;
    setBusy(true);
    setError("");
    try {
      await api.tasks.remove(task.id);
      onDeleted(task.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  const memberLabel = (m: Member) => m.display_name || m.email || m.username || m.id.slice(0, 8);

  return (
    <aside
      style={{
        width: 380,
        flexShrink: 0,
        borderLeft: "1px solid var(--border)",
        background: "var(--surface)",
        padding: 18,
        overflowY: "auto",
      }}
    >
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <strong>Task details</strong>
        <button onClick={onClose}>✕</button>
      </div>

      <div className="field">
        <label>Title</label>
        <input value={draft.title} onChange={(e) => set("title", e.target.value)} />
      </div>

      <div className="field">
        <label>Description</label>
        <textarea
          rows={4}
          value={draft.description || ""}
          onChange={(e) => set("description", e.target.value)}
        />
      </div>

      <div className="row" style={{ gap: 12 }}>
        <div className="field" style={{ flex: 1 }}>
          <label>Status</label>
          <select
            value={draft.status_id || ""}
            onChange={(e) => set("status_id", e.target.value || null)}
          >
            <option value="">—</option>
            {statuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Priority</label>
          <select value={draft.priority} onChange={(e) => set("priority", e.target.value)}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field">
        <label>Assignee</label>
        <select
          value={draft.assignee_id || ""}
          onChange={(e) => set("assignee_id", e.target.value || null)}
        >
          <option value="">Unassigned</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {memberLabel(m)}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label>Task group</label>
        <select
          value={draft.project_task_group_id || ""}
          onChange={(e) => set("project_task_group_id", e.target.value || null)}
        >
          <option value="">Ungrouped</option>
          {taskGroups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </div>

      <div className="row" style={{ gap: 12 }}>
        <div className="field" style={{ flex: 1 }}>
          <label>Start date</label>
          <input
            type="date"
            value={draft.start_date || ""}
            onChange={(e) => set("start_date", e.target.value || null)}
          />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Due date</label>
          <input
            type="date"
            value={draft.due_date || ""}
            onChange={(e) => set("due_date", e.target.value || null)}
          />
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="row" style={{ justifyContent: "space-between", marginTop: 12 }}>
        <button className="danger" disabled={busy} onClick={remove}>
          Delete
        </button>
        <button className="primary" disabled={busy} onClick={save}>
          {busy ? "Saving…" : "Save changes"}
        </button>
      </div>

      <div style={{ borderTop: "1px solid var(--border)", marginTop: 18, paddingTop: 14 }}>
        <strong style={{ display: "block", marginBottom: 10 }}>Comments</strong>
        <CommentThread
          key={task.id}
          currentUserId={currentUserId}
          load={() => api.comments.taskList(task.id)}
          add={(b) => api.comments.taskAdd(task.id, b)}
          remove={(id) => api.comments.taskDelete(task.id, id)}
        />
      </div>
    </aside>
  );
}
