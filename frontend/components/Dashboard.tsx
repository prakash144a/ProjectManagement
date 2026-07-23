"use client";

import { useEffect, useMemo, useState } from "react";
import { api, ApiError, DashboardData, Project, ProjectHealth } from "@/lib/api";
import { FilterBar, FilterOption } from "./FilterBar";
import { Card, Dot, Pill, SectionLabel, StatCard } from "./ui";

const HEALTH: Record<ProjectHealth["health"], { label: string; color: string }> = {
  on_track: { label: "On track", color: "#16a34a" },
  at_risk: { label: "At risk", color: "#d97706" },
  overdue: { label: "Overdue", color: "#dc2626" },
};

function pct(x: number): number {
  return Math.round(x * 100);
}

function Bar({ value, color }: { value: number; color?: string }) {
  return (
    <div style={{ height: 8, borderRadius: 999, background: "var(--surface-2)", overflow: "hidden" }}>
      <div style={{ width: `${value}%`, height: "100%", background: color || "var(--primary)" }} />
    </div>
  );
}

export function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [teamId, setTeamId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [teams, setTeams] = useState<FilterOption[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  // Filter option sources: every team/project the user can reach.
  useEffect(() => {
    api.teams
      .list("team")
      .then((ts) => setTeams(ts.map((t) => ({ id: t.id, name: t.name }))))
      .catch(() => {});
    api.projects.list().then(setProjects).catch(() => {});
  }, []);

  // Reload the aggregate whenever the scope changes.
  useEffect(() => {
    setData(null);
    setError("");
    api.metrics
      .dashboard({ teamId: teamId || undefined, projectId: projectId || undefined })
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Something went wrong"));
  }, [teamId, projectId]);

  const projectOptions = useMemo(
    () =>
      projects
        .filter((p) => !teamId || p.team_id === teamId)
        .map((p) => ({ id: p.id, name: p.name })),
    [projects, teamId],
  );

  const filters = (
    <FilterBar
      teams={teams}
      projects={projectOptions}
      teamId={teamId}
      projectId={projectId}
      onTeam={(id) => {
        setTeamId(id);
        setProjectId(null);
      }}
      onProject={setProjectId}
    />
  );

  if (error)
    return (
      <div style={{ padding: 24, width: "100%" }}>
        <h2 className="page-title">Dashboard</h2>
        {filters}
        <div className="error">{error}</div>
      </div>
    );
  if (!data)
    return (
      <div style={{ padding: 24, width: "100%" }}>
        <h2 className="page-title">Dashboard</h2>
        {filters}
        <div className="muted">Loading…</div>
      </div>
    );

  const maxThroughput = Math.max(1, ...data.throughput.map((t) => t.count));

  return (
    <div style={{ padding: 24, overflowY: "auto", height: "100%", width: "100%" }}>
      <h2 className="page-title" style={{ marginBottom: 2 }}>{data.scope_label} · Dashboard</h2>
      <p className="muted" style={{ marginTop: 0, marginBottom: 16 }}>
        {data.member_count} member{data.member_count === 1 ? "" : "s"} · {data.total_projects} project
        {data.total_projects === 1 ? "" : "s"}
      </p>

      {filters}

      {/* KPI row */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
        <StatCard label="Projects" value={data.total_projects} icon="📁" />
        <StatCard label="Tasks" value={data.total_tasks} icon="📋" />
        <StatCard
          label="Completed"
          value={`${pct(data.completion_rate)}%`}
          sub={`${data.tasks_completed} of ${data.total_tasks} done`}
          tone="#16a34a"
          icon="✅"
        />
        <StatCard
          label="Overdue"
          value={data.overdue}
          tone={data.overdue ? "#dc2626" : undefined}
          icon="⚠️"
        />
        <StatCard label="Due this week" value={data.due_this_week} icon="🗓️" />
        <StatCard label="Members" value={data.member_count} icon="👥" />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 24 }}>
        {/* Tasks by status */}
        <Card style={{ flex: 1, minWidth: 280, padding: 18 }}>
          <SectionLabel style={{ marginBottom: 14 }}>Tasks by status</SectionLabel>
          {data.tasks_by_status.length === 0 && <div className="muted" style={{ fontSize: 13 }}>No tasks yet.</div>}
          {data.tasks_by_status.map((s) => {
            const share = data.total_tasks ? s.count / data.total_tasks : 0;
            return (
              <div key={s.status_id || "none"} style={{ marginBottom: 12 }}>
                <div className="row" style={{ justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                    <Dot color={s.color || "var(--text-dim)"} />
                    {s.name}
                  </span>
                  <span className="muted" style={{ fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{s.count}</span>
                </div>
                <Bar value={pct(share)} color={s.color || undefined} />
              </div>
            );
          })}
        </Card>

        {/* Throughput: last 4 weeks */}
        <Card style={{ flex: 1, minWidth: 280, padding: 18 }}>
          <SectionLabel style={{ marginBottom: 14 }}>Completed per week (last 4 weeks)</SectionLabel>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 14, height: 130, padding: "6px 0" }}>
            {data.throughput.map((t) => (
              <div key={t.week_start} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{t.count}</div>
                <div
                  title={`Week of ${t.week_start}: ${t.count} completed`}
                  style={{
                    width: "70%",
                    height: `${(t.count / maxThroughput) * 90}px`,
                    minHeight: 3,
                    background: "var(--primary)",
                    borderRadius: "5px 5px 0 0",
                  }}
                />
                <div className="muted" style={{ fontSize: 11 }}>{t.week_start.slice(5)}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Projects with health + completion */}
      <SectionLabel style={{ marginBottom: 10 }}>Projects</SectionLabel>
      {data.projects.length === 0 ? (
        <div className="muted" style={{ fontSize: 13 }}>No projects in this scope yet.</div>
      ) : (
        <Card style={{ overflow: "hidden" }}>
          {data.projects.map((p, i) => {
            const h = HEALTH[p.health];
            return (
              <div
                key={p.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 16px",
                  borderTop: i === 0 ? "none" : "1px solid var(--border)",
                }}
              >
                <span style={{ flex: 1, minWidth: 0, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.name}
                </span>
                <Pill color={h.color} dot>
                  {h.label}
                </Pill>
                <div style={{ width: 150 }}>
                  <div className="muted" style={{ fontSize: 11, marginBottom: 4, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {p.done_count}/{p.task_count} · {pct(p.completion_rate)}%
                  </div>
                  <Bar value={pct(p.completion_rate)} color={h.color} />
                </div>
                <span className="muted" style={{ fontSize: 12, width: 110, textAlign: "right" }}>
                  {p.overdue_count > 0 && <span style={{ color: "#dc2626" }}>{p.overdue_count} overdue</span>}
                  {p.overdue_count > 0 && p.due_this_week > 0 && " · "}
                  {p.due_this_week > 0 && `${p.due_this_week} due`}
                </span>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
