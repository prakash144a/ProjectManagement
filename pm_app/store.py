from __future__ import annotations

import sqlite3
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any


def utc_now() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


@dataclass(frozen=True)
class Principal:
    user_id: str
    workspace_id: str


class Store:
    def __init__(self, db_path: str | Path):
        self.db_path = str(db_path)
        self.initialize()

    def connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.db_path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    def initialize(self) -> None:
        with self.connect() as db:
            db.executescript(
                """
                CREATE TABLE IF NOT EXISTS organizations (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS workspaces (
                    id TEXT PRIMARY KEY,
                    organization_id TEXT NOT NULL REFERENCES organizations(id),
                    name TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS teams (
                    id TEXT PRIMARY KEY,
                    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
                    name TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    email TEXT NOT NULL UNIQUE,
                    display_name TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS memberships (
                    id TEXT PRIMARY KEY,
                    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
                    user_id TEXT NOT NULL REFERENCES users(id),
                    team_id TEXT REFERENCES teams(id),
                    role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
                    created_at TEXT NOT NULL,
                    UNIQUE(workspace_id, user_id)
                );

                CREATE TABLE IF NOT EXISTS projects (
                    id TEXT PRIMARY KEY,
                    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
                    name TEXT NOT NULL,
                    description TEXT NOT NULL DEFAULT '',
                    status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'done', 'archived')),
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS tasks (
                    id TEXT PRIMARY KEY,
                    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
                    project_id TEXT REFERENCES projects(id),
                    parent_task_id TEXT REFERENCES tasks(id),
                    title TEXT NOT NULL,
                    description TEXT NOT NULL DEFAULT '',
                    status TEXT NOT NULL CHECK (status IN ('todo', 'in_progress', 'blocked', 'done')),
                    priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
                    assignee_id TEXT REFERENCES users(id),
                    due_date TEXT,
                    position INTEGER NOT NULL DEFAULT 0,
                    created_by TEXT NOT NULL REFERENCES users(id),
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS comments (
                    id TEXT PRIMARY KEY,
                    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
                    author_id TEXT NOT NULL REFERENCES users(id),
                    body TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS attachments (
                    id TEXT PRIMARY KEY,
                    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
                    file_name TEXT NOT NULL,
                    url TEXT NOT NULL,
                    mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
                    size_bytes INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS notifications (
                    id TEXT PRIMARY KEY,
                    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
                    user_id TEXT NOT NULL REFERENCES users(id),
                    task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
                    kind TEXT NOT NULL,
                    title TEXT NOT NULL,
                    body TEXT NOT NULL,
                    is_read INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS billing_accounts (
                    id TEXT PRIMARY KEY,
                    organization_id TEXT NOT NULL REFERENCES organizations(id),
                    plan TEXT NOT NULL,
                    status TEXT NOT NULL,
                    seats INTEGER NOT NULL,
                    trial_ends_at TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_tasks_workspace_status ON tasks(workspace_id, status);
                CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
                CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
                CREATE INDEX IF NOT EXISTS idx_comments_task ON comments(task_id);
                CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
                """
            )
            if not db.execute("SELECT 1 FROM organizations LIMIT 1").fetchone():
                self._seed(db)

    def _seed(self, db: sqlite3.Connection) -> None:
        now = utc_now()
        org_id = "org_demo"
        workspace_id = "wrk_demo"
        team_id = "team_product"
        owner_id = "usr_prakash"
        member_id = "usr_maya"
        project_id = "prj_launch"
        task_one = "tsk_positioning"
        task_two = "tsk_waitlist"
        task_three = "tsk_billing"
        trial_end = (datetime.now(UTC) + timedelta(days=14)).replace(microsecond=0).isoformat()

        db.execute("INSERT INTO organizations VALUES (?, ?, ?)", (org_id, "Demo Organization", now))
        db.execute(
            "INSERT INTO workspaces VALUES (?, ?, ?, ?)",
            (workspace_id, org_id, "Product Workspace", now),
        )
        db.execute("INSERT INTO teams VALUES (?, ?, ?, ?)", (team_id, workspace_id, "Product", now))
        db.executemany(
            "INSERT INTO users VALUES (?, ?, ?, ?)",
            [
                (owner_id, "prakash@example.com", "Prakash", now),
                (member_id, "maya@example.com", "Maya", now),
            ],
        )
        db.executemany(
            "INSERT INTO memberships VALUES (?, ?, ?, ?, ?, ?)",
            [
                ("mem_owner", workspace_id, owner_id, team_id, "owner", now),
                ("mem_maya", workspace_id, member_id, team_id, "member", now),
            ],
        )
        db.execute(
            "INSERT INTO projects VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                project_id,
                workspace_id,
                "AI Task Manager Launch",
                "Phase 1 launch checklist for the core task product.",
                "active",
                now,
                now,
            ),
        )
        db.executemany(
            """
            INSERT INTO tasks (
                id, workspace_id, project_id, parent_task_id, title, description, status,
                priority, assignee_id, due_date, position, created_by, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    task_one,
                    workspace_id,
                    project_id,
                    None,
                    "Write launch positioning brief",
                    "Capture target user, core promise, launch risks, and success criteria.",
                    "in_progress",
                    "high",
                    owner_id,
                    "2026-07-10",
                    10,
                    owner_id,
                    now,
                    now,
                ),
                (
                    task_two,
                    workspace_id,
                    project_id,
                    None,
                    "Create waitlist intake flow",
                    "Ship the basic form and notification path for early access requests.",
                    "todo",
                    "medium",
                    member_id,
                    "2026-07-12",
                    20,
                    owner_id,
                    now,
                    now,
                ),
                (
                    task_three,
                    workspace_id,
                    project_id,
                    None,
                    "Confirm billing foundation",
                    "Define trial plan, seat count, and status display for Phase 1.",
                    "blocked",
                    "medium",
                    owner_id,
                    None,
                    30,
                    owner_id,
                    now,
                    now,
                ),
            ],
        )
        db.execute(
            "INSERT INTO comments VALUES (?, ?, ?, ?, ?)",
            ("cmt_seed", task_one, member_id, "Draft is ready for review after pricing notes land.", now),
        )
        db.execute(
            "INSERT INTO attachments VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                "att_seed",
                task_one,
                "positioning-notes.md",
                "https://example.com/positioning-notes.md",
                "text/markdown",
                2048,
                now,
            ),
        )
        db.execute(
            "INSERT INTO notifications VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                "ntf_seed",
                workspace_id,
                owner_id,
                task_three,
                "blocked_task",
                "Billing task is blocked",
                "Confirm the launch plan before wiring a real billing provider.",
                0,
                now,
            ),
        )
        db.execute(
            "INSERT INTO billing_accounts VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            ("bill_demo", org_id, "trial", "active", 2, trial_end, now, now),
        )

    def default_principal(self) -> Principal:
        with self.connect() as db:
            row = db.execute(
                """
                SELECT memberships.user_id, memberships.workspace_id
                FROM memberships
                ORDER BY CASE memberships.role WHEN 'owner' THEN 0 ELSE 1 END
                LIMIT 1
                """
            ).fetchone()
        if not row:
            raise RuntimeError("No workspace membership exists")
        return Principal(user_id=row["user_id"], workspace_id=row["workspace_id"])

    def session(self, principal: Principal) -> dict[str, Any]:
        with self.connect() as db:
            user = self._one(db, "SELECT * FROM users WHERE id = ?", (principal.user_id,))
            workspace = self._one(db, "SELECT * FROM workspaces WHERE id = ?", (principal.workspace_id,))
            org = self._one(db, "SELECT * FROM organizations WHERE id = ?", (workspace["organization_id"],))
            membership = self._one(
                db,
                "SELECT * FROM memberships WHERE workspace_id = ? AND user_id = ?",
                (principal.workspace_id, principal.user_id),
            )
            teams = self._all(db, "SELECT * FROM teams WHERE workspace_id = ? ORDER BY name", (principal.workspace_id,))
            members = self._all(
                db,
                """
                SELECT users.id, users.email, users.display_name, memberships.role, memberships.team_id
                FROM memberships
                JOIN users ON users.id = memberships.user_id
                WHERE memberships.workspace_id = ?
                ORDER BY users.display_name
                """,
                (principal.workspace_id,),
            )
        return {
            "user": user,
            "organization": org,
            "workspace": workspace,
            "membership": membership,
            "teams": teams,
            "members": members,
        }

    def list_projects(self, principal: Principal) -> list[dict[str, Any]]:
        with self.connect() as db:
            return self._all(
                db,
                "SELECT * FROM projects WHERE workspace_id = ? ORDER BY updated_at DESC, name",
                (principal.workspace_id,),
            )

    def create_project(self, principal: Principal, payload: dict[str, Any]) -> dict[str, Any]:
        project_id = new_id("prj")
        now = utc_now()
        with self.connect() as db:
            db.execute(
                "INSERT INTO projects VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    project_id,
                    principal.workspace_id,
                    required_text(payload, "name"),
                    str(payload.get("description") or ""),
                    payload.get("status") or "active",
                    now,
                    now,
                ),
            )
            return self.get_project(db, principal, project_id)

    def list_tasks(self, principal: Principal, filters: dict[str, str]) -> list[dict[str, Any]]:
        where = ["tasks.workspace_id = ?"]
        params: list[Any] = [principal.workspace_id]
        if filters.get("status"):
            where.append("tasks.status = ?")
            params.append(filters["status"])
        if filters.get("project_id"):
            where.append("tasks.project_id = ?")
            params.append(filters["project_id"])
        if filters.get("assignee_id"):
            where.append("tasks.assignee_id = ?")
            params.append(filters["assignee_id"])
        if filters.get("q"):
            where.append("(tasks.title LIKE ? OR tasks.description LIKE ?)")
            query = f"%{filters['q']}%"
            params.extend([query, query])
        sql = f"""
            SELECT tasks.*, projects.name AS project_name, users.display_name AS assignee_name
            FROM tasks
            LEFT JOIN projects ON projects.id = tasks.project_id
            LEFT JOIN users ON users.id = tasks.assignee_id
            WHERE {' AND '.join(where)}
            ORDER BY tasks.position ASC, tasks.updated_at DESC
        """
        with self.connect() as db:
            return [self._decorate_task(db, row) for row in db.execute(sql, params).fetchall()]

    def search(self, principal: Principal, query: str) -> dict[str, list[dict[str, Any]]]:
        like = f"%{query}%"
        with self.connect() as db:
            tasks = [
                self._decorate_task(db, row)
                for row in db.execute(
                    """
                    SELECT tasks.*, projects.name AS project_name, users.display_name AS assignee_name
                    FROM tasks
                    LEFT JOIN projects ON projects.id = tasks.project_id
                    LEFT JOIN users ON users.id = tasks.assignee_id
                    WHERE tasks.workspace_id = ?
                    AND (tasks.title LIKE ? OR tasks.description LIKE ?)
                    ORDER BY tasks.updated_at DESC
                    LIMIT 20
                    """,
                    (principal.workspace_id, like, like),
                ).fetchall()
            ]
            projects = self._all(
                db,
                """
                SELECT * FROM projects
                WHERE workspace_id = ? AND (name LIKE ? OR description LIKE ?)
                ORDER BY updated_at DESC
                LIMIT 20
                """,
                (principal.workspace_id, like, like),
            )
        return {"tasks": tasks, "projects": projects}

    def create_task(self, principal: Principal, payload: dict[str, Any]) -> dict[str, Any]:
        task_id = new_id("tsk")
        now = utc_now()
        with self.connect() as db:
            project_id = payload.get("project_id") or None
            if project_id:
                self.get_project(db, principal, project_id)
            db.execute(
                """
                INSERT INTO tasks (
                    id, workspace_id, project_id, parent_task_id, title, description, status,
                    priority, assignee_id, due_date, position, created_by, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    task_id,
                    principal.workspace_id,
                    project_id,
                    payload.get("parent_task_id") or None,
                    required_text(payload, "title"),
                    str(payload.get("description") or ""),
                    payload.get("status") or "todo",
                    payload.get("priority") or "medium",
                    payload.get("assignee_id") or None,
                    payload.get("due_date") or None,
                    int(payload.get("position") or 100),
                    principal.user_id,
                    now,
                    now,
                ),
            )
            self._notify_assignee(db, principal, task_id, payload.get("assignee_id"), "New task assigned")
            return self.get_task(db, principal, task_id)

    def get_task_by_id(self, principal: Principal, task_id: str) -> dict[str, Any]:
        with self.connect() as db:
            return self.get_task(db, principal, task_id)

    def update_task(self, principal: Principal, task_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        allowed = {
            "project_id",
            "parent_task_id",
            "title",
            "description",
            "status",
            "priority",
            "assignee_id",
            "due_date",
            "position",
        }
        updates = {key: value for key, value in payload.items() if key in allowed}
        if not updates:
            raise ValueError("No task fields supplied")
        if "title" in updates:
            updates["title"] = required_text(updates, "title")
        if "description" in updates:
            updates["description"] = str(updates["description"] or "")
        if "position" in updates:
            updates["position"] = int(updates["position"])
        updates["updated_at"] = utc_now()
        columns = ", ".join(f"{key} = ?" for key in updates)
        params = list(updates.values()) + [task_id, principal.workspace_id]
        with self.connect() as db:
            existing = self.get_task(db, principal, task_id)
            db.execute(f"UPDATE tasks SET {columns} WHERE id = ? AND workspace_id = ?", params)
            if updates.get("assignee_id") and updates.get("assignee_id") != existing.get("assignee_id"):
                self._notify_assignee(db, principal, task_id, updates["assignee_id"], "Task assigned")
            return self.get_task(db, principal, task_id)

    def add_comment(self, principal: Principal, task_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        comment_id = new_id("cmt")
        now = utc_now()
        with self.connect() as db:
            task = self.get_task(db, principal, task_id)
            db.execute(
                "INSERT INTO comments VALUES (?, ?, ?, ?, ?)",
                (comment_id, task_id, principal.user_id, required_text(payload, "body"), now),
            )
            if task.get("assignee_id") and task["assignee_id"] != principal.user_id:
                self._insert_notification(
                    db,
                    principal.workspace_id,
                    task["assignee_id"],
                    task_id,
                    "comment",
                    "New comment",
                    task["title"],
                )
            return self._one(
                db,
                """
                SELECT comments.*, users.display_name AS author_name
                FROM comments
                JOIN users ON users.id = comments.author_id
                WHERE comments.id = ?
                """,
                (comment_id,),
            )

    def add_attachment(self, principal: Principal, task_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        attachment_id = new_id("att")
        now = utc_now()
        with self.connect() as db:
            self.get_task(db, principal, task_id)
            db.execute(
                "INSERT INTO attachments VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    attachment_id,
                    task_id,
                    required_text(payload, "file_name"),
                    required_text(payload, "url"),
                    payload.get("mime_type") or "application/octet-stream",
                    int(payload.get("size_bytes") or 0),
                    now,
                ),
            )
            return self._one(db, "SELECT * FROM attachments WHERE id = ?", (attachment_id,))

    def list_notifications(self, principal: Principal) -> list[dict[str, Any]]:
        with self.connect() as db:
            return self._all(
                db,
                """
                SELECT notifications.*, tasks.title AS task_title
                FROM notifications
                LEFT JOIN tasks ON tasks.id = notifications.task_id
                WHERE notifications.workspace_id = ? AND notifications.user_id = ?
                ORDER BY notifications.created_at DESC
                """,
                (principal.workspace_id, principal.user_id),
            )

    def mark_notification(self, principal: Principal, notification_id: str, is_read: bool) -> dict[str, Any]:
        with self.connect() as db:
            db.execute(
                """
                UPDATE notifications SET is_read = ?
                WHERE id = ? AND workspace_id = ? AND user_id = ?
                """,
                (1 if is_read else 0, notification_id, principal.workspace_id, principal.user_id),
            )
            return self._one(
                db,
                """
                SELECT * FROM notifications
                WHERE id = ? AND workspace_id = ? AND user_id = ?
                """,
                (notification_id, principal.workspace_id, principal.user_id),
            )

    def billing_account(self, principal: Principal) -> dict[str, Any]:
        with self.connect() as db:
            workspace = self._one(db, "SELECT * FROM workspaces WHERE id = ?", (principal.workspace_id,))
            return self._one(
                db,
                "SELECT * FROM billing_accounts WHERE organization_id = ?",
                (workspace["organization_id"],),
            )

    def checkout_intent(self, principal: Principal, payload: dict[str, Any]) -> dict[str, Any]:
        account = self.billing_account(principal)
        plan = payload.get("plan") or "team"
        seats = int(payload.get("seats") or account["seats"])
        return {
            "billing_account_id": account["id"],
            "provider": "mock",
            "plan": plan,
            "seats": seats,
            "status": "ready",
            "message": "Billing provider can be connected behind this intent.",
        }

    def get_project(self, db: sqlite3.Connection, principal: Principal, project_id: str) -> dict[str, Any]:
        return self._one(
            db,
            "SELECT * FROM projects WHERE id = ? AND workspace_id = ?",
            (project_id, principal.workspace_id),
        )

    def get_task(self, db: sqlite3.Connection, principal: Principal, task_id: str) -> dict[str, Any]:
        row = db.execute(
            """
            SELECT tasks.*, projects.name AS project_name, users.display_name AS assignee_name
            FROM tasks
            LEFT JOIN projects ON projects.id = tasks.project_id
            LEFT JOIN users ON users.id = tasks.assignee_id
            WHERE tasks.id = ? AND tasks.workspace_id = ?
            """,
            (task_id, principal.workspace_id),
        ).fetchone()
        if not row:
            raise LookupError("Task not found")
        return self._decorate_task(db, row)

    def _decorate_task(self, db: sqlite3.Connection, row: sqlite3.Row) -> dict[str, Any]:
        task = dict(row)
        task["comments"] = self._all(
            db,
            """
            SELECT comments.*, users.display_name AS author_name
            FROM comments
            JOIN users ON users.id = comments.author_id
            WHERE comments.task_id = ?
            ORDER BY comments.created_at ASC
            """,
            (task["id"],),
        )
        task["attachments"] = self._all(
            db,
            "SELECT * FROM attachments WHERE task_id = ? ORDER BY created_at ASC",
            (task["id"],),
        )
        return task

    def _notify_assignee(
        self,
        db: sqlite3.Connection,
        principal: Principal,
        task_id: str,
        assignee_id: Any,
        title: str,
    ) -> None:
        if assignee_id and assignee_id != principal.user_id:
            task = db.execute("SELECT title FROM tasks WHERE id = ?", (task_id,)).fetchone()
            self._insert_notification(
                db,
                principal.workspace_id,
                str(assignee_id),
                task_id,
                "assignment",
                title,
                task["title"] if task else "",
            )

    def _insert_notification(
        self,
        db: sqlite3.Connection,
        workspace_id: str,
        user_id: str,
        task_id: str,
        kind: str,
        title: str,
        body: str,
    ) -> None:
        db.execute(
            "INSERT INTO notifications VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (new_id("ntf"), workspace_id, user_id, task_id, kind, title, body, 0, utc_now()),
        )

    @staticmethod
    def _one(db: sqlite3.Connection, sql: str, params: tuple[Any, ...]) -> dict[str, Any]:
        row = db.execute(sql, params).fetchone()
        if not row:
            raise LookupError("Resource not found")
        return dict(row)

    @staticmethod
    def _all(db: sqlite3.Connection, sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        return [dict(row) for row in db.execute(sql, params).fetchall()]


def required_text(payload: dict[str, Any], key: str) -> str:
    value = str(payload.get(key) or "").strip()
    if not value:
        raise ValueError(f"{key} is required")
    return value

