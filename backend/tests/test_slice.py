from __future__ import annotations

import uuid

from sqlalchemy import text

from app.db.engine import engine


def _make_project(actor):
    team = actor.post("/teams", json={"name": "T", "type": "team"}).json()
    proj = actor.post(
        "/projects", json={"team_id": team["id"], "name": "Proj"}
    ).json()
    return team, proj


def test_full_slice_and_defaults(make_actor):
    actor = make_actor()

    # Org creation seeded the status + task-group catalogs; project create
    # auto-attached the default task group ("General").
    ws, proj = _make_project(actor)

    r = actor.post("/tasks", json={"project_id": proj["id"], "title": "Task A"})
    assert r.status_code == 201, r.text
    task = r.json()
    assert task["status_id"] is not None  # default status applied

    r = actor.get(f"/projects/{proj['id']}/tasks")
    assert r.status_code == 200
    assert len(r.json()) == 1

    # Update priority + title.
    r = actor.patch(f"/tasks/{task['id']}", json={"priority": "high", "title": "Task A1"})
    assert r.status_code == 200
    assert r.json()["priority"] == "high"
    assert r.json()["title"] == "Task A1"


def test_confirm_flag_required_for_delete(make_actor):
    actor = make_actor()
    _, proj = _make_project(actor)
    task = actor.post("/tasks", json={"project_id": proj["id"], "title": "X"}).json()

    assert actor.delete(f"/tasks/{task['id']}").status_code == 400
    assert actor.delete(
        f"/tasks/{task['id']}", params={"confirm": "true"}
    ).status_code == 204


def test_cross_org_access_denied(make_actor):
    """A member of org B cannot act inside org A — enforced by org membership
    (authz) and defended by RLS."""
    alice = make_actor()  # org A
    _, proj_a = _make_project(alice)

    bob = make_actor()  # org B

    # Bob points X-Org-Id at Alice's org: not a member -> 403.
    r = bob.client.post(
        "/teams",
        json={"name": "sneaky", "type": "team"},
        headers={"Authorization": f"Bearer {bob.token}", "X-Org-Id": alice.org_id},
    )
    assert r.status_code == 403, r.text

    # Bob uses his OWN org context but references Alice's project id -> not found
    # (RLS + org scoping hide it).
    r = bob.get(f"/projects/{proj_a['id']}/tasks")
    assert r.status_code == 404, r.text


def test_audit_rows_written(make_actor):
    actor = make_actor()
    _, proj = _make_project(actor)
    actor.post("/tasks", json={"project_id": proj["id"], "title": "Audited"})

    with engine.begin() as conn:
        conn.execute(
            text("SELECT set_config('app.current_org_id', :oid, false)"),
            {"oid": actor.org_id},
        )
        actions = set(
            conn.scalars(
                text("SELECT action FROM audit_log WHERE organization_id = :oid"),
                {"oid": actor.org_id},
            )
        )
    assert {"org.create", "group.create", "project.create", "task.create"} <= actions
