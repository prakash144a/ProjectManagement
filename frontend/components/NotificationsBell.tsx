"use client";

import { useEffect, useRef, useState } from "react";
import { api, AppNotification } from "@/lib/api";

const META: Record<string, { text: string; icon: string }> = {
  task_assigned: { text: "You were assigned a task", icon: "📌" },
  task_comment: { text: "New comment on a task you're assigned", icon: "💬" },
};

// Compact relative time ("just now", "3h ago", "2d ago") with a full-date title.
function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

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
        className="icon-btn"
        onClick={() => {
          setOpen((o) => !o);
          if (!open) load();
        }}
        title="Notifications"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        style={{ position: "relative", fontSize: 16 }}
      >
        🔔
        {unread > 0 && (
          <span
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              background: "var(--danger)",
              color: "#fff",
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 700,
              minWidth: 16,
              height: 16,
              lineHeight: "16px",
              textAlign: "center",
              padding: "0 4px",
              boxShadow: "0 0 0 2px var(--surface)",
            }}
          >
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="popover animate-pop"
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 8px)",
            width: 340,
            maxHeight: 440,
            overflowY: "auto",
            zIndex: 20,
          }}
        >
          <div
            className="row"
            style={{
              justifyContent: "space-between",
              padding: "10px 14px",
              borderBottom: "1px solid var(--border)",
              position: "sticky",
              top: 0,
              background: "var(--surface)",
            }}
          >
            <strong style={{ display: "flex", alignItems: "center", gap: 6 }}>
              Notifications
              {unread > 0 && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--primary)",
                    background: "color-mix(in srgb, var(--primary) 14%, transparent)",
                    borderRadius: 999,
                    padding: "1px 7px",
                  }}
                >
                  {unread}
                </span>
              )}
            </strong>
            <button onClick={markAll} disabled={unread === 0} style={{ fontSize: 12, padding: "3px 9px" }}>
              Mark all read
            </button>
          </div>
          {items.length === 0 && (
            <div className="empty-state" style={{ padding: "32px 24px" }}>
              <div className="emoji">🎉</div>
              <div className="title">You&apos;re all caught up</div>
              <div className="desc">New assignments and comments will show up here.</div>
            </div>
          )}
          {items.map((n) => {
            const meta = META[n.type];
            return (
              <div
                key={n.id}
                className="list-row"
                onClick={() => markRead(n)}
                style={{
                  padding: "11px 14px",
                  borderBottom: "1px solid var(--border)",
                  cursor: n.is_read ? "default" : "pointer",
                  background: n.is_read ? "var(--surface)" : "color-mix(in srgb, var(--primary) 6%, var(--surface))",
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                }}
              >
                <span style={{ fontSize: 16, lineHeight: "18px", flexShrink: 0 }}>{meta?.icon || "🔔"}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: n.is_read ? 400 : 600 }}>{meta?.text || n.type}</div>
                  <div className="muted" style={{ fontSize: 11, marginTop: 1 }} title={new Date(n.created_at).toLocaleString()}>
                    {relTime(n.created_at)}
                  </div>
                </div>
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
