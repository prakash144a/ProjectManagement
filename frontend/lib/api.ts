// Typed client for the Phase-1 REST API. Runs in the browser; attaches the
// session token (Bearer) and the selected org (X-Org-Id) from localStorage.

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

const TOKEN_KEY = "pm_token";
const ORG_KEY = "pm_org";
const TEAM_KEY = "pm_team"; // per-org: `${TEAM_KEY}:${orgId}`

export type UUID = string;

export interface User {
  id: UUID;
  username: string | null;
  email: string | null;
  mobile: string | null;
  display_name: string | null;
}

export interface Org {
  id: UUID;
  name: string;
  created_at: string;
}

// A Team (type "team") is a project container whose members inherit its
// projects; a Group (type "group") is permission-only. Same backend entity.
export interface Team {
  id: UUID;
  organization_id: UUID;
  name: string;
  type: "team" | "group";
  created_at: string;
}

export interface TeamMember {
  id: UUID;
  display_name: string | null;
  email: string | null;
  username: string | null;
  role: "owner" | "member";
}

export const MEMBER_ROLES = ["owner", "member"] as const;

export interface Project {
  id: UUID;
  organization_id: UUID;
  team_id: UUID;
  name: string;
  description: string | null;
  created_at: string;
}

export interface Status {
  id: UUID;
  name: string;
  position: number;
  is_completed: boolean;
  is_default: boolean;
  color: string | null;
}

export interface TaskGroup {
  id: UUID;
  project_id: UUID;
  definition_id: UUID | null;
  name: string;
  position: number;
}

export interface TaskGroupDef {
  id: UUID;
  name: string;
  is_default: boolean;
  position: number;
}

export interface Member {
  id: UUID;
  display_name: string | null;
  email: string | null;
  username: string | null;
  mobile: string | null;
  role: string | null;
}

export const ROLES = ["owner", "admin", "member", "viewer"] as const;

export interface Group {
  id: UUID;
  name: string;
  type: string;
}

export interface Grant {
  id: UUID;
  principal_type: string;
  principal_id: UUID | null;
  principal_name: string | null;
  role: string;
}

export const PROJECT_ROLES = ["admin", "member", "viewer"] as const;

export interface AppNotification {
  id: UUID;
  type: string;
  ref_type: string | null;
  ref_id: UUID | null;
  is_read: boolean;
  created_at: string;
}

export interface Comment {
  id: UUID;
  body: string;
  author_id: UUID | null;
  author_name: string | null;
  created_at: string;
}

