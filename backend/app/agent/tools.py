"""The agent's tool layer — an in-process MCP surface over the REST services.

Every tool routes through the same `app/services/*` functions the REST routers
call, so **authorization, audit, and the `confirm=true` requirement on
destructive actions are enforced in exactly one place** and cannot be bypassed
by the agent. The agent always acts *as the current user* (identity flows in via
`ToolContext`), with no standing privileges.

Each invocation runs inside a SAVEPOINT: a tool that fails (permission denied,
bad input, confirmation required) rolls back only its own writes and returns a
structured `{"error": ...}` the model can react to, leaving earlier successful
tool calls in the same message intact.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date
from typing import Any, Callable

from sqlalchemy.orm import Session as DbSession

from app.errors import AppError, BadRequest
from app.models.identity import User
from app.models.work import Task
from app.services import (
    authz,
    catalog_service,
    embedding_service,
    metrics_service,
    project_service,
    task_service,
    team_service,
    user_service,
)


@dataclass
class ToolContext:
    db: DbSession
    user: User
    org_id: uuid.UUID


@dataclass
class Tool:
    name: str
    description: str
    parameters: dict  # JSON Schema for the arguments object
    handler: Callable[[ToolContext, dict], Any]
    destructive: bool = False


# --- argument helpers ----------------------------------------------------

def _req_uuid(args: dict, key: str) -> uuid.UUID:
    val = args.get(key)
    if val is None or val == "":
        raise BadRequest(f"'{key}' is required.")
    try:
        return uuid.UUID(str(val))
    except ValueError:
        raise BadRequest(f"'{key}' is not a valid id.")


def _opt_uuid(val: Any) -> uuid.UUID | None:
    if val is None or val == "":
        return None
    try:
        return uuid.UUID(str(val))
    except ValueError:
        raise BadRequest("Invalid id.")


def _opt_date(val: Any) -> date | None:
    if val is None or val == "":
        return None
    try:
        return date.fromisoformat(str(val))
    except ValueError:
        raise BadRequest("Dates must be ISO format (YYYY-MM-DD).")


# --- serialization -------------------------------------------------------

def _team_dict(g) -> dict:
    return {"id": str(g.id), "name": g.name, "type": g.type}


def _project_dict(p) -> dict:
    return {
        "id": str(p.id),
        "name": p.name,
        "description": p.description,
        "team_id": str(p.team_id),
    }


def _status_dict(s) -> dict:
    return {
        "id": str(s.id),
        "name": s.name,
        "is_completed": s.is_completed,
        "is_default": s.is_default,
    }


def _member_dict(u: User, role: str | None) -> dict:
    return {
        "id": str(u.id),
        "name": u.display_name or u.email or u.username or "user",
        "email": u.email,
        "role": role,
    }


def _task_dict(t: Task, status_names: dict[uuid.UUID, str]) -> dict:
    return {
        "id": str(t.id),
        "title": t.title,
        "description": t.description,
        "status": status_names.get(t.status_id) if t.status_id else None,
        "status_id": str(t.status_id) if t.status_id else None,
        "priority": t.priority,
        "progress": t.progress,
        "assignee_id": str(t.assignee_id) if t.assignee_id else None,
        "due_date": t.due_date.isoformat() if t.due_date else None,
        "start_date": t.start_date.isoformat() if t.start_date else None,
        "completed": t.completed_at is not None,
        "project_id": str(t.project_id),
    }


def _status_names(ctx: ToolContext) -> dict[uuid.UUID, str]:
    return {s.id: s.name for s in catalog_service.list_statuses(ctx.db, ctx.org_id)}


def _require_project_access(ctx: ToolContext, project_id: uuid.UUID):
    proj = project_service.get_project(ctx.db, ctx.org_id, project_id)
    if (
        authz.effective_role(
            ctx.db, ctx.user.id, ctx.org_id, team_id=proj.team_id, project_id=proj.id
        )
        is None
    ):
        raise BadRequest("You do not have access to that project.")
    return proj


# --- handlers ------------------------------------------------------------

def _list_teams(ctx: ToolContext, args: dict) -> Any:
    teams = team_service.list_groups(ctx.db, ctx.user.id, ctx.org_id, type="team")
    return [_team_dict(t) for t in teams]


def _list_projects(ctx: ToolContext, args: dict) -> Any:
    team_id = _opt_uuid(args.get("team_id"))
    projects = project_service.list_projects(ctx.db, ctx.user.id, ctx.org_id, team_id)
    return [_project_dict(p) for p in projects]


def _list_tasks(ctx: ToolContext, args: dict) -> Any:
    project_id = _req_uuid(args, "project_id")
    _require_project_access(ctx, project_id)
    names = _status_names(ctx)
    return [_task_dict(t, names) for t in task_service.list_tasks(ctx.db, ctx.org_id, project_id)]


def _my_tasks(ctx: ToolContext, args: dict) -> Any:
    names = _status_names(ctx)
    out = []
    for t, project_name, team_name, _team_id in metrics_service.my_tasks(
        ctx.db, ctx.user.id, ctx.org_id
    ):
        d = _task_dict(t, names)
        d["project_name"] = project_name
        d["team_name"] = team_name
        out.append(d)
    return out


def _list_statuses(ctx: ToolContext, args: dict) -> Any:
    return [_status_dict(s) for s in catalog_service.list_statuses(ctx.db, ctx.org_id)]


def _list_members(ctx: ToolContext, args: dict) -> Any:
    return [_member_dict(u, role) for u, role in user_service.list_members(ctx.db, ctx.org_id)]


def _opt_progress(val: Any) -> int:
    if val is None or val == "":
        return 0
    try:
        return max(0, min(100, int(val)))
    except (ValueError, TypeError):
        raise BadRequest("'progress' must be a number between 0 and 100.")


def _create_task(ctx: ToolContext, args: dict) -> Any:
    project_id = _req_uuid(args, "project_id")
    title = (args.get("title") or "").strip()
    if not title:
        raise BadRequest("'title' is required.")
    task = task_service.create_task(
        ctx.db,
        ctx.user.id,
        ctx.org_id,
        project_id,
        title=title,
        description=args.get("description"),
        status_id=_opt_uuid(args.get("status_id")),
        priority=args.get("priority") or "none",
        progress=_opt_progress(args.get("progress")),
        assignee_id=_opt_uuid(args.get("assignee_id")),
        due_date=_opt_date(args.get("due_date")),
        start_date=_opt_date(args.get("start_date")),
    )
    return _task_dict(task, _status_names(ctx))


def _update_task(ctx: ToolContext, args: dict) -> Any:
    task_id = _req_uuid(args, "task_id")
    changes: dict[str, Any] = {}
    for k in ("title", "description", "priority"):
        if k in args:
            changes[k] = args[k]
    if "progress" in args:
        changes["progress"] = _opt_progress(args["progress"])
    if "status_id" in args:
        changes["status_id"] = _opt_uuid(args["status_id"])
    if "assignee_id" in args:
        changes["assignee_id"] = _opt_uuid(args["assignee_id"])
    if "due_date" in args:
        changes["due_date"] = _opt_date(args["due_date"])
    if "start_date" in args:
        changes["start_date"] = _opt_date(args["start_date"])
    if not changes:
        raise BadRequest("No fields to update were provided.")
    task = task_service.update_task(ctx.db, ctx.user.id, ctx.org_id, task_id, changes)
    return _task_dict(task, _status_names(ctx))


def _delete_task(ctx: ToolContext, args: dict) -> Any:
    task_id = _req_uuid(args, "task_id")
    confirm = bool(args.get("confirm", False))
    task_service.delete_task(ctx.db, ctx.user.id, ctx.org_id, task_id, confirm)
    return {"deleted": True, "task_id": str(task_id)}


def _search(ctx: ToolContext, args: dict) -> Any:
    query = (args.get("query") or "").strip()
    if not query:
        raise BadRequest("'query' is required.")
    limit = args.get("limit") or 8
    return embedding_service.search(ctx.db, ctx.org_id, query, limit=int(limit))


def _create_project(ctx: ToolContext, args: dict) -> Any:
    team_id = _req_uuid(args, "team_id")
    name = (args.get("name") or "").strip()
    if not name:
        raise BadRequest("'name' is required.")
    proj = project_service.create_project(
        ctx.db, ctx.user.id, ctx.org_id, team_id, name, args.get("description")
    )
    return _project_dict(proj)


# --- registry ------------------------------------------------------------

_PRIORITY_ENUM = ["none", "low", "medium", "high", "urgent"]

TOOLS: list[Tool] = [
    Tool(
        "list_teams",
        "List the teams the user can access. A team contains projects.",
        {"type": "object", "properties": {}},
        _list_teams,
    ),
    Tool(
        "list_projects",
        "List projects the user can access, optionally filtered to one team.",
        {
            "type": "object",
            "properties": {"team_id": {"type": "string", "description": "Optional team id to filter by."}},
        },
        _list_projects,
    ),
    Tool(
        "list_tasks",
        "List all tasks in a project.",
        {
            "type": "object",
            "properties": {"project_id": {"type": "string"}},
            "required": ["project_id"],
        },
        _list_tasks,
    ),
    Tool(
        "my_tasks",
        "List tasks assigned to the current user across all their projects.",
        {"type": "object", "properties": {}},
        _my_tasks,
    ),
    Tool(
        "search",
        "Semantic search across the organization's tasks, projects, and comments to "
        "answer questions about existing work (e.g. 'what did we decide about the launch', "
        "'find tasks mentioning the API'). Returns matching snippets with source_type "
        "('task'|'project'|'comment') and source_id.",
        {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "limit": {"type": "integer", "description": "Max results (default 8)."},
            },
            "required": ["query"],
        },
        _search,
    ),
    Tool(
        "list_statuses",
        "List the organization's task statuses (with which ones mean 'done').",
        {"type": "object", "properties": {}},
        _list_statuses,
    ),
    Tool(
        "list_members",
        "List the organization's members (to resolve who to assign a task to).",
        {"type": "object", "properties": {}},
        _list_members,
    ),
    Tool(
        "create_task",
        "Create a task in a project. Resolve project/status/assignee ids first via the list_* tools.",
        {
            "type": "object",
            "properties": {
                "project_id": {"type": "string"},
                "title": {"type": "string"},
                "description": {"type": "string"},
                "status_id": {"type": "string"},
                "priority": {"type": "string", "enum": _PRIORITY_ENUM},
                "progress": {
                    "type": "integer",
                    "minimum": 0,
                    "maximum": 100,
                    "description": "Percent complete (0-100). Auto-set to 100 in a completed status.",
                },
                "assignee_id": {"type": "string"},
                "due_date": {"type": "string", "description": "ISO date YYYY-MM-DD"},
                "start_date": {"type": "string", "description": "ISO date YYYY-MM-DD"},
            },
            "required": ["project_id", "title"],
        },
        _create_task,
    ),
    Tool(
        "update_task",
        "Update fields on a task (title, description, status, priority, progress, assignee, dates). "
        "Only include the fields you want to change. Use a completed status_id to mark it done "
        "(which also sets progress to 100). Set 'progress' (0-100) to report partial completion "
        "without changing status.",
        {
            "type": "object",
            "properties": {
                "task_id": {"type": "string"},
                "title": {"type": "string"},
                "description": {"type": "string"},
                "status_id": {"type": "string"},
                "priority": {"type": "string", "enum": _PRIORITY_ENUM},
                "progress": {
                    "type": "integer",
                    "minimum": 0,
                    "maximum": 100,
                    "description": "Percent complete (0-100). Forced to 100 when moved to a completed status.",
                },
                "assignee_id": {"type": "string", "description": "User id, or null to unassign."},
                "due_date": {"type": "string", "description": "ISO date, or null to clear."},
                "start_date": {"type": "string", "description": "ISO date, or null to clear."},
            },
            "required": ["task_id"],
        },
        _update_task,
    ),
    Tool(
        "delete_task",
        "Delete a task. DESTRUCTIVE: only call with confirm=true after the user has explicitly agreed.",
        {
            "type": "object",
            "properties": {
                "task_id": {"type": "string"},
                "confirm": {"type": "boolean", "description": "Must be true; set only after the user confirms."},
            },
            "required": ["task_id", "confirm"],
        },
        _delete_task,
        destructive=True,
    ),
    Tool(
        "create_project",
        "Create a project inside a team.",
        {
            "type": "object",
            "properties": {
                "team_id": {"type": "string"},
                "name": {"type": "string"},
                "description": {"type": "string"},
            },
            "required": ["team_id", "name"],
        },
        _create_project,
    ),
]

_BY_NAME = {t.name: t for t in TOOLS}


def invoke(ctx: ToolContext, name: str, args: dict) -> Any:
    """Run a tool by name inside a savepoint. Returns the tool result, or a
    structured error the model can recover from."""
    tool = _BY_NAME.get(name)
    if tool is None:
        return {"error": f"Unknown tool: {name}"}
    try:
        with ctx.db.begin_nested():
            return tool.handler(ctx, args or {})
    except AppError as e:
        return {"error": e.message}
    except Exception as e:  # noqa: BLE001 — surface unexpected errors to the model, don't 500
        return {"error": f"Tool failed: {e}"}
