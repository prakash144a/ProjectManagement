"use client";

import { useEffect, useState } from "react";
import { api, ApiError, Member, MEMBER_ROLES, Team, TeamMember } from "@/lib/api";

const labelFor = (m: { display_name: string | null; email: string | null; username: string | null }) =>
  m.display_name || m.email || m.username || "user";

type Staged = { user_id: string; role: string };

function CreateForm({ users, onCreated }: { users: Member[]; onCreated: (t: Team) => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<"team" | "group">("team");
  const [staged, setStaged] = useState<Staged[]>([]);
  const [pickUser, setPickUser] = useState("");
  const [pickRole, setPickRole] = useState("member");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const stagedIds = new Set(staged.map((s) => s.user_id));
  const available = users.filter((u) => !stagedIds.has(u.id));
  const userById = new Map(users.map((u) => [u.id, u]));

  function addStaged() {
    if (!pickUser) return;
    setStaged((s) => [...s, { user_id: pickUser, role: pickRole }]);
    setPickUser("");
    setPickRole("member");
  }

  async function submit() {
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const t = await api.teams.create({ name: name.trim(), type, members: staged });
      onCreated(t);
      setName("");
      setType("team");
      setStaged([]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ padding: 16, marginBottom: 24 }}>
      <h4 style={{ marginTop: 0, marginBottom: 12 }}>Create a team or group</h4>
      <div className="row" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <label>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Engineering" />
        </div>
        <div>
          <label>Type</label>
          <select value={type} onChange={(e) => setType(e.target.value as "team" | "group")}>
            <option value="team">Team (holds projects)</option>
            <option value="group">Group (permissions only)</option>
          </select>
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <label>Members {type === "group" ? "(for granting project access)" : ""}</label>
        <div className="row" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <select value={pickUser} onChange={(e) => setPickUser(e.target.value)}>
              <option value="">Add a member…</option>
              {available.map((u) => (
                <option key={u.id} value={u.id}>
                  {labelFor(u)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <select value={pickRole} onChange={(e) => setPickRole(e.target.value)}>
              {MEMBER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <button onClick={addStaged} disabled={!pickUser}>
            Add
          </button>
        </div>
        {staged.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {staged.map((s) => (
              <span key={s.user_id} className="badge" style={{ display: "inline-flex", gap: 6 }}>
                {labelFor(userById.get(s.user_id)!)} · {s.role}
                <span
                  onClick={() => setStaged((cur) => cur.filter((x) => x.user_id !== s.user_id))}
                  style={{ cursor: "pointer", color: "var(--text-dim)" }}
                >
                  ✕
                </span>
              </span>
            ))}
          </div>
        )}
        <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
          You’ll be added as the owner automatically.
        </p>
      </div>

      {error && <p className="error">{error}</p>}
      <div style={{ marginTop: 8 }}>
        <button className="primary" disabled={busy} onClick={submit}>
          Create {type}
        </button>
      </div>
    </div>
  );
}

function TeamCard({
  team,
  users,
  onDeleted,
}: {
  team: Team;
  users: Member[];
  onDeleted: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [pickUser, setPickUser] = useState("");
  const [pickRole, setPickRole] = useState("member");
  const [error, setError] = useState("");

  function fail(e: unknown) {
    setError(e instanceof ApiError ? e.message : "Something went wrong");
  }

  function loadMembers() {
    api.teams.members(team.id).then(setMembers).catch(fail);
  }

  useEffect(() => {
    if (open && members === null) loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const memberIds = new Set((members || []).map((m) => m.id));
  const available = users.filter((u) => !memberIds.has(u.id));

  async function addMember() {
    if (!pickUser) return;
    setError("");
    try {
      await api.teams.addMember(team.id, pickUser, pickRole);
      setPickUser("");
      setPickRole("member");
      loadMembers();
    } catch (e) {
      fail(e);
    }
  }

  async function setRole(userId: string, role: string) {
    setError("");
    try {
      await api.teams.setMemberRole(team.id, userId, role);
      loadMembers();
    } catch (e) {
      fail(e);
    }
  }

  async function removeMember(userId: string) {
    setError("");
    try {
      await api.teams.removeMember(team.id, userId);
      loadMembers();
    } catch (e) {
      fail(e);
    }
  }

  async function deleteTeam() {
    if (!confirm(`Delete ${team.type} “${team.name}”?`)) return;
    setError("");
    try {
      await api.teams.remove(team.id);
      onDeleted(team.id);
    } catch (e) {
      fail(e);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 10, overflow: "hidden" }}>
      <div
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 14px",
          cursor: "pointer",
          background: open ? "var(--surface-2)" : "var(--surface)",
        }}
      >
        <span style={{ color: "var(--text-dim)", width: 12 }}>{open ? "▾" : "▸"}</span>
        <span style={{ fontWeight: 600 }}>{team.name}</span>
        <span className="badge">{team.type}</span>
      </div>

      {open && (
        <div style={{ padding: 14, borderTop: "1px solid var(--border)" }}>
          {members === null ? (
            <div className="muted">Loading members…</div>
          ) : (
            <div style={{ marginBottom: 12 }}>
              {members.map((m) => (
                <div
                  key={m.id}
                  className="row"
                  style={{ justifyContent: "space-between", padding: "4px 0" }}
                >
                  <span>{labelFor(m)}</span>
                  <div className="row">
                    <select value={m.role} onChange={(e) => setRole(m.id, e.target.value)} style={{ width: "auto" }}>
                      {MEMBER_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    <button className="danger" style={{ padding: "2px 8px" }} onClick={() => removeMember(m.id)}>
                      Remove
                    </button>
                  </div>
                </div>
              ))}
              {members.length === 0 && <div className="muted">No members yet.</div>}
            </div>
          )}

          <div className="row" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <select value={pickUser} onChange={(e) => setPickUser(e.target.value)}>
                <option value="">Add a member…</option>
                {available.map((u) => (
                  <option key={u.id} value={u.id}>
                    {labelFor(u)}
                  </option>
                ))}
              </select>
            </div>
            <select value={pickRole} onChange={(e) => setPickRole(e.target.value)} style={{ width: "auto" }}>
              {MEMBER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <button onClick={addMember} disabled={!pickUser}>
              Add
            </button>
          </div>

          {error && <p className="error">{error}</p>}

          <div style={{ marginTop: 12 }}>
            <button className="danger" onClick={deleteTeam}>
              Delete {team.type}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function TeamsSettings() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<Member[]>([]);
  const [error, setError] = useState("");

  function fail(e: unknown) {
    setError(e instanceof ApiError ? e.message : "Something went wrong");
  }

  useEffect(() => {
    api.teams.list().then(setTeams).catch(fail);
    api.users.list().then(setUsers).catch(fail);
  }, []);

  return (
    <div style={{ padding: 24, maxWidth: 760, overflowY: "auto", height: "100%" }}>
      <h2 className="page-title">Teams &amp; Groups</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        <strong>Teams</strong> hold projects — their members can work on every project in the team
        (owners manage the team; members edit tasks). <strong>Groups</strong> are just named sets of
        people you can grant project access to from a project’s Security panel.
      </p>

      <CreateForm users={users} onCreated={(t) => setTeams((ts) => [...ts, t])} />

      {teams.map((t) => (
        <TeamCard key={t.id} team={t} users={users} onDeleted={(id) => setTeams((ts) => ts.filter((x) => x.id !== id))} />
      ))}
      {teams.length === 0 && <div className="muted">No teams or groups yet.</div>}

      {error && <p className="error">{error}</p>}
    </div>
  );
}