export interface Task {
  id: UUID;
  organization_id: UUID;
  project_id: UUID;
  project_task_group_id: UUID | null;
  title: string;
  description: string | null;
  status_id: UUID | null;
  priority: string;
  progress: number; // self-reported completion 0..100 (100 when in a done status)
  assignee_id: UUID | null;
  created_by: UUID | null;
  rank: string | null;
  start_date: string | null;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

// A task assigned to me, enriched with where it lives (My Tasks spans projects).
export interface MyTask extends Task {
  team_id: UUID;
  project_name: string;
  team_name: string;
}

// --- team Dashboard ---
export interface StatusCount {
  status_id: UUID | null;
  name: string;
  color: string | null;
  is_completed: boolean;
  count: number;
}

export interface ThroughputPoint {
  week_start: string;
  count: number;
}

export type ProjectStatus = "not_started" | "in_progress" | "done";

export interface ProjectHealth {
  id: UUID;
  name: string;
  task_count: number;
  done_count: number;
  completion_rate: number;
  progress: number; // avg of task progress bars, 0..100
  status: ProjectStatus; // derived rollup
  overdue_count: number;
  due_this_week: number;
  health: "on_track" | "at_risk" | "overdue";
}

export interface DashboardTrends {
  completed_this_week: number;
  completed_prev_week: number;
  created_this_week: number;
  created_prev_week: number;
}

export interface DashboardData {
  scope_label: string;
  member_count: number;
  total_projects: number;
  total_tasks: number;
  tasks_completed: number;
  completion_rate: number;
  overdue: number;
  due_this_week: number;
  tasks_by_status: StatusCount[];
  throughput: ThroughputPoint[];
  projects: ProjectHealth[];
  trends: DashboardTrends;
}

// --- personal access tokens (MCP) ---
export interface ApiToken {
  id: UUID;
  name: string | null;
  created_at: string;
  last_used_at: string | null;
  expires_at: string;
}
export interface ApiTokenCreated extends ApiToken {
  token: string; // shown once
}

// --- chat agent ---
export interface ChatAction {
  tool: string;
  ok: boolean;
}

export interface ChatReply {
  reply: string;
  actions: ChatAction[];
  conversation_id: UUID;
  title: string | null;
}

export interface ChatConversation {
  id: UUID;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatMessageRow {
  id: UUID;
  role: "user" | "assistant";
  content: string;
  actions: ChatAction[] | null;
  created_at: string;
}

export interface Session {
  token: string;
  expires_at: string;
  user_id: UUID;
}

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// --- token / org helpers (localStorage) ---
export const store = {
  getToken: () => (typeof window === "undefined" ? null : localStorage.getItem(TOKEN_KEY)),
  setToken: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clearToken: () => localStorage.removeItem(TOKEN_KEY),
  getOrg: () => (typeof window === "undefined" ? null : localStorage.getItem(ORG_KEY)),
  setOrg: (id: string) => localStorage.setItem(ORG_KEY, id),
  clearOrg: () => localStorage.removeItem(ORG_KEY),
  // Remember the last-used team per org so it restores on reload.
  getTeam: (orgId: string) =>
    typeof window === "undefined" ? null : localStorage.getItem(`${TEAM_KEY}:${orgId}`),
  setTeam: (orgId: string, id: string) => localStorage.setItem(`${TEAM_KEY}:${orgId}`, id),
};

async function request<T>(
  method: string,
  path: string,
  opts: { body?: unknown; org?: string | null } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  const token = store.getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const org = opts.org !== undefined ? opts.org : store.getOrg();
  if (org) headers["X-Org-Id"] = org;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  let data: any = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const code = data?.error?.code || "error";
    const message = data?.error?.message || data?.detail || res.statusText;
    throw new ApiError(res.status, code, typeof message === "string" ? message : "Request failed");
  }
  return data as T;
}

export const api = {
  auth: {
    requestCode: (identifier: string, channel?: "email" | "sms") =>
      request<{ sent: boolean; channel: string; target_hint: string; dev_code: string | null }>(
        "POST",
        "/auth/request-code",
        { body: { identifier, channel } },
      ),
    verify: (identifier: string, code: string) =>
      request<Session>("POST", "/auth/verify", { body: { identifier, code } }),
    me: () => request<User>("GET", "/auth/me"),
    logout: () => request<{ ok: boolean }>("POST", "/auth/logout"),
  },
  orgs: {
    list: () => request<Org[]>("GET", "/organizations"),
    create: (name: string) => request<Org>("POST", "/organizations", { body: { name } }),
  },
  teams: {
    list: (type?: "team" | "group") =>
      request<Team[]>("GET", `/teams${type ? `?type=${type}` : ""}`),
    create: (payload: {
      name: string;
      type: "team" | "group";
      members?: { user_id: string; role: string }[];
    }) => request<Team>("POST", "/teams", { body: payload }),
    remove: (id: string) => request<void>("DELETE", `/teams/${id}`),
    members: (teamId: string) =>
      request<TeamMember[]>("GET", `/teams/${teamId}/members`),
    addMember: (teamId: string, user_id: string, role: string) =>
      request<TeamMember>("POST", `/teams/${teamId}/members`, { body: { user_id, role } }),
    setMemberRole: (teamId: string, userId: string, role: string) =>
      request<TeamMember>("PATCH", `/teams/${teamId}/members/${userId}`, { body: { role } }),
    removeMember: (teamId: string, userId: string) =>
      request<void>("DELETE", `/teams/${teamId}/members/${userId}`),
  },
  projects: {
    list: (teamId?: string) =>
      request<Project[]>("GET", `/projects${teamId ? `?team_id=${teamId}` : ""}`),
    create: (teamId: string, name: string, description?: string) =>
      request<Project>("POST", "/projects", {
        body: { team_id: teamId, name, description },
      }),
  },
  tasks: {
    list: (projectId: string) => request<Task[]>("GET", `/projects/${projectId}/tasks`),
    create: (payload: Partial<Task> & { project_id: string; title: string }) =>
      request<Task>("POST", "/tasks", { body: payload }),
    update: (id: string, patch: Partial<Task>) =>
      request<Task>("PATCH", `/tasks/${id}`, { body: patch }),
    remove: (id: string) => request<void>("DELETE", `/tasks/${id}?confirm=true`),
    reorder: (projectId: string, groupId: string | null, taskIds: string[]) =>
      request<Task[]>("POST", `/projects/${projectId}/tasks/reorder`, {
        body: { group_id: groupId, task_ids: taskIds },
      }),
  },
  catalog: {
    statuses: () => request<Status[]>("GET", "/statuses"),
    members: () => request<Member[]>("GET", "/members"),
    taskGroups: (projectId: string) =>
      request<TaskGroup[]>("GET", `/projects/${projectId}/task-groups`),
    createTaskGroup: (projectId: string, name: string) =>
      request<TaskGroup>("POST", `/projects/${projectId}/task-groups`, { body: { name } }),
    definitions: () => request<TaskGroupDef[]>("GET", "/task-group-definitions"),
    createDefinition: (name: string, is_default: boolean) =>
      request<TaskGroupDef>("POST", "/task-group-definitions", { body: { name, is_default } }),
    updateDefinition: (id: string, patch: { name?: string; is_default?: boolean }) =>
      request<TaskGroupDef>("PATCH", `/task-group-definitions/${id}`, { body: patch }),
    deleteDefinition: (id: string) =>
      request<void>("DELETE", `/task-group-definitions/${id}?confirm=true`),
  },
  statuses: {
    list: () => request<Status[]>("GET", "/statuses"),
    create: (payload: {
      name: string;
      color?: string | null;
      is_completed?: boolean;
      is_default?: boolean;
    }) => request<Status>("POST", "/statuses", { body: payload }),
    update: (
      id: string,
      patch: { name?: string; color?: string | null; is_completed?: boolean; is_default?: boolean },
    ) => request<Status>("PATCH", `/statuses/${id}`, { body: patch }),
    reorder: (ids: string[]) =>
      request<Status[]>("POST", "/statuses/reorder", { body: { ids } }),
    remove: (id: string) => request<void>("DELETE", `/statuses/${id}?confirm=true`),
  },
  comments: {
    taskList: (taskId: string) => request<Comment[]>("GET", `/tasks/${taskId}/comments`),
    taskAdd: (taskId: string, body: string) =>
      request<Comment>("POST", `/tasks/${taskId}/comments`, { body: { body } }),
    taskDelete: (taskId: string, commentId: string) =>
      request<void>("DELETE", `/tasks/${taskId}/comments/${commentId}`),
    projectList: (projectId: string) =>
      request<Comment[]>("GET", `/projects/${projectId}/comments`),
    projectAdd: (projectId: string, body: string) =>
      request<Comment>("POST", `/projects/${projectId}/comments`, { body: { body } }),
    projectDelete: (projectId: string, commentId: string) =>
      request<void>("DELETE", `/projects/${projectId}/comments/${commentId}`),
  },
  notifications: {
    list: () => request<AppNotification[]>("GET", "/notifications"),
    markRead: (id: string) =>
      request<AppNotification>("POST", `/notifications/${id}/read`),
    markAllRead: () => request<{ marked: number }>("POST", "/notifications/read-all"),
  },
  security: {
    groups: () => request<Group[]>("GET", "/groups"),
    listGrants: (projectId: string) =>
      request<Grant[]>("GET", `/projects/${projectId}/grants`),
    addGrant: (projectId: string, payload: { principal_type: string; principal_id: string; role: string }) =>
      request<Grant>("POST", `/projects/${projectId}/grants`, { body: payload }),
    deleteGrant: (projectId: string, grantId: string) =>
      request<void>("DELETE", `/projects/${projectId}/grants/${grantId}`),
  },
  chat: {
    send: (message: string, conversationId?: string | null) =>
      request<ChatReply>("POST", "/chat", {
        body: { message, conversation_id: conversationId ?? null },
      }),
    conversations: () => request<ChatConversation[]>("GET", "/chat/conversations"),
    createConversation: () =>
      request<ChatConversation>("POST", "/chat/conversations"),
    messages: (conversationId: string) =>
      request<ChatMessageRow[]>("GET", `/chat/conversations/${conversationId}/messages`),
    rename: (conversationId: string, title: string) =>
      request<ChatConversation>("PATCH", `/chat/conversations/${conversationId}`, {
        body: { title },
      }),
    remove: (conversationId: string) =>
      request<void>("DELETE", `/chat/conversations/${conversationId}`),
  },
  tokens: {
    list: () => request<ApiToken[]>("GET", "/auth/tokens"),
    create: (name: string) =>
      request<ApiTokenCreated>("POST", "/auth/tokens", { body: { name } }),
    remove: (id: string) => request<void>("DELETE", `/auth/tokens/${id}`),
  },
  metrics: {
    myTasks: () => request<MyTask[]>("GET", "/my-tasks"),
    dashboard: (filter?: { teamId?: string; projectId?: string }) => {
      const q = new URLSearchParams();
      if (filter?.teamId) q.set("team_id", filter.teamId);
      if (filter?.projectId) q.set("project_id", filter.projectId);
      const qs = q.toString();
      return request<DashboardData>("GET", `/dashboard${qs ? `?${qs}` : ""}`);
    },
  },
  users: {
    list: () => request<Member[]>("GET", "/users"),
    create: (payload: {
      username?: string;
      email?: string;
      mobile?: string;
      display_name?: string;
      role: string;
    }) => request<Member>("POST", "/users", { body: payload }),
    setRole: (userId: string, role: string) =>
      request<Member>("PATCH", `/users/${userId}/role`, { body: { role } }),
  },
};
