"use client";

import { useEffect, useState } from "react";
import { api, ApiError, TaskGroupDef } from "@/lib/api";

export function OrgSettings({ orgName }: { orgName: string }) {
  const [defs, setDefs] = useState<TaskGroupDef[]>([]);
  const [name, setName] = useState("");
  const [isDefault, setIsDefault] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = () => api.catalog.definitions().then(setDefs).catch(fail);
  useEffect(() => {
    load();
  }, []);

  function fail(e: unknown) {
    setError(e instanceof ApiError ? e.message : "Something went wrong");
  }

  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    setError("");
    try {
      const d = await api.catalog.createDefinition(name.trim(), isDefault);
      setDefs((ds) => [...ds, d]);
      setName("");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function toggleDefault(d: TaskGroupDef) {
    setError("");
    try {
      const upd = await api.catalog.updateDefinition(d.id, { is_default: !d.is_default });
      setDefs((ds) => ds.map((x) => (x.id === d.id ? upd : x)));
    } catch (e) {
      fail(e);
    }
  }

  async function remove(d: TaskGroupDef) {
    if (!confirm(`Delete task group "${d.name}" from the catalog?`)) return;
    setError("");
    try {
      await api.catalog.deleteDefinition(d.id);
      setDefs((ds) => ds.filter((x) => x.id !== d.id));
    } catch (e) {
      fail(e);
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 640 }}>
      <h2 className="page-title">{orgName}</h2>
      <h3 style={{ marginBottom: 4 }}>Task groups</h3>
      <p className="muted" style={{ marginTop: 0 }}>
        Groups marked <strong>Default</strong> are added automatically to every new project.
        (Requires Admin or Owner.)
      </p>

      <div className="card" style={{ overflow: "hidden", marginBottom: 16 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 90px 80px",
            padding: "8px 12px",
            background: "var(--surface-2)",
            fontSize: 12,
            color: "var(--text-dim)",
          }}
        >
          <span>Name</span>
          <span>Default</span>
          <span></span>
        </div>
        {defs.map((d) => (
          <div
            key={d.id}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 90px 80px",
              alignItems: "center",
              padding: "8px 12px",
              borderTop: "1px solid var(--border)",
            }}
          >
            <span>{d.name}</span>
            <input
              type="checkbox"
              checked={d.is_default}
              onChange={() => toggleDefault(d)}
              style={{ width: 16 }}
            />
            <button className="danger" onClick={() => remove(d)} style={{ padding: "2px 8px" }}>
              Delete
            </button>
          </div>
        ))}
        {defs.length === 0 && (
          <div className="muted" style={{ padding: 12 }}>
            No task groups in the catalog yet.
          </div>
        )}
      </div>

      <div className="row" style={{ alignItems: "flex-end" }}>
        <div style={{ flex: 1 }}>
          <label>New task group</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="e.g. In Review"
          />
        </div>
        <label className="row" style={{ gap: 6, marginBottom: 8 }}>
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            style={{ width: 16 }}
          />
          Default
        </label>
        <button className="primary" disabled={busy} onClick={add} style={{ marginBottom: 8 }}>
          Add
        </button>
      </div>

      {error && <p className="error">{error}</p>}
    </div>
  );
}
