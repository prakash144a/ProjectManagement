from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --- Organization ---
class OrgCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class OrgOut(ORMModel):
    id: uuid.UUID
    name: str
    created_at: datetime


# --- Team / Group (the unified people-principal) ---
class MemberSpec(BaseModel):
    user_id: uuid.UUID
    role: str = "member"  # MemberRole: owner | member


class TeamCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    type: str = "team"  # GroupType: team | group
    members: list[MemberSpec] = Field(default_factory=list)


class TeamOut(ORMModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    type: str
    created_at: datetime


class TeamMemberOut(BaseModel):
    id: uuid.UUID
    display_name: str | None
    email: str | None
    username: str | None
    role: str


class MemberAdd(BaseModel):
    user_id: uuid.UUID
    role: str = "member"


class MemberRoleIn(BaseModel):
    role: str


# --- Project ---
class ProjectCreate(BaseModel):
    team_id: uuid.UUID
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None


class ProjectOut(ORMModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    team_id: uuid.UUID
    name: str
    description: str | None
    created_at: datetime


# --- Task ---
class TaskCreate(BaseModel):
    project_id: uuid.UUID
    title: str = Field(min_length=1, max_length=500)
    description: str | None = None
    status_id: uuid.UUID | None = None
    priority: str = "none"
    progress: int = Field(default=0, ge=0, le=100)
    assignee_id: uuid.UUID | None = None
    project_task_group_id: uuid.UUID | None = None
    start_date: date | None = None
    due_date: date | None = None


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=500)
    description: str | None = None
    status_id: uuid.UUID | None = None
    priority: str | None = None
    progress: int | None = Field(default=None, ge=0, le=100)
    assignee_id: uuid.UUID | None = None
    project_task_group_id: uuid.UUID | None = None
    start_date: date | None = None
    due_date: date | None = None


class StatusOut(ORMModel):
    id: uuid.UUID
    name: str
    position: int
    is_completed: bool
    is_default: bool
    color: str | None


class StatusCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    color: str | None = None
    is_completed: bool = False
    is_default: bool = False


class StatusUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    color: str | None = None
    is_completed: bool | None = None
    is_default: bool | None = None


class StatusReorder(BaseModel):
    ids: list[uuid.UUID]


class TaskGroupCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class TaskGroupDefOut(ORMModel):
    id: uuid.UUID
    name: str
    is_default: bool
    position: int


class TaskGroupDefCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    is_default: bool = False


class TaskGroupDefUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    is_default: bool | None = None


class TaskGroupOut(ORMModel):
    id: uuid.UUID
    project_id: uuid.UUID
    definition_id: uuid.UUID | None
    name: str
    position: int


class NotificationOut(ORMModel):
    id: uuid.UUID
    type: str
    ref_type: str | None
    ref_id: uuid.UUID | None
    is_read: bool
    created_at: datetime


class CommentCreate(BaseModel):
    body: str = Field(min_length=1)


class CommentOut(BaseModel):
    id: uuid.UUID
    body: str
    author_id: uuid.UUID | None
    author_name: str | None
    created_at: datetime


class MemberOut(BaseModel):
    id: uuid.UUID
    display_name: str | None
    email: str | None
    username: str | None
    mobile: str | None = None
    role: str | None = None


class GroupOut(ORMModel):
    id: uuid.UUID
    name: str
    type: str


class GrantOut(BaseModel):
    id: uuid.UUID
    principal_type: str
    principal_id: uuid.UUID | None
    principal_name: str | None
    role: str


class GrantCreate(BaseModel):
    principal_type: str  # "user" | "group"
    principal_id: uuid.UUID
    role: str


class UserCreate(BaseModel):
    username: str | None = None
    email: str | None = None
    mobile: str | None = None
    display_name: str | None = None
    role: str = "member"


class SetRoleIn(BaseModel):
    role: str


class TaskReorder(BaseModel):
    group_id: uuid.UUID | None = None
    task_ids: list[uuid.UUID]


# --- Chat agent (Phase 2) ---
class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatIn(BaseModel):
    message: str = Field(min_length=1)
    # DB-backed conversation to continue. If omitted, a new conversation is created.
    conversation_id: uuid.UUID | None = None
    # Legacy client-sent history; ignored when the DB conversation path runs.
    history: list[ChatMessage] = Field(default_factory=list)


class ChatAction(BaseModel):
    tool: str
    ok: bool


class ChatOut(BaseModel):
    reply: str
    actions: list[ChatAction] = Field(default_factory=list)
    conversation_id: uuid.UUID
    title: str | None = None


class ChatConversationOut(ORMModel):
    id: uuid.UUID
    title: str | None
    created_at: datetime
    updated_at: datetime


class ChatMessageOut(ORMModel):
    id: uuid.UUID
    role: str
    content: str
    actions: list[ChatAction] | None = None
    created_at: datetime


class ConversationRename(BaseModel):
    title: str = Field(min_length=1, max_length=200)


# --- Retrieval / search (A1) ---
class SearchHit(BaseModel):
    source_type: str  # task | project | comment
    source_id: uuid.UUID
    content: str
    score: float


class TaskOut(ORMModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    project_id: uuid.UUID
    project_task_group_id: uuid.UUID | None
    title: str
    description: str | None
    status_id: uuid.UUID | None
    priority: str
    progress: int
    assignee_id: uuid.UUID | None
    created_by: uuid.UUID | None
    rank: str | None
    start_date: date | None
    due_date: date | None
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime


# --- Metrics (My Tasks + team Dashboard) ---
class MyTaskOut(TaskOut):
    """A task assigned to me, enriched with where it lives (My Tasks spans projects)."""

    team_id: uuid.UUID
    project_name: str
    team_name: str


class StatusCount(BaseModel):
    status_id: uuid.UUID | None
    name: str
    color: str | None
    is_completed: bool
    count: int


class ThroughputPoint(BaseModel):
    week_start: date
    count: int


class ProjectHealth(BaseModel):
    id: uuid.UUID
    name: str
    task_count: int
    done_count: int
    completion_rate: float
    progress: int  # avg of task progress bars, 0..100
    status: str  # not_started | in_progress | done (derived rollup)
    overdue_count: int
    due_this_week: int
    health: str  # on_track | at_risk | overdue


class DashboardTrends(BaseModel):
    """Period-over-period signals: last 7 days vs the 7 days before that."""

    completed_this_week: int
    completed_prev_week: int
    created_this_week: int
    created_prev_week: int


class DashboardOut(BaseModel):
    scope_label: str  # "All teams" | a team name | a project name
    member_count: int
    total_projects: int
    total_tasks: int
    tasks_completed: int
    completion_rate: float
    overdue: int
    due_this_week: int
    tasks_by_status: list[StatusCount]
    throughput: list[ThroughputPoint]
    projects: list[ProjectHealth]
    trends: DashboardTrends
