"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import { api, ApiError, DashboardData, Project, ProjectHealth } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { FilterBar, FilterOption } from "./FilterBar";
import { Avatar, Card, Delta, Dot, EmptyState, Pill, ProjectIcon, PROJECT_STATUS_META, SectionLabel, Skeleton, StatCard } from "./ui";

const HEALTH: Record<ProjectHealth["health"], { label: string; color: string }> = {
  on_track: { label: "On track", color: "#16a34a" },
  at_risk: { label: "At risk", color: "#d97706" },
  overdue: { label: "Overdue", color: "#dc2626" },
};

function pct(x: number): number {
  return Math.round(x * 100);
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function Bar({ value, color }: { value: number; color?: string }) {
  return (
    <div style={{ height: 8, borderRadius: 999, background: "var(--surface-2)", overflow: "hidden" }}>
      <div style={{ width: `${value}%`, height: "100%", background: color || "var(--primary)", transition: "width 0.4s var(--ease)" }} />
    </div>
  );
}

export function Dashboard({
  onOpenProject,
}: {
  // Navigate to a project's page. teamId is resolved here (dashboard projects can
  // span teams) so the parent can load that team's projects before selecting.
  onOpenProject?: (projectId: string, teamId: string) => void;
}) {
  const { user } = useAuth();
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

  const firstName = useMemo(() => {
    const n = user?.display_name || user?.username || user?.email || "";
    return n.split(/[\s@]/)[0] || "there";
  }, [user]);

  // Open a project's page. Look up its team from the full project list so the
  // parent can switch teams if needed. No-op if we can't resolve the team.
  const openProject = (projectId: string) => {
    const teamId = projects.find((p) => p.id === projectId)?.team_id;
    if (onOpenProject && teamId) onOpenProject(projectId, teamId);
  };
  const canOpen = (projectId: string) =>
    !!onOpenProject && projects.some((p) => p.id === projectId);

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

  const header = (
    <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
      <Avatar name={firstName} seed={user?.id || firstName} size={46} />
      <div style={{ minWidth: 0 }}>
        <h2 className="page-title" style={{ margin: 0 }}>
          {greeting()}, {firstName} 👋
        </h2>
        {data && (
          <p className="muted" style={{ margin: "2px 0 0" }}>
            {data.scope_label} · {data.member_count} member{data.member_count === 1 ? "" : "s"} ·{" "}
            {data.total_projects} project{data.total_projects === 1 ? "" : "s"}
          </p>
        )}
      </div>
    </div>
  );

  if (error)
    return (
      <div style={{ padding: 24, width: "100%" }}>
        {header}
        {filters}
        <div className="error">{error}</div>
      </div>
    );

  if (!data)
    return (
      <div style={{ padding: 24, width: "100%" }}>
        {header}
        {filters}
        <DashboardSkeleton />
      </div>
    );

  const maxThroughput = Math.max(1, ...data.throughput.map((t) => t.count));
  const t = data.trends;
  const attention = [...data.projects]
    .filter((p) => p.health === "overdue")
    .sort((a, b) => b.overdue_count - a.overdue_count)
    .slice(0, 5);
  const dueSoon = [...data.projects]
    .filter((p) => p.health === "at_risk")
    .sort((a, b) => b.due_this_week - a.due_this_week)
    .slice(0, 5);

  return (
    <div style={{ padding: 24, overflowY: "auto", height: "100%", width: "100%" }}>
      {header}
      {filters}

      {/* Two-column: main analytics + right-hand insights rail. */}
      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 520px", minWidth: 0 }}>
          {/* KPI row */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
            <StatCard label="Projects" value={data.total_projects} icon="📁" />
            <StatCard
              label="Tasks"
              value={data.total_tasks}
              icon="📋"
              sub={<Delta value={t.created_this_week - t.created_prev_week} suffix="new vs last wk" />}
            />
            <StatCard
              label="Completed"
              value={`${pct(data.completion_rate)}%`}
              tone="#16a34a"
              icon="✅"
              sub={
                <>
                  <span>{data.tasks_completed} of {data.total_tasks} done</span>
                  <Delta value={t.completed_this_week - t.completed_prev_week} suffix="vs last wk" />
                </>
              }
            />
            <StatCard
              label="Overdue"
              value={data.overdue}
              tone={data.overdue ? "#dc2626" : undefined}
              icon="⚠️"
            />
            <StatCard label="Due this week" value={data.due_this_week} icon="🗓️" />
          </div>

          {/* Tasks by status */}
          <Card style={{ padding: 18, marginBottom: 16 }}>
            <SectionLabel style={{ marginBottom: 14 }}>Tasks by status</SectionLabel>
            {data.tasks_by_status.length === 0 ? (
              <EmptyState emoji="🗒️" title="No tasks yet" desc="Tasks will appear here as your team creates them." />
            ) : (
              data.tasks_by_status.map((s) => {
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
              })
            )}
          </Card>

          {/* Throughput: last 4 weeks */}
          <Card style={{ padding: 18, marginBottom: 16 }}>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
              <SectionLabel>Completed per week (last 4 weeks)</SectionLabel>
              <Delta value={t.completed_this_week - t.completed_prev_week} suffix="vs last wk" />
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 14, height: 130, padding: "6px 0" }}>
              {data.throughput.map((tp, i) => {
                const isCurrent = i === data.throughput.length - 1;
                return (
                  <div key={tp.week_start} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{tp.count}</div>
                    <div
                      title={`Week of ${tp.week_start}: ${tp.count} completed`}
                      style={{
                        width: "70%",
                        height: `${(tp.count / maxThroughput) * 90}px`,
                        minHeight: 3,
                        background: isCurrent ? "var(--primary)" : "color-mix(in srgb, var(--primary) 45%, transparent)",
                        borderRadius: "5px 5px 0 0",
                        transition: "height 0.4s var(--ease)",
                      }}
                    />
                    <div className="muted" style={{ fontSize: 11 }}>{tp.week_start.slice(5)}</div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Projects with health + completion */}
          <SectionLabel style={{ marginBottom: 10 }}>Projects</SectionLabel>
          {data.projects.length === 0 ? (
            <Card>
              <EmptyState emoji="📁" title="No projects in this scope" desc="Create a project to start tracking work here." />
            </Card>
          ) : (
            <Card style={{ overflow: "hidden" }}>
              {data.projects.map((p, i) => {
                const h = HEALTH[p.health];
                const sm = PROJECT_STATUS_META[p.status] || PROJECT_STATUS_META.not_started;
                const progress = p.progress ?? 0;
                const clickable = canOpen(p.id);
                return (
                  <div
                    key={p.id}
                    className="list-row"
                    role={clickable ? "button" : undefined}
                    tabIndex={clickable ? 0 : undefined}
                    title={clickable ? `Open ${p.name}` : undefined}
                    onClick={clickable ? () => openProject(p.id) : undefined}
                    onKeyDown={
                      clickable
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              openProject(p.id);
                            }
                          }
                        : undefined
                    }
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "12px 16px",
                      borderTop: i === 0 ? "none" : "1px solid var(--border)",
                      cursor: clickable ? "pointer" : "default",
                    }}
                  >
                    <ProjectIcon seed={p.id} size={26} />
                    <span style={{ flex: 1, minWidth: 0, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.name}
                    </span>
                    <Pill color={sm.color} dot title="Project status (rolled up from its tasks)">
                      {sm.label}
                    </Pill>
                    <div style={{ width: 150 }}>
                      <div className="muted" style={{ fontSize: 11, marginBottom: 4, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {p.done_count}/{p.task_count} done · {progress}%
                      </div>
                      <Bar value={progress} color={h.color} />
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

        {/* Insights rail */}
        <div style={{ flex: "1 1 260px", minWidth: 240, maxWidth: 360, display: "flex", flexDirection: "column", gap: 16 }}>
          <Card style={{ padding: 18 }}>
            <SectionLabel style={{ marginBottom: 12 }}>Needs attention</SectionLabel>
            {attention.length === 0 ? (
              <EmptyState emoji="✅" title="All clear" desc="No projects are overdue right now." />
            ) : (
              attention.map((p) => (
                <InsightProjectRow
                  key={p.id}
                  seed={p.id}
                  name={p.name}
                  pill={<Pill color="#dc2626">{p.overdue_count} overdue</Pill>}
                  clickable={canOpen(p.id)}
                  onOpen={() => openProject(p.id)}
                />
              ))
            )}
          </Card>

          <Card style={{ padding: 18 }}>
            <SectionLabel style={{ marginBottom: 12 }}>This week</SectionLabel>
            <InsightRow label="Completed" value={t.completed_this_week} delta={t.completed_this_week - t.completed_prev_week} />
            <InsightRow label="Created" value={t.created_this_week} delta={t.created_this_week - t.created_prev_week} />
            <InsightRow label="Due this week" value={data.due_this_week} />
            <InsightRow label="Overdue" value={data.overdue} delta={undefined} tone={data.overdue ? "#dc2626" : undefined} />
          </Card>

          {dueSoon.length > 0 && (
            <Card style={{ padding: 18 }}>
              <SectionLabel style={{ marginBottom: 12 }}>Watch this week</SectionLabel>
              {dueSoon.map((p) => (
                <InsightProjectRow
                  key={p.id}
                  seed={p.id}
                  name={p.name}
                  pill={<Pill color="#d97706">{p.due_this_week} due</Pill>}
                  clickable={canOpen(p.id)}
                  onOpen={() => openProject(p.id)}
                />
              ))}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function InsightProjectRow({
  seed,
  name,
  pill,
  clickable,
  onOpen,
}: {
  seed: string;
  name: string;
  pill: ReactNode;
  clickable: boolean;
  onOpen: () => void;
}) {
  return (
    <div
      className="list-row"
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      title={clickable ? `Open ${name}` : undefined}
      onClick={clickable ? onOpen : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen();
              }
            }
          : undefined
      }
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        padding: "7px 8px",
        margin: "0 -8px",
        borderRadius: 8,
        cursor: clickable ? "pointer" : "default",
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <ProjectIcon seed={seed} size={22} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
      </span>
      {pill}
    </div>
  );
}

function InsightRow({
  label,
  value,
  delta,
  tone,
}: {
  label: string;
  value: number;
  delta?: number;
  tone?: string;
}) {
  return (
    <div className="row" style={{ justifyContent: "space-between", padding: "6px 0" }}>
      <span className="muted" style={{ fontSize: 13 }}>{label}</span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        {delta !== undefined && delta !== 0 && <Delta value={delta} />}
        <strong style={{ fontVariantNumeric: "tabular-nums", color: tone || "var(--text)" }}>{value}</strong>
      </span>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 520px", minWidth: 0 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} style={{ padding: "14px 16px", minWidth: 130, flex: "1 1 130px" }}>
              <Skeleton w={70} h={10} />
              <Skeleton w={54} h={24} style={{ marginTop: 12 }} />
              <Skeleton w={90} h={10} style={{ marginTop: 10 }} />
            </Card>
          ))}
        </div>
        {[0, 1].map((i) => (
          <Card key={i} style={{ padding: 18, marginBottom: 16 }}>
            <Skeleton w={160} h={11} />
            <Skeleton h={110} style={{ marginTop: 16 }} />
          </Card>
        ))}
      </div>
      <div style={{ flex: "1 1 260px", minWidth: 240, maxWidth: 360, display: "flex", flexDirection: "column", gap: 16 }}>
        {[0, 1].map((i) => (
          <Card key={i} style={{ padding: 18 }}>
            <Skeleton w={120} h={11} />
            {Array.from({ length: 4 }).map((_, j) => (
              <Skeleton key={j} h={12} style={{ marginTop: 14 }} />
            ))}
          </Card>
        ))}
      </div>
    </div>
  );
}
