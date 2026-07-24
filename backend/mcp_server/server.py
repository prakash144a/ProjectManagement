"""Standalone MCP server — a separate deployable that exposes the app's tools to
external AI clients (Claude, ChatGPT, custom agents) over MCP Streamable HTTP.

It is a thin protocol adapter: it holds **no business logic and never touches the
database**. Each tool call is forwarded to the REST API over HTTP, authenticated
with the caller's **Personal Access Token** (an org-scoped token the user creates
in the app). REST therefore remains the single point of authorization, audit, and
the `confirm=true` requirement — the MCP client acts strictly as the user.

Auth: the client sends `Authorization: Bearer <PAT>`; an ASGI middleware captures
it per request into a contextvar that the tools forward to REST. The PAT selects
its own org, so no X-Org-Id is needed.

Run:  uvicorn mcp_server.server:app --host 0.0.0.0 --port 8100
Endpoint:  http://<host>:8100/mcp
"""

from __future__ import annotations

import os
from contextvars import ContextVar
from typing import Any

import httpx
from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings

REST_URL = os.getenv("MCP_REST_URL", "http://127.0.0.1:8000")

_pat: ContextVar[str | None] = ContextVar("pat", default=None)

# DNS-rebinding protection (mcp SDK >= ~1.9) validates the incoming Host header and
# rejects anything not in `allowed_hosts` with 421 "Invalid Host header" — and FastMCP
# turns it ON by default. That guards *local* browser-facing servers, but this MCP
# server is a public, PAT-authenticated API behind Azure Container Apps' TLS proxy,
# where the same protection instead blocks our own public FQDN (and platform health
# probes, which send a different Host). So default it OFF; set MCP_ALLOWED_HOSTS
# (comma-separated hostnames) to lock it down in an environment where every legitimate
# Host — proxy and health-probe included — is known.
_allowed_hosts = [h.strip() for h in os.getenv("MCP_ALLOWED_HOSTS", "").split(",") if h.strip()]
if _allowed_hosts:
    _security = TransportSecuritySettings(
        enable_dns_rebinding_protection=True,
        allowed_hosts=_allowed_hosts,
        allowed_origins=_allowed_hosts,
    )
else:
    _security = TransportSecuritySettings(enable_dns_rebinding_protection=False)

mcp = FastMCP("taskmgmt", stateless_http=True, transport_security=_security)


# --- REST client (as the authenticated user; PAT selects the org) ---

def _headers() -> dict[str, str]:
    token = _pat.get()
    if not token:
        raise ValueError("No access token. Send 'Authorization: Bearer <token>'.")
    return {"Authorization": f"Bearer {token}"}


async def _call(method: str, path: str, *, params: dict | None = None, json: dict | None = None) -> Any:
    try:
        async with httpx.AsyncClient(base_url=REST_URL, timeout=30) as c:
            r = await c.request(method, path, params=params, json=json, headers=_headers())
    except ValueError as e:
        return {"error": str(e)}
    if r.status_code >= 400:
        try:
            return {"error": r.json().get("error", {}).get("message", r.text)}
        except Exception:  # noqa: BLE001
            return {"error": f"HTTP {r.status_code}"}
    if r.status_code == 204 or not r.content:
        return {"ok": True}
    return r.json()


def _body(**fields: Any) -> dict:
    """Drop empty-string / None fields so 'unset' optional args aren't sent."""
    return {k: v for k, v in fields.items() if v not in ("", None)}


# --- tools (mirror the REST surface) ---

@mcp.tool()
async def list_teams() -> Any:
    """List the teams you can access. A team contains projects."""
    return await _call("GET", "/teams", params={"type": "team"})


@mcp.tool()
async def list_projects(team_id: str = "") -> Any:
    """List projects you can access, optionally filtered to one team id."""
    return await _call("GET", "/projects", params=_body(team_id=team_id))


@mcp.tool()
async def list_tasks(project_id: str) -> Any:
    """List all tasks in a project."""
    return await _call("GET", f"/projects/{project_id}/tasks")


@mcp.tool()
async def my_tasks() -> Any:
    """List tasks assigned to you across all your projects."""
    return await _call("GET", "/my-tasks")


@mcp.tool()
async def search(query: str, limit: int = 8) -> Any:
    """Semantic search across your tasks, projects, and comments to answer
    questions about existing work (e.g. 'what did we decide about the launch')."""
    return await _call("GET", "/search", params={"q": query, "limit": limit})


@mcp.tool()
async def list_statuses() -> Any:
    """List the organization's task statuses (which ones mean 'done')."""
    return await _call("GET", "/statuses")


@mcp.tool()
async def list_members() -> Any:
    """List the organization's members (to resolve who to assign a task to)."""
    return await _call("GET", "/members")


@mcp.tool()
async def create_task(
    project_id: str,
    title: str,
    description: str = "",
    priority: str = "",
    assignee_id: str = "",
    due_date: str = "",
    status_id: str = "",
    progress: int | None = None,
) -> Any:
    """Create a task in a project. Resolve ids first via the list_* tools. Dates are YYYY-MM-DD.
    progress is percent complete (0-100); it's auto-set to 100 in a completed status."""
    return await _call(
        "POST",
        "/tasks",
        json=_body(
            project_id=project_id, title=title, description=description,
            priority=priority, assignee_id=assignee_id, due_date=due_date, status_id=status_id,
            progress=progress,
        ),
    )


@mcp.tool()
async def update_task(
    task_id: str,
    title: str = "",
    description: str = "",
    status_id: str = "",
    priority: str = "",
    assignee_id: str = "",
    due_date: str = "",
    progress: int | None = None,
) -> Any:
    """Update fields on a task (only include what changes). Use a completed status_id to mark it
    done (which also sets progress to 100). Set progress (0-100) to report partial completion."""
    return await _call(
        "PATCH",
        f"/tasks/{task_id}",
        json=_body(
            title=title, description=description, status_id=status_id,
            priority=priority, assignee_id=assignee_id, due_date=due_date,
            progress=progress,
        ),
    )


@mcp.tool()
async def delete_task(task_id: str, confirm: bool = False) -> Any:
    """Delete a task. DESTRUCTIVE: only call with confirm=true after the user has agreed."""
    return await _call("DELETE", f"/tasks/{task_id}", params={"confirm": str(confirm).lower()})


@mcp.tool()
async def create_project(team_id: str, name: str, description: str = "") -> Any:
    """Create a project inside a team."""
    return await _call("POST", "/projects", json=_body(team_id=team_id, name=name, description=description))


# --- ASGI app: capture the bearer PAT per request, then hand off to FastMCP ---

_inner = mcp.streamable_http_app()


async def app(scope, receive, send):
    if scope["type"] == "http":
        headers = dict(scope.get("headers") or [])
        auth = headers.get(b"authorization", b"").decode()
        _pat.set(auth[7:].strip() if auth[:7].lower() == "bearer " else None)
    await _inner(scope, receive, send)
