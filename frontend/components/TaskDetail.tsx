"use client";

import { useEffect, useState } from "react";
import { api, ApiError, Member, Status, Task, TaskGroup } from "@/lib/api";
import { CommentThread } from "./CommentThread";
import { PriorityBadge } from "./PriorityBadge";
import { Avatar, Dot, Pill, SectionLabel } from "./ui";
import { ResizeHandle } from "./ResizeHandle";
import { useResizableWidth } from "@/lib/useResizableWidth";

const PRIORITIES = ["none", "low", "medium", "high", "urgent"];

// A short, human due-date hint ("3d overdue", "due today", "in 5d") + a tone.
function dueHint(due: string | null | undefined): { text: string; color: string } | null {
  if (!due) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(`${due}T00:00:00`);
  const days = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (days < 0) return { text: `${-days}d overdue`, color: "#dc2626" };
  if (days === 0) return { text: "due today", color: "#d97706" };
  if (days === 1) return { text: "due tomorrow", color: "#d97706" };
  return { text: `in ${days}d`, color: "var(--text-dim)" };
}

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
  const { width, dragging, handleProps } = useResizableWidth({
    storageKey: "pm_w_taskdetail",
    defaultWidth: 380,
    min: 300,
    max: 640,
    side: "left",
  });

  useEffect(() => {
    setDraft(task);
    setError("");
  }, [task]);

  function set<K extends keyof Task>(key: K, value: Task[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  // Selecting a completed status snaps progress to 100 (mirrors the backend).
  function setStatus(id: string | null) {
    setDraft((d) => {
      const st = id ? statuses.find((s) => s.id === id) : undefined;
      return { ...d, status_id: id, progress: st?.is_completed ? 100 : d.progress };
    });
  }

  // Status buckets for the progress↔status linkage. "Done" = first completed
  // status; "In progress" = a progress/doing/review-named open status (or the
  // second open one); "Not started" = the first open status.
  const doneStatus = statuses.find((s) => s.is_completed) || null;
  const openStatuses = statuses.filter((s) => !s.is_completed);
  const notStartedStatus = openStatuses[0] || null;
  const inProgressStatus =
    openStatuses.find((s) => /progress|doing|wip|ongoing|active|started|review/i.test(s.name)) ||
    openStatuses[1] ||
    null;

  // Moving the slider drives the status: >0 → In progress, 100 → Done, and a
  // completed status dropped below 100 falls back to In progress / Not started.
  function setProgress(value: number) {
    setDraft((d) => {
      let status_id = d.status_id;
      const cur = statuses.find((s) => s.id === status_id);
      if (value >= 100) {
        if (doneStatus) status_id = doneStatus.id;
      } else if (value > 0) {
        if (inProgressStatus && (!cur || cur.is_completed || status_id === notStartedStatus?.id)) {
          status_id = inProgressStatus.id;
        }
      } else if (cur?.is_completed && notStartedStatus) {
        status_id = notStartedStatus.id;
      }
      return { ...d, progress: value, status_id };
    });
  }

  const currentStatus = draft.status_id
    ? statuses.find((s) => s.id === draft.status_id)
    : undefined;
  // Bar color tracks the current status; at 100% that's the completed status,
  // so it naturally shows the "done" color.
  const barColor =
    currentStatus?.color || (currentStatus?.is_completed ? "#16a34a" : "var(--primary)");

  async function save() {
    setBusy(true);
    setError("");
    try {
      const patch: Partial<Task> = {
        title: draft.title,
        description: draft.description,
        status_id: draft.status_id,
        priority: draft.priority,
        progress: draft.progress ?? 0,
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
  const me = members.find((m) => m.id === currentUserId);
  const progress = draft.progress ?? 0;
  const hint = dueHint(draft.due_date);

  return (
    <aside
      style={{
        position: "relative",
        width,
        flexShrink: 0,
        borderLeft: "1px solid var(--border)",
        background: "var(--surface)",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
      }}
    >
      <ResizeHandle side="left" dragging={dragging} handleProps={handleProps} />
      {/* Header: editable title + at-a-glance status/priority summary */}
      <div style={{ flexShrink: 0, padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          <input
            className="title-input"
            value={draft.title}
            onChange={(e) => set("title", e.target.value)}
            aria-label="Task title"
          />
          <button className="icon-btn" onClick={onClose} title="Close" aria-label="Close panel">
            ✕
          </button>
        </div>
        <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <Pill color={currentStatus?.color || "var(--text-dim)"} dot>
            {currentStatus?.name || "No status"}
          </Pill>
          {draft.priority && draft.priority !== "none" && (
            <span className="row" style={{ gap: 6 }}>
              <PriorityBadge priority={draft.priority} />
              <span className="muted" style={{ fontSize: 12, textTransform: "capitalize" }}>{draft.priority}</span>
            </span>
          )}
          {hint && (
            <span style={{ fontSize: 12, fontWeight: 600, color: hint.color, marginLeft: "auto" }}>{hint.text}</span>
          )}
        </div>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 16 }}>
        <SectionLabel style={{ display: "block", marginBottom: 10 }}>People</SectionLabel>
        <div className="field">
          <label>Assignee</label>
          <div className="row" style={{ gap: 8 }}>
            {draft.assignee_id ? (
              <Avatar
                name={(() => {
                  const m = members.find((x) => x.id === draft.assignee_id);
                  return m ? memberLabel(m) : "Unknown";
                })()}
                seed={draft.assignee_id}
                size={30}
              />
            ) : (
              <span
                className="avatar"
                title="Unassigned"
                style={{ width: 30, height: 30, fontSize: 13, color: "var(--text-dim)", background: "var(--surface-2)", border: "1px dashed var(--border)" }}
              >
                ?
              </span>
            )}
            <select
              value={draft.assignee_id || ""}
              onChange={(e) => set("assignee_id", e.target.value || null)}
              style={{ flex: 1 }}
            >
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {memberLabel(m)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <SectionLabel style={{ display: "block", margin: "20px 0 10px" }}>Status &amp; progress</SectionLabel>
        <div className="row" style={{ gap: 12 }}>
          <div className="field" style={{ flex: 1 }}>
            <label>Status</label>
            <div className="select-lead">
              <span className="lead-dot">
                <Dot color={currentStatus?.color || "var(--border)"} />
              </span>
              <select value={draft.status_id || ""} onChange={(e) => setStatus(e.target.value || null)}>
                <option value="">—</option>
                {statuses.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
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
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
            <label style={{ margin: 0 }}>Progress</label>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                fontVariantNumeric: "tabular-nums",
                color: progress > 0 ? barColor : "var(--text-dim)",
              }}
            >
              {progress}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={progress}
            onChange={(e) => setProgress(Number(e.target.value))}
            aria-label="Task progress"
            style={{ width: "100%", padding: 0, border: "none", background: "transparent", accentColor: barColor, cursor: "pointer" }}
          />
          <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
            Linked to status: past 0% sets “In progress”, 100% sets “Done”.
          </div>
        </div>

        <SectionLabel style={{ display: "block", margin: "20px 0 10px" }}>Details</SectionLabel>
        <div className="field">
          <label>Description</label>
          <textarea
            rows={4}
            value={draft.description || ""}
            onChange={(e) => set("description", e.target.value)}
          />
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

        <SectionLabel style={{ display: "block", margin: "20px 0 10px" }}>Scheduling</SectionLabel>
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
            <label style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Due date</span>
              {hint && <span style={{ color: hint.color, fontWeight: 600 }}>{hint.text}</span>}
            </label>
            <input
              type="date"
              value={draft.due_date || ""}
              onChange={(e) => set("due_date", e.target.value || null)}
            />
          </div>
        </div>

        <div style={{ borderTop: "1px solid var(--border)", marginTop: 22, paddingTop: 16 }}>
          <SectionLabel style={{ display: "block", marginBottom: 12 }}>Comments</SectionLabel>
          <CommentThread
            key={task.id}
            currentUserId={currentUserId}
            currentUserName={me ? memberLabel(me) : undefined}
            load={() => api.comments.taskList(task.id)}
            add={(b) => api.comments.taskAdd(task.id, b)}
            remove={(id) => api.comments.taskDelete(task.id, id)}
          />
        </div>
      </div>

      {/* Sticky action footer */}
      <div style={{ flexShrink: 0, padding: "10px 16px", borderTop: "1px solid var(--border)", background: "var(--surface)" }}>
        {error && <p className="error" style={{ margin: "0 0 8px" }}>{error}</p>}
        <div className="row" style={{ justifyContent: "space-between" }}>
          <button className="danger" disabled={busy} onClick={remove}>
            Delete
          </button>
          <button className="primary" disabled={busy} onClick={save}>
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </aside>
  );
}
