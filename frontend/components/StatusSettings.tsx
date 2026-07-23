"use client";

import { useEffect, useState } from "react";
import { api, ApiError, Status } from "@/lib/api";

const DEFAULT_COLOR = "#6b7280";

export function StatusSettings() {
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [color, setColor] = useState("#4f46e5");
  const [isCompleted, setIsCompleted] = useState(false);
  const [busy, setBusy] = useState(false);

  function fail(e: unknown) {
    setError(e instanceof ApiError ? e.message : "Something went wrong");
  }

  const load = () => api.statuses.list().then(setStatuses).catch(fail);
  useEffect(() => {
    load();
  }, []);

  async function patch(id: string, p: Parameters<typeof api.statuses.update>[1]) {
    setError("");
    try {
      const upd = await api.statuses.update(id, p);
      setStatuses((ss) =>
        // is_default is exclusive server-side; reflect that locally.
        ss.map((s) =>
          s.id === upd.id ? upd : p.is_default ? { ...s, is_default: false } : s,
        ),
      );
    } catch (e) {
      fail(e);
    }
  }

  async function move(index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= statuses.length) return;
    const ids = statuses.map((s) => s.id);
    [ids[index], ids[j]] = [ids[j], ids[index]];
    setError("");
    try {
      setStatuses(await api.statuses.reorder(ids));
    } catch (e) {
      fail(e);
    }
  }

  async function remove(s: Status) {
    if (!confirm(`Delete status "${s.name}"? Tasks using it will become "No status".`)) return;
    setError("");
    try {
      await api.statuses.remove(s.id);
      setStatuses((ss) => ss.filter((x) => x.id !== s.id));
    } catch (e) {
      fail(e);
    }
  }

  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    setError("");
    try {
      const s = await api.statuses.create({ name: name.trim(), color, is_completed: isCompleted });
      setStatuses((ss) => [...ss, s]);
      setName("");
      setIsCompleted(false);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 720 }}>
      <h2 className="page-title">Statuses</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        The status catalog powers the Kanban columns. Mark which statuses count as{" "}
        <strong>Done</strong>, pick the <strong>Default</strong> for new tasks, and drag order with the
        arrows. (Requires Admin or Owner.)
      </p>

      <div className="card" style={{ overflow: "hidden", marginBottom: 20 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "60px 1fr 80px 90px 120px",
            padding: "8px 12px",
            background: "var(--surface-2)",
            fontSize: 12,
            color: "var(--text-dim)",
          }}
        >
          <span>Order</span>
          <span>Name</span>
          <span>Done</span>
          <span>Default</span>
          <span></span>
        </div>
        {statuses.map((s, i) => (
          <div
            key={s.id}
            style={{
              display: "grid",
              gridTemplateColumns: "60px 1fr 80px 90px 120px",
              alignItems: "center",
              padding: "8px 12px",
              borderTop: "1px solid var(--border)",
            }}
          >
            <div className="row" style={{ gap: 2 }}>
              <button onClick={() => move(i, -1)} disabled={i === 0} style={{ padding: "0 6px" }}>
                ↑
              </button>
              <button
                onClick={() => move(i, 1)}
                disabled={i === statuses.length - 1}
                style={{ padding: "0 6px" }}
              >
                ↓
              </button>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <input
                type="color"
                value={s.color || DEFAULT_COLOR}
                onChange={(e) => patch(s.id, { color: e.target.value })}
                style={{ width: 32, height: 28, padding: 0 }}
                title="Color"
              />
              <input
                defaultValue={s.name}
                onBlur={(e) => {
                  if (e.target.value.trim() && e.target.value !== s.name)
                    patch(s.id, { name: e.target.value.trim() });
                }}
              />
            </div>
            <input
              type="checkbox"
              checked={s.is_completed}
              onChange={(e) => patch(s.id, { is_completed: e.target.checked })}
              style={{ width: 16 }}
            />
            {s.is_default ? (
              <span className="badge">default</span>
            ) : (
              <button onClick={() => patch(s.id, { is_default: true })} style={{ padding: "2px 8px" }}>
                Set
              </button>
            )}
            <button className="danger" onClick={() => remove(s)} style={{ padding: "2px 8px" }}>
              Delete
            </button>
          </div>
        ))}
      </div>

      <h3 style={{ marginBottom: 8 }}>Add a status</h3>
      <div className="row" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          style={{ width: 36, height: 36, padding: 0 }}
          title="Color"
        />
        <div style={{ flex: 1, minWidth: 160 }}>
          <label>Name</label>
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
            checked={isCompleted}
            onChange={(e) => setIsCompleted(e.target.checked)}
            style={{ width: 16 }}
          />
          Counts as done
        </label>
        <button className="primary" disabled={busy} onClick={add} style={{ marginBottom: 8 }}>
          Add
        </button>
      </div>

      {error && <p className="error">{error}</p>}
    </div>
  );
}
