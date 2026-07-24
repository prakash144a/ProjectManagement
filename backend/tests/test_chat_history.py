"""Chat conversation history: CRUD + per-user isolation within an org.

The `POST /chat` agent-persistence path needs a live Gemini key, so it's verified
manually (like the disabled inline-embedding tests). These cover the conversation
metadata endpoints and, crucially, that one org member can't reach another's
private conversations.
"""

from __future__ import annotations

import uuid


def _headers(token: str, org_id: str | None = None) -> dict:
    h = {"Authorization": f"Bearer {token}"}
    if org_id:
        h["X-Org-Id"] = org_id
    return h


def _login(client, email: str) -> tuple[str, str]:
    code = client.post("/auth/request-code", json={"identifier": email}).json()["dev_code"]
    body = client.post("/auth/verify", json={"identifier": email, "code": code}).json()
    return body["token"], body["user_id"]


def test_conversation_crud(make_actor):
    a = make_actor()

    assert a.get("/chat/conversations").json() == []

    r = a.post("/chat/conversations")
    assert r.status_code == 201, r.text
    conv = r.json()
    assert conv["title"] is None
    cid = conv["id"]

    assert len(a.get("/chat/conversations").json()) == 1
    assert a.get(f"/chat/conversations/{cid}/messages").json() == []

    r = a.patch(f"/chat/conversations/{cid}", json={"title": "Planning"})
    assert r.status_code == 200, r.text
    assert r.json()["title"] == "Planning"

    assert a.delete(f"/chat/conversations/{cid}").status_code == 204
    assert a.get("/chat/conversations").json() == []


def test_conversation_missing_is_404(make_actor):
    a = make_actor()
    rid = str(uuid.uuid4())
    assert a.get(f"/chat/conversations/{rid}/messages").status_code == 404
    assert a.patch(f"/chat/conversations/{rid}", json={"title": "x"}).status_code == 404
    assert a.delete(f"/chat/conversations/{rid}").status_code == 404


def test_cross_user_isolation_same_org(make_actor, client):
    """A second member of the SAME org cannot see/modify another user's private
    conversation — RLS scopes by org, the service filters by user_id on top."""
    a = make_actor()
    cid = a.post("/chat/conversations").json()["id"]

    # A adds user B to A's org, then B logs in and points at the shared org.
    email = f"test+{uuid.uuid4().hex[:10]}@example.com"
    assert a.post("/users", json={"email": email, "role": "member"}).status_code == 201
    token_b, _ = _login(client, email)
    hb = _headers(token_b, a.org_id)

    # B is a valid member but has no conversations of their own.
    r = client.get("/chat/conversations", headers=hb)
    assert r.status_code == 200 and r.json() == []

    # A's conversation is invisible/untouchable to B.
    assert client.get(f"/chat/conversations/{cid}/messages", headers=hb).status_code == 404
    assert client.patch(
        f"/chat/conversations/{cid}", json={"title": "hijack"}, headers=hb
    ).status_code == 404
    assert client.delete(f"/chat/conversations/{cid}", headers=hb).status_code == 404

    # A still owns it, unchanged.
    mine = a.get("/chat/conversations").json()
    assert [c["id"] for c in mine] == [cid]
