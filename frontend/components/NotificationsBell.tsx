"use client";

import { useEffect, useRef, useState } from "react";
import { api, AppNotification } from "@/lib/api";

const TEXT: Record<string, string> = {
  task_assigned: "You were assigned a task",
  task_comment: "New comment on a task you're assigned",
};

export function NotificationsBell() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const unread = items.filter((n) => !n.is_read).length;

  const load = () => api.notifications.list().then(setItems).catch(() => {});
  useEffect(() => {
    load();
    const t = setInterval(load, 30000); // no realtime yet — poll
    return () => clearInterval(t);
  }, []);

  // Close on outside click.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (open && ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function markRead(n: AppNotification) {
    if (n.is_read) return;
    try {
      const upd = await api.notifications.markRead(n.id);
      setItems((xs) => xs.map((x) => (x.id === upd.id ? upd : x)));
    } catch {
      /* ignore */
    }
  }

  async function markAll() {
    try {
      await api.notifications.markAllRead();
      setItems((xs) => xs.map((x) => ({ ...x, is_read: true })));
    } catch {
      /* ignore */
    }
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => {
          setOpen((o) => !o);
          if (!open) load();
        }}
        title="Notifications"
        style={{ position: "relative" }}
      >
        🔔
        {unread > 0 && (
          <span
            style={{
              position: "absolute",
              top: -6,
              right: -6,
              background: "var(--danger)",
              color: "#fff",
              borderRadius: 999,
              fontSize: 10,
              minWidth: 16,
              height: 16,
              lineHeight: "16px",
              textAlign: "center",
              padding: "0 4px",
            }}
          >
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 6px)",
            width: 320,
            maxHeight: 400,
            overflowY: "auto",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            boxShadow: "var(--shadow)",
            zIndex: 20,
          }}
        >
          <div
            className="row"
            style={{
              justifyContent: "space-between",
              padding: "8px 12px",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <strong>Notifications</strong>
            <button onClick={markAll} disabled={unread === 0} style={{ fontSize: 12, padding: "2px 8px" }}>
              Mark all read
            </button>
          </div>
          {items.length === 0 && (
            <div className="muted" style={{ padding: 16 }}>
              You&apos;re all caught up.
            </div>
          )}
          {items.map((n) => (
            <div
              key={n.id}
              onClick={() => markRead(n)}
              style={{
                padding: "10px 12px",
                borderBottom: "1px solid var(--border)",
                cursor: n.is_read ? "default" : "pointer",
                background: n.is_read ? "var(--surface)" : "var(--surface-2)",
                display: "flex",
                gap: 8,
                alignItems: "flex-start",
              }}
            >
              {!n.is_read && (
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "var(--primary)",
                    marginTop: 5,
                    flexShrink: 0,
                  }}
                />
              )}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13 }}>{TEXT[n.type] || n.type}</div>
                <div className="muted" style={{ fontSize: 11 }}>
                  {new Date(n.created_at).toLocaleString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
