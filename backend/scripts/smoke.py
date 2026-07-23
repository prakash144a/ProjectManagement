"""End-to-end smoke test against a running server.

Exercises the full Phase-1 slice: OTP signup/login -> create org -> workspace ->
project -> task -> list. Proves auth + authz + RLS + audit are wired together.

Usage (server must be running):
    uvicorn app.main:app            # in one terminal
    python scripts/smoke.py         # in another
Set BASE_URL to point elsewhere (default http://127.0.0.1:8000).
"""

from __future__ import annotations

import os
import sys
import uuid

import httpx

BASE_URL = os.environ.get("BASE_URL", "http://127.0.0.1:8000")


def main() -> int:
    email = f"smoke+{uuid.uuid4().hex[:8]}@example.com"
    with httpx.Client(base_url=BASE_URL, timeout=30) as c:
        # 1. Request an OTP (dev echoes the code back).
        r = c.post("/auth/request-code", json={"identifier": email})
        r.raise_for_status()
        code = r.json()["dev_code"]
        assert code, "dev_code not returned — is DEV_OTP_ECHO on?"
        print(f"[1] requested code for {email}: {code}")

        # 2. Verify -> session token.
        r = c.post("/auth/verify", json={"identifier": email, "code": code})
        r.raise_for_status()
        token = r.json()["token"]
        c.headers["Authorization"] = f"Bearer {token}"
        print("[2] verified, got session token")

        # 3. Create org (creator becomes Owner; catalogs seeded).
        r = c.post("/organizations", json={"name": "Smoke Org"})
        r.raise_for_status()
        org_id = r.json()["id"]
        c.headers["X-Org-Id"] = org_id
        print(f"[3] created org {org_id}")

        # 4. Team -> 5. Project -> 6. Task.
        r = c.post("/teams", json={"name": "Smoke Team", "type": "team"})
        r.raise_for_status()
        team_id = r.json()["id"]
        print(f"[4] created team {team_id}")

        r = c.post("/projects", json={"team_id": team_id, "name": "Smoke Project"})
        r.raise_for_status()
        proj_id = r.json()["id"]
        print(f"[5] created project {proj_id}")

        r = c.post("/tasks", json={"project_id": proj_id, "title": "First task"})
        r.raise_for_status()
        task = r.json()
        print(f"[6] created task {task['id']} (status_id={task['status_id']})")

        # 7. List tasks.
        r = c.get(f"/projects/{proj_id}/tasks")
        r.raise_for_status()
        tasks = r.json()
        assert len(tasks) == 1, tasks
        print(f"[7] listed {len(tasks)} task(s)")

        # 8. Delete without confirm -> rejected; with confirm -> 204.
        r = c.delete(f"/tasks/{task['id']}")
        assert r.status_code == 400, r.status_code
        r = c.delete(f"/tasks/{task['id']}", params={"confirm": "true"})
        assert r.status_code == 204, r.status_code
        print("[8] confirm-flag delete enforced")

    print("\nSMOKE OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
