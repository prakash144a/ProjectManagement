"use client";

import { useEffect, useMemo, useState } from "react";
import { api, ApiError, Member, MyTask, Status, Task, TaskGroup } from "@/lib/api";
import { FilterBar } from "./FilterBar";
import { TaskDetail } from "./TaskDetail";
import { PriorityBadge } from "./PriorityBadge";
import { Card, Pill, priorityColor, SectionLabel, StatCard } from "./ui";

// Local calendar date as YYYY-MM-DD. Because due_date is stored the same way,
// bucketing is plain string comparison — no timezone parsing needed.
function isoLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

const PRIORITY_ORDER = ["urgent", "high", "medium", "low", "none"] as const;

const BUCKETS = ["Past Due", "This Week", "This Month", "Future", "No due date"] as const;
type Bucket = (typeof BUCKETS)[number];

export function MyTasks({
  statuses,
  members,
  currentUserId,
}: {
  statuses: Status[];
  members: Member[];
  currentUserId: string;
}) {
  const [tasks, setTasks] = useState<MyTask[] | null>(null);
  const [error, setError] = useState("");
  const [teamId, setTeamId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [selected, setSelected] = useState<MyTask | null>(null);
  const [selectedGroups, setSelectedGroups] = useState<TaskGroup[]>([]);

  // Open the shared task panel; task groups are per-project, so fetch them.
  function selectTask(t: MyTask) {
    setSelected(t);
    setSelectedGroups([]);
    api.catalog.taskGroups(t.project_id).then(setSelectedGroups).catch(() => setSelectedGroups([]));
  }

  function handleSaved(updated: Task) {
    setTasks((prev) => {
      const list = prev || [];
      // If it's no longer assigned to me, it drops off "My Tasks".
      if (updated.assignee_id !== currentUserId) return list.filter((t) => t.id !== updated.id);
      return list.map((t) => (t.id === updated.id ? ({ ...t, ...updated } as MyTask) : t));
    });
    if (updated.assignee_id !== currentUserId) setSelected(null);
    else setSelected((cur) => (cur && cur.id === updated.id ? ({ ...cur, ...updated } as MyTask) : cur));
  }

  function handleDeleted(id: string) {
    setTasks((prev) => (prev || []).filter((t) => t.id !== id));
    setSelected(null);
  }

  useEffect(() => {
    api.metrics
      .myTasks()
      .then(setTasks)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Something went wrong"));
  }, []);

  const statusById = useMemo(() => new Map(statuses.map((s) => [s.id, s])), [statuses]);
  const isDone = (t: MyTask) =>
    !!t.completed_at || (t.status_id ? !!statusById.get(t.status_id)?.is_completed : false);

  // Filter options are derived from the tasks that are actually assigned to me:
  // the teams/projects where I have work. Project options cascade off the team.
  const teamOptions = useMemo(() => {
    const m = new Map<string, string>();
    (tasks || []).forEach((t) => m.set(t.team_id, t.team_name));
    return [...m].map(([id, name]) => ({ id, name }));
  }, [tasks]);
  const projectOptions = useMemo(() => {
    const m = new Map<string, string>();
    (tasks || [])
      .filter((t) => !teamId || t.team_id === teamId)
      .forEach((t) => m.set(t.project_id, t.project_name));
    return [...m].map(([id, name]) => ({ id, name }));
  }, [tasks, teamId]);

  const filtered = useMemo(
    () =>
      (tasks || []).filter(
        (t) => (!teamId || t.team_id === teamId) && (!projectId || t.project_id === projectId),
      ),
    [tasks, teamId, projectId],
  );

  const model = useMemo(() => {
    if (!tasks) return null;
    const now = new Date();
    const today = isoLocal(now);
    const dow = now.getDay(); // 0 = Sun
    const endOfWeek = isoLocal(addDays(now, dow === 0 ? 0 : 7 - dow)); // through Sunday
    const endOfMonth = isoLocal(new Date(now.getFullYear(), now.getMonth() + 1, 0));

    const open = filtered.filter((t) => !isDone(t));
    const doneCount = filtered.length - open.length;

    const buckets: Record<Bucket, MyTask[]> = {
      "Past Due": [],
      "This Week": [],
      "This Month": [],
      Future: [],
      "No due date": [],
    };
    for (const t of open) {
      const d = t.due_date;
      if (!d) buckets["No due date"].push(t);
      else if (d < today) buckets["Past Due"].push(t);
      else if (d <= endOfWeek) buckets["This Week"].push(t);
      else if (d <= endOfMonth) buckets["This Month"].push(t);
      else buckets["Future"].push(t);
    }

    const overdue = buckets["Past Due"].length;
    const dueToday = open.filter((t) => t.due_date === today).length;
    const dueThisWeek = buckets["This Week"].length;

    // Per-status counts across the filtered tasks (catalog order, then No status).
    const statusCounts = statuses
      .map((s) => ({ status: s, count: filtered.filter((t) => t.status_id === s.id).length }))
      .filter((x) => x.count > 0);
    const noStatus = filtered.filter((t) => !t.status_id).length;

    // Priority breakdown.
    const priorityCounts = PRIORITY_ORDER.map((p) => ({
      priority: p,
      count: filtered.filter((t) => (t.priority || "none") === p).length,
    })).filter((x) => x.count > 0);

    const completion = filtered.length ? Math.round((doneCount / filtered.length) * 100) : 0;

    return {
      total: filtered.length,
      doneCount,
      completion,
      overdue,
      dueToday,
      dueThisWeek,
      buckets,
      statusCounts,
      noStatus,
      priorityCounts,
    };
  }, [tasks, filtered, statuses]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <div style={{ padding: 24 }} className="error">{error}</div>;
  if (!model) return <div style={{ padding: 24 }} className="muted">Loading…</div>;

  return (
    <div style={{ display: "flex", flex: 1, minWidth: 0, height: "100%", width: "100%" }}>
      <div style={{ flex: 1, minWidth: 0, padding: 24, overflowY: "auto" }}>
        <h2 className="page-title">My Tasks</h2>

        <FilterBar
          teams={teamOptions}
          projects={projectOptions}
          teamId={teamId}
          projectId={projectId}
          onTeam={(id) => {
            setTeamId(id);
            setProjectId(null);
          }}
          onProject={setProjectId}
        />

        {/* KPI row */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 22 }}>
          <StatCard label="Total tasks" value={model.total} icon="📋" />
          <StatCard
            label="Completed"
            value={`${model.completion}%`}
            sub={`${model.doneCount} of ${model.total} done`}
            tone="#16a34a"
            icon="✅"
          />
          <StatCard
            label="Overdue"
            value={model.overdue}
            tone={model.overdue ? "#dc2626" : undefined}
            icon="⚠️"
          />
          <StatCard label="Due today" value={model.dueToday} icon="📅" />
          <StatCard label="Due this week" value={model.dueThisWeek} icon="🗓️" />
        </div>

        {/* Status + priority breakdowns */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 28, marginBottom: 24 }}>
          <div>
            <SectionLabel style={{ marginBottom: 8 }}>By status</SectionLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {model.statusCounts.map(({ status, count }) => (
                <Pill key={status.id} color={status.color || "var(--text-dim)"} dot>
                  {status.name} <strong>{count}</strong>
                </Pill>
              ))}
              {model.noStatus > 0 && (
                <Pill color="var(--text-dim)" dot>
                  No status <strong>{model.noStatus}</strong>
                </Pill>
              )}
              {model.statusCounts.length === 0 && model.noStatus === 0 && (
                <span className="muted" style={{ fontSize: 13 }}>No tasks.</span>
              )}
            </div>
          </div>
          <div>
            <SectionLabel style={{ marginBottom: 8 }}>By priority</SectionLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {model.priorityCounts.map(({ priority, count }) => (
                <Pill key={priority} color={priorityColor(priority)} dot style={{ textTransform: "capitalize" }}>
                  {priority} <strong>{count}</strong>
                </Pill>
              ))}
            </div>
          </div>
        </div>

        {/* Due-date buckets (open tasks only) */}
        {BUCKETS.map((b) => {
          const items = model.buckets[b];
          if (items.length === 0) return null;
          const overdue = b === "Past Due";
          return (
            <div key={b} style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontWeight: 600, color: overdue ? "#dc2626" : "var(--text)" }}>{b}</span>
                <span className="badge">{items.length}</span>
              </div>
              <Card style={{ overflow: "hidden" }}>
                {items.map((t, i) => {
                  const s = t.status_id ? statusById.get(t.status_id) : undefined;
                  return (
                    <div
                      key={t.id}
                      className="list-row"
                      onClick={() => selectTask(t)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 14px",
                        cursor: "pointer",
                        borderTop: i === 0 ? "none" : "1px solid var(--border)",
                        background: selected?.id === t.id ? "var(--surface-2)" : undefined,
                      }}
                    >
                      <PriorityBadge priority={t.priority} />
                      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {t.title}
                      </span>
                      <span className="muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                        {t.team_name} / {t.project_name}
                      </span>
                      {s && (
                        <Pill color={s.color || "var(--text-dim)"} dot>
                          {s.name}
                        </Pill>
                      )}
                      <span className="muted" style={{ fontSize: 12, width: 92, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {t.due_date || "—"}
                      </span>
                    </div>
                  );
                })}
              </Card>
            </div>
          );
        })}
      </div>

      {selected && (
        <TaskDetail
          task={selected}
          statuses={statuses}
          members={members}
          taskGroups={selectedGroups}
          currentUserId={currentUserId}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
