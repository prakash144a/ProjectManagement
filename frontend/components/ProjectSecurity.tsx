"use client";

import { useEffect, useState } from "react";
import { api, ApiError, Grant, Group, Member, PROJECT_ROLES } from "@/lib/api";

export function ProjectSecurity({ projectId }: { projectId: string }) {
  const [grants, setGrants] = useState<Grant[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [error, setError] = useState("");

  const [principalType, setPrincipalType] = useState<"user" | "group">("user");
  const [principalId, setPrincipalId] = useState("");
  const [role, setRole] = useState<string>("member");
  const [busy, setBusy] = useState(false);

  function fail(e: unknown) {
    setError(e instanceof ApiError ? e.message : "Something went wrong");
  }

  useEffect(() => {
    api.security.listGrants(projectId).then(setGrants).catch(fail);
    api.users.list().then(setMembers).catch(fail);
    api.security.groups().then(setGroups).catch(fail);
  }, [projectId]);

  async function add() {
    if (!principalId) {
      setError("Pick a user or group.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const g = await api.security.addGrant(projectId, {
        principal_type: principalType,
        principal_id: principalId,
        role,
      });
      // upsert into list (server upserts per principal)
      setGrants((gs) => {
        const others = gs.filter((x) => x.id !== g.id);
        return [...others, g];
      });
      setPrincipalId("");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function remove(g: Grant) {
    setError("");
    try {
      await api.security.deleteGrant(projectId, g.id);
      setGrants((gs) => gs.filter((x) => x.id !== g.id));
    } catch (e) {
      fail(e);
    }
  }

  const labelFor = (m: Member) => m.display_name || m.email || m.username || m.id.slice(0, 8);

  return (
    <div style={{ padding: 24, maxWidth: 720, overflowY: "auto", height: "100%" }}>
      <h2 className="page-title">Security</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Grant users or groups access to <em>this project</em>. These add to any access inherited from the
        team/organization. (Requires Admin.)
      </p>

      <div className="card" style={{ overflow: "hidden", marginBottom: 20 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.6fr 80px 100px 80px",
            padding: "8px 12px",
            background: "var(--surface-2)",
            fontSize: 12,
            color: "var(--text-dim)",
          }}
        >
          <span>Principal</span>
          <span>Type</span>
          <span>Role</span>
          <span></span>
        </div>
        {grants.map((g) => (
          <div
            key={g.id}
            style={{
              display: "grid",
              gridTemplateColumns: "1.6fr 80px 100px 80px",
              alignItems: "center",
              padding: "8px 12px",
              borderTop: "1px solid var(--border)",
            }}
          >
            <span>{g.principal_name || "—"}</span>
            <span className="muted">{g.principal_type}</span>
            <span className="badge">{g.role}</span>
            <button className="danger" onClick={() => remove(g)} style={{ padding: "2px 8px" }}>
              Remove
            </button>
          </div>
        ))}
        {grants.length === 0 && (
          <div className="muted" style={{ padding: 12 }}>
            No project-specific grants yet.
          </div>
        )}
      </div>

      <h4 style={{ marginBottom: 8 }}>Grant access</h4>
      <div className="row" style={{ flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <label>Type</label>
          <select
            value={principalType}
            onChange={(e) => {
              setPrincipalType(e.target.value as "user" | "group");
              setPrincipalId("");
            }}
          >
            <option value="user">User</option>
            <option value="group">Group</option>
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <label>{principalType === "user" ? "User" : "Group"}</label>
          <select value={principalId} onChange={(e) => setPrincipalId(e.target.value)}>
            <option value="">Select…</option>
            {principalType === "user"
              ? members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {labelFor(m)}
                  </option>
                ))
              : groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} {g.type === "team" ? "(team)" : ""}
                  </option>
                ))}
          </select>
        </div>
        <div>
          <label>Role</label>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            {PROJECT_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <button className="primary" disabled={busy} onClick={add} style={{ marginBottom: 0 }}>
          Grant
        </button>
      </div>

      {error && <p className="error">{error}</p>}
    </div>
  );
}
