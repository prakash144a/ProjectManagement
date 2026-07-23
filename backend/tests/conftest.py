"""Test fixtures.

These run against the configured (Azure) Postgres and **commit** — the real
commit path is what exercises RLS honestly. Tests use unique identifiers per run
so runs don't collide, and created orgs are cleaned up at session end (deleting
the organization row cascades to all org-scoped children).
"""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.rate_limit import rate_limiter
from app.db.engine import engine
from app.main import app


@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    # TestClient collapses every request onto one client IP, so the per-IP OTP
    # limit would trip across tests. Reset it before each test (the limiter's
    # own behavior is covered separately).
    rate_limiter.reset()


@pytest.fixture(scope="session")
def created_org_ids() -> list[str]:
    return []


@pytest.fixture(scope="session")
def client(created_org_ids):
    with TestClient(app) as c:
        yield c
    # Teardown: delete each created org (cascades remove children, bypassing RLS).
    with engine.begin() as conn:
        for org_id in created_org_ids:
            conn.execute(
                text("SELECT set_config('app.current_org_id', :oid, false)"),
                {"oid": str(org_id)},
            )
            conn.execute(
                text("DELETE FROM organization WHERE id = :oid"), {"oid": str(org_id)}
            )


class Actor:
    """A logged-in user with helpers for the common calls."""

    def __init__(self, client: TestClient, token: str, user_id: str):
        self.client = client
        self.token = token
        self.user_id = user_id
        self.org_id: str | None = None

    def _headers(self) -> dict:
        h = {"Authorization": f"Bearer {self.token}"}
        if self.org_id:
            h["X-Org-Id"] = self.org_id
        return h

    def post(self, path, json=None, **kw):
        return self.client.post(path, json=json, headers=self._headers(), **kw)

    def get(self, path, **kw):
        return self.client.get(path, headers=self._headers(), **kw)

    def patch(self, path, json=None, **kw):
        return self.client.patch(path, json=json, headers=self._headers(), **kw)

    def delete(self, path, **kw):
        return self.client.delete(path, headers=self._headers(), **kw)


@pytest.fixture
def make_actor(client, created_org_ids):
    def _make(create_org: bool = True) -> Actor:
        email = f"test+{uuid.uuid4().hex[:10]}@example.com"
        r = client.post("/auth/request-code", json={"identifier": email})
        assert r.status_code == 200, r.text
        code = r.json()["dev_code"]
        r = client.post("/auth/verify", json={"identifier": email, "code": code})
        assert r.status_code == 200, r.text
        body = r.json()
        actor = Actor(client, body["token"], body["user_id"])
        if create_org:
            r = actor.post("/organizations", json={"name": f"Org {email}"})
            assert r.status_code == 201, r.text
            actor.org_id = r.json()["id"]
            created_org_ids.append(actor.org_id)
        return actor

    return _make
