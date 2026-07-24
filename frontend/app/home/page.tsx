"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  api,
  Member,
  Org,
  Project,
  ProjectStatus,
  Status,
  store,
  Task,
  TaskGroup,
  Team,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Pill, ProgressBar, PROJECT_STATUS_META } from "@/components/ui";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { TaskList } from "@/components/TaskList";
import { Kanban } from "@/components/Kanban";
import { Gantt } from "@/components/Gantt";
import { TaskDetail } from "@/components/TaskDetail";
import { SettingsPanel } from "@/components/SettingsPanel";
import { CommentThread } from "@/components/CommentThread";
import { ProjectSecurity } from "@/components/ProjectSecurity";
import { MyTasks } from "@/components/MyTasks";
import { Dashboard } from "@/components/Dashboard";
import { ChatWidget } from "@/components/ChatWidget";

// Mirror the backend ordering: rank ascending, unranked tasks last, then created_at.
function sortByRank(arr: Task[]): Task[] {
  return [...arr].sort((a, b) => {
    if (a.rank == null && b.rank == null) return a.created_at < b.created_at ? -1 : 1;
    if (a.rank == null) return 1;
    if (b.rank == null) return -1;
    if (a.rank !== b.rank) return a.rank < b.rank ? -1 : 1;
    return a.created_at < b.created_at ? -1 : 1;
  });
}

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [collapsed, setCollapsed] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState<"tasks" | "settings" | "mytasks" | "dashboard">("tasks");
  const [projectView, setProjectView] = useState<
    "list" | "kanban" | "gantt" | "discussions"
  >("list");
  const [showSecurity, setShowSecurity] = useState(false);

  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  // When navigating to a project in a different team (e.g. from the Dashboard),
  // hold the target here until that team's projects finish loading, then select.
  const pendingProjectRef = useRef<string | null>(null);

  const [statuses, setStatuses] = useState<Status[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [taskGroups, setTaskGroups] = useState<TaskGroup[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const fail = useCallback((e: unknown) => {
    setError(e instanceof Error ? e.message : "Something went wrong");
  }, []);

  // Redirect unauthenticated users.
  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  // Load orgs once authenticated; restore last-selected org.
  useEffect(() => {
    if (!user) return;
    api.orgs
      .list()
      .then((list) => {
        setOrgs(list);
        const saved = store.getOrg();
        if (saved && list.some((o) => o.id === saved)) setOrgId(saved);
      })
      .catch(fail);
  }, [user, fail]);

  // Org selected -> set tenant context, load teams + catalogs.
  useEffect(() => {
    if (!orgId) return;
    store.setOrg(orgId);
    setTeamId(null);
    setProjects([]);
    setProjectId(null);
    setTasks([]);
    setSelectedTask(null);
    Promise.all([api.teams.list("team"), api.catalog.statuses(), api.catalog.members()])
      .then(([tm, st, mem]) => {
        setTeams(tm);
        setStatuses(st);
        setMembers(mem);
        // Restore the last-used team for this org, if it still exists.
        const savedTeam = store.getTeam(orgId);
        if (savedTeam && tm.some((t) => t.id === savedTeam)) setTeamId(savedTeam);
      })
      .catch(fail);
  }, [orgId, fail]);

  // Persist the selected team per org so it restores on next load.
  useEffect(() => {
    if (orgId && teamId) store.setTeam(orgId, teamId);
  }, [orgId, teamId]);

  // Team selected -> load its projects. If a navigation to a specific project in
  // this team is pending (from the Dashboard), select it once projects load.
  useEffect(() => {
    if (!teamId) return;
    setProjectId(null);
    setTasks([]);
    setSelectedTask(null);
    api.projects
      .list(teamId)
      .then((ps) => {
        setProjects(ps);
        const pending = pendingProjectRef.current;
        if (pending && ps.some((p) => p.id === pending)) {
          setProjectId(pending);
        }
        pendingProjectRef.current = null;
      })
      .catch(fail);
  }, [teamId, fail]);

  // Project selected -> load its tasks + task groups.
  useEffect(() => {
    if (!projectId) return;
    setSelectedTask(null);
    Promise.all([api.tasks.list(projectId), api.catalog.taskGroups(projectId)])
      .then(([tk, groups]) => {
        setTasks(tk);
        setTaskGroups(groups);
      })
      .catch(fail);
  }, [projectId, fail]);

  // --- create handlers ---
  const createOrg = async (name: string) => {
    const org = await api.orgs.create(name);
    setOrgs((o) => [...o, org]);
    setOrgId(org.id);
  };
  const createTeam = async (name: string) => {
    const team = await api.teams.create({ name, type: "team" });
    setTeams((t) => [...t, team]);
    setTeamId(team.id);
  };
  const createProject = async (name: string) => {
    if (!teamId) return;
    const p = await api.projects.create(teamId, name);
    setProjects((ps) => [...ps, p]);
    setProjectId(p.id);
  };
  const createTask = async (title: string, groupId: string | null) => {
    if (!projectId) return;
    const t = await api.tasks.create({
      project_id: projectId,
      title,
      project_task_group_id: groupId,
    });
    setTasks((ts) => [...ts, t]);
  };
  const createTaskGroup = async (name: string) => {
    if (!projectId) return;
    const g = await api.catalog.createTaskGroup(projectId, name);
    setTaskGroups((gs) => [...gs, g]);
  };
  const createTaskInStatus = async (title: string, statusId: string) => {
    if (!projectId) return;
    const t = await api.tasks.create({ project_id: projectId, title, status_id: statusId });
    setTasks((ts) => [...ts, t]);
  };
  const rescheduleTask = async (taskId: string, startISO: string, dueISO: string) => {
    const updated = await api.tasks.update(taskId, { start_date: startISO, due_date: dueISO });
    setTasks((ts) => ts.map((x) => (x.id === updated.id ? updated : x)));
    setSelectedTask((cur) => (cur?.id === updated.id ? updated : cur));
  };
  const moveTask = async (taskId: string, statusId: string) => {
    const updated = await api.tasks.update(taskId, { status_id: statusId });
    setTasks((ts) => ts.map((t) => (t.id === updated.id ? updated : t)));
    setSelectedTask((cur) => (cur?.id === updated.id ? updated : cur));
  };
  const reorderTasks = async (groupId: string | null, orderedIds: string[]) => {
    if (!projectId) return;
    // optimistic: apply group + rank, then sort like the backend (rank asc, nulls last).
    setTasks((prev) => {
      const byId = new Map(prev.map((t) => [t.id, t]));
      orderedIds.forEach((id, i) => {
        const t = byId.get(id);
        if (t) byId.set(id, { ...t, project_task_group_id: groupId, rank: String(i).padStart(6, "0") });
      });
      return sortByRank([...byId.values()]);
    });
    try {
      const fresh = await api.tasks.reorder(projectId, groupId, orderedIds);
      setTasks(fresh);
      setSelectedTask((cur) => (cur ? fresh.find((t) => t.id === cur.id) ?? cur : null));
    } catch (e) {
      fail(e);
      api.tasks.list(projectId).then(setTasks).catch(fail);
    }
  };

  // Navigate to a project's page from anywhere (e.g. the Dashboard). Switches
  // team first if needed; the team-load effect then applies the pending select.
  const openProject = useCallback(
    (targetProjectId: string, targetTeamId: string) => {
      setShowSecurity(false);
      setView("tasks");
      if (targetTeamId && targetTeamId !== teamId) {
        pendingProjectRef.current = targetProjectId;
        setTeamId(targetTeamId);
      } else {
        setProjectId(targetProjectId);
      }
    },
    [teamId],
  );

  const onTaskSaved = (updated: Task) => {
    setTasks((ts) => ts.map((t) => (t.id === updated.id ? updated : t)));
    setSelectedTask(updated);
  };
  const onTaskDeleted = (id: string) => {
    setTasks((ts) => ts.filter((t) => t.id !== id));
    setSelectedTask(null);
  };

  if (loading || !user) {
    return <div style={{ padding: 40 }} className="muted">Loading…</div>;
  }

  const org = orgs.find((o) => o.id === orgId) || null;
  const project = projects.find((p) => p.id === projectId) || null;

  // Derived project status + progress (rolled up from the loaded tasks), shown
  // in the project header. Cheap enough to compute inline each render.
  const projectRollup = project
    ? (() => {
        const total = tasks.length;
        const done = tasks.filter((t) => {
          const s = t.status_id ? statuses.find((x) => x.id === t.status_id) : undefined;
          return !!t.completed_at || !!s?.is_completed;
        }).length;
        const progress = total
          ? Math.round(tasks.reduce((a, t) => a + (t.progress || 0), 0) / total)
          : 0;
        const status: ProjectStatus =
          total === 0 ? "not_started" : done === total ? "done" : "in_progress";
        return { total, done, progress, status };
      })()
    : null;
  const title =
    view === "settings"
      ? "Settings"
      : view === "mytasks"
        ? "My Tasks"
        : view === "dashboard"
          ? "Dashboard"
          : project
            ? project.name
            : orgId
              ? "Select a project"
              : "Select an organization";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <Header
        onToggleSidebar={() => setCollapsed((c) => !c)}
        title={title}
        titleSeed={view === "tasks" && project ? project.id : null}
        titleEmoji={
          view === "mytasks"
            ? "🎯"
            : view === "dashboard"
              ? "📊"
              : view === "settings"
                ? "⚙️"
                : null
        }
        orgId={orgId}
      />
      {error && (
        <div
          style={{ background: "var(--danger)", color: "#fff", padding: "6px 16px", fontSize: 13 }}
          onClick={() => setError("")}
        >
          {error} (click to dismiss)
        </div>
      )}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <Sidebar
          collapsed={collapsed}
          orgs={orgs}
          selectedOrgId={orgId}
          onSelectOrg={setOrgId}
          onCreateOrg={createOrg}
          teams={teams}
          selectedTeamId={teamId}
          onSelectTeam={setTeamId}
          onCreateTeam={createTeam}
          projects={projects}
          selectedProjectId={projectId}
          onSelectProject={(id) => {
            setProjectId(id);
            setShowSecurity(false);
            setView("tasks");
          }}
          onCreateProject={createProject}
          onOpenMyTasks={() => setView("mytasks")}
          myTasksActive={view === "mytasks"}
          onOpenDashboard={() => setView("dashboard")}
          dashboardActive={view === "dashboard"}
          onOpenSettings={() => setView("settings")}
          settingsActive={view === "settings"}
        />

        <main style={{ flex: 1, minWidth: 0, display: "flex" }}>
          {view === "settings" ? (
            orgId ? (
              <SettingsPanel key={orgId} orgName={org?.name || ""} />
            ) : (
              <div style={{ padding: 40 }} className="muted">
                Select an organization to manage its settings.
              </div>
            )
          ) : view === "mytasks" ? (
            orgId ? (
              <MyTasks
                key={orgId}
                statuses={statuses}
                members={members}
                currentUserId={user.id}
              />
            ) : (
              <div style={{ padding: 40 }} className="muted">
                Select an organization to see your tasks.
              </div>
            )
          ) : view === "dashboard" ? (
            orgId ? (
              <Dashboard key={orgId} onOpenProject={openProject} />
            ) : (
              <div style={{ padding: 40 }} className="muted">
                Select an organization to see the dashboard.
              </div>
            )
          ) : project ? (
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "8px 16px 0",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <div style={{ display: "flex", gap: 4, flex: 1 }}>
                  {(["list", "kanban", "gantt", "discussions"] as const).map((v) => {
                    const active = projectView === v && !showSecurity;
                    return (
                      <button
                        key={v}
                        onClick={() => {
                          setProjectView(v);
                          setShowSecurity(false);
                        }}
                        style={{
                          border: "none",
                          borderBottom: `2px solid ${active ? "var(--primary)" : "transparent"}`,
                          borderRadius: 0,
                          background: "transparent",
                          fontWeight: active ? 600 : 400,
                          textTransform: "capitalize",
                        }}
                      >
                        {v}
                      </button>
                    );
                  })}
                </div>
                {projectRollup && !showSecurity && (
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 6, marginRight: 12 }}
                    title={`${projectRollup.done}/${projectRollup.total} tasks done · ${projectRollup.progress}% avg progress`}
                  >
                    <Pill color={PROJECT_STATUS_META[projectRollup.status].color} dot>
                      {PROJECT_STATUS_META[projectRollup.status].label}
                    </Pill>
                    <div style={{ width: 130, display: "flex", alignItems: "center", gap: 7 }}>
                      <ProgressBar
                        value={projectRollup.progress}
                        height={6}
                        color={PROJECT_STATUS_META[projectRollup.status].color}
                        style={{ flex: 1 }}
                      />
                      <span
                        className="muted"
                        style={{ fontSize: 11, fontVariantNumeric: "tabular-nums", width: 30, textAlign: "right" }}
                      >
                        {projectRollup.progress}%
                      </span>
                    </div>
                  </div>
                )}
                <button
                  onClick={() => setShowSecurity((s) => !s)}
                  title="Security"
                  aria-pressed={showSecurity}
                  style={{
                    border: "none",
                    borderRadius: 6,
                    background: showSecurity ? "var(--surface-2)" : "transparent",
                    padding: "4px 8px",
                    fontSize: 15,
                  }}
                >
                  🔒
                </button>
              </div>
              <div style={{ flex: 1, minHeight: 0 }}>
                {showSecurity ? (
                  <ProjectSecurity key={project.id} projectId={project.id} />
                ) : projectView === "list" ? (
                  <TaskList
                    tasks={tasks}
                    statuses={statuses}
                    taskGroups={taskGroups}
                    selectedTaskId={selectedTask?.id || null}
                    onSelectTask={setSelectedTask}
                    onCreateTask={createTask}
                    onCreateTaskGroup={createTaskGroup}
                    onReorder={reorderTasks}
                  />
                ) : projectView === "kanban" ? (
                  <Kanban
                    tasks={tasks}
                    statuses={statuses}
                    selectedTaskId={selectedTask?.id || null}
                    onSelectTask={setSelectedTask}
                    onMoveTask={moveTask}
                    onCreateTask={createTaskInStatus}
                  />
                ) : projectView === "gantt" ? (
                  <Gantt
                    tasks={tasks}
                    statuses={statuses}
                    onSelectTask={setSelectedTask}
                    onReschedule={rescheduleTask}
                  />
                ) : projectView === "discussions" ? (
                  <div style={{ padding: 24, maxWidth: 760, overflowY: "auto", height: "100%" }}>
                    <h2 className="page-title">Discussions</h2>
                    <CommentThread
                      key={project.id}
                      currentUserId={user.id}
                      currentUserName={user.display_name || user.username || user.email || undefined}
                      load={() => api.comments.projectList(project.id)}
                      add={(b) => api.comments.projectAdd(project.id, b)}
                      remove={(id) => api.comments.projectDelete(project.id, id)}
                      emptyText="No discussion yet. Start the conversation."
                    />
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <div style={{ padding: 40 }} className="muted">
              {orgId
                ? "Pick or create a team and project from the left."
                : "Pick or create an organization from the left to get started."}
            </div>
          )}

          {view === "tasks" && project && selectedTask && (
            <TaskDetail
              task={selectedTask}
              statuses={statuses}
              members={members}
              taskGroups={taskGroups}
              currentUserId={user.id}
              onSaved={onTaskSaved}
              onDeleted={onTaskDeleted}
              onClose={() => setSelectedTask(null)}
            />
          )}
        </main>
      </div>

      {orgId && <ChatWidget key={orgId} orgId={orgId} />}
    </div>
  );
}
