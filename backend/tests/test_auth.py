from __future__ import annotations

import uuid


def test_otp_happy_path(client):
    email = f"auth+{uuid.uuid4().hex[:10]}@example.com"
    r = client.post("/auth/request-code", json={"identifier": email})
    assert r.status_code == 200, r.text
    code = r.json()["dev_code"]
    assert code and len(code) == 6

    r = client.post("/auth/verify", json={"identifier": email, "code": code})
    assert r.status_code == 200, r.text
    token = r.json()["token"]

    r = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json()["email"] == email


def test_wrong_code_rejected(client):
    email = f"auth+{uuid.uuid4().hex[:10]}@example.com"
    client.post("/auth/request-code", json={"identifier": email})
    r = client.post("/auth/verify", json={"identifier": email, "code": "000000"})
    # Note: could be a real code by chance is impossible for a targeted wrong value
    # only if it matched; 000000 vs a random 6-digit is ~1e-6. Accept 401.
    assert r.status_code == 401, r.text


def test_unknown_username_rejected(client):
    r = client.post("/auth/request-code", json={"identifier": "nobody_here_xyz"})
    assert r.status_code == 400, r.text


def test_no_token_is_unauthorized(client):
    r = client.get("/auth/me")
    assert r.status_code == 401

    r = client.get("/auth/me", headers={"Authorization": "Bearer not-a-real-token"})
    assert r.status_code == 401


def test_logout_revokes_session(client):
    email = f"auth+{uuid.uuid4().hex[:10]}@example.com"
    client.post("/auth/request-code", json={"identifier": email})
    code = client.post("/auth/request-code", json={"identifier": email}).json()["dev_code"]
    token = client.post(
        "/auth/verify", json={"identifier": email, "code": code}
    ).json()["token"]
    h = {"Authorization": f"Bearer {token}"}

    assert client.get("/auth/me", headers=h).status_code == 200
    assert client.post("/auth/logout", headers=h).status_code == 200
    assert client.get("/auth/me", headers=h).status_code == 401
