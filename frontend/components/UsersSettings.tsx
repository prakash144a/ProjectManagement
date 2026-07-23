"use client";

import { useEffect, useState } from "react";
import { api, ApiError, Member, ROLES } from "@/lib/api";

export function UsersSettings() {
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState("");

  // create form
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<string>("member");
  const [busy, setBusy] = useState(false);

  function fail(e: unknown) {
    setError(e instanceof ApiError ? e.message : "Something went wrong");
  }

  const load = () => api.users.list().then(setMembers).catch(fail);
  useEffect(() => {
    load();
  }, []);

  async function create() {
    if (!email.trim() && !mobile.trim()) {
      setError("Provide an email or mobile number (needed for OTP login).");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const m = await api.users.create({
        username: username.trim() || undefined,
        email: email.trim() || undefined,
        mobile: mobile.trim() || undefined,
        display_name: displayName.trim() || undefined,
        role,
      });
      setMembers((ms) => [...ms, m]);
      setUsername("");
      setEmail("");
      setMobile("");
      setDisplayName("");
      setRole("member");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(m: Member, newRole: string) {
    setError("");
    try {
      const upd = await api.users.setRole(m.id, newRole);
      setMembers((ms) => ms.map((x) => (x.id === m.id ? upd : x)));
    } catch (e) {
      fail(e);
    }
  }

  const nameOf = (m: Member) =>
    m.display_name || m.username || m.email || m.mobile || m.id.slice(0, 8);

  return (
    <div style={{ padding: 24, maxWidth: 760 }}>
      <h2 className="page-title">Users</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Admins and Owners can add users directly. Users log in passwordlessly with their
        username, email, or mobile; the one-time code is sent to their email or mobile.
      </p>

      <div className="card" style={{ overflow: "hidden", marginBottom: 20 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.4fr 1.6fr 1fr 120px",
            padding: "8px 12px",
            background: "var(--surface-2)",
            fontSize: 12,
            color: "var(--text-dim)",
          }}
        >
          <span>Name</span>
          <span>Email / Mobile</span>
          <span>Username</span>
          <span>Role</span>
        </div>
        {members.map((m) => (
          <div
            key={m.id}
            style={{
              display: "grid",
              gridTemplateColumns: "1.4fr 1.6fr 1fr 120px",
              alignItems: "center",
              padding: "8px 12px",
              borderTop: "1px solid var(--border)",
            }}
          >
            <span>{nameOf(m)}</span>
            <span className="muted">{m.email || m.mobile || "—"}</span>
            <span className="muted">{m.username || "—"}</span>
            <select value={m.role || "member"} onChange={(e) => changeRole(m, e.target.value)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <h3 style={{ marginBottom: 8 }}>Add a user</h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label>Display name</label>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <div>
          <label>Username</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
        <div>
          <label>Email (for OTP)</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </div>
        <div>
          <label>Mobile (for OTP)</label>
          <input value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="+15551234567" />
        </div>
        <div>
          <label>Role</label>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="primary" disabled={busy} onClick={create}>
          {busy ? "Adding…" : "Add user"}
        </button>
      </div>

      {error && <p className="error">{error}</p>}
    </div>
  );
}
