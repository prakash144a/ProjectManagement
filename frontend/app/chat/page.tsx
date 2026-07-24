"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, store, ChatConversation as Conversation } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ChatConversation } from "@/components/ChatConversation";

// Full-page chat experience with a conversation sidebar (create / switch /
// rename / delete). Opens in its own tab/window from the widget's ↗ button and
// shares the same DB-backed conversations.
export default function ChatPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [orgId, setOrgId] = useState<string | null>(null);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  useEffect(() => {
    setOrgId(store.getOrg());
  }, []);

  const refresh = useCallback(async (): Promise<Conversation[]> => {
    const list = await api.chat.conversations().catch(() => [] as Conversation[]);
    setConversations(list);
    return list;
  }, []);

  // Initial load: fetch the list and open the most recent conversation.
  useEffect(() => {
    if (!orgId) return;
    refresh().then((list) => {
      setSelected((cur) => cur ?? (list.length > 0 ? list[0].id : null));
    });
  }, [orgId, refresh]);

  function onConversationChanged(c: { id: string; title: string | null }) {
    setSelected(c.id);
    // A newly-created conversation won't be in the list yet; refresh to pick it
    // up (and to reflect the auto-title / updated ordering).
    refresh();
  }

  async function del(id: string) {
    await api.chat.remove(id).catch(() => {});
    const list = await refresh();
    if (selected === id) setSelected(list.length > 0 ? list[0].id : null);
  }

  function startRename(c: Conversation) {
    setEditingId(c.id);
    setEditTitle(c.title ?? "");
  }

  async function commitRename() {
    const id = editingId;
    const title = editTitle.trim();
    setEditingId(null);
    if (!id || !title) return;
    await api.chat.rename(id, title).catch(() => {});
    refresh();
  }

  if (loading || !user) {
    return <div style={{ padding: 40 }} className="muted">Loading…</div>;
  }
  if (!orgId) {
    return (
      <div style={{ padding: 40 }} className="muted">
        No organization selected. <Link href="/home">Open the app</Link> and pick one first.
      </div>
    );
  }

  return (
    <div style={{ height: "100vh", background: "var(--bg)" }}>
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "var(--surface)",
        }}
      >
        {/* Sidebar */}
        <aside
          style={{
            width: 260,
            flexShrink: 0,
            borderRight: "1px solid var(--border)",
            background: "var(--surface-2)",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
          }}
        >
          <div style={{ padding: 12, borderBottom: "1px solid var(--border)" }}>
            <button
              className="primary"
              onClick={() => setSelected(null)}
              style={{ width: "100%", padding: "9px 12px", fontSize: 14 }}
            >
              + New chat
            </button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 8, minHeight: 0 }}>
            {conversations.length === 0 && (
              <div className="muted" style={{ fontSize: 13, padding: "8px 6px" }}>
                No conversations yet.
              </div>
            )}
            {conversations.map((c) => {
              const active = c.id === selected;
              return (
                <div
                  key={c.id}
                  onClick={() => setSelected(c.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 10px",
                    borderRadius: 8,
                    cursor: "pointer",
                    background: active ? "var(--surface)" : "transparent",
                    border: active ? "1px solid var(--border)" : "1px solid transparent",
                  }}
                >
                  {editingId === c.id ? (
                    <input
                      autoFocus
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename();
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      onBlur={commitRename}
                      style={{ flex: 1, fontSize: 13, padding: "3px 6px" }}
                    />
                  ) : (
                    <span
                      style={{ flex: 1, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      title={c.title ?? "New chat"}
                    >
                      {c.title || "New chat"}
                    </span>
                  )}
                  {editingId !== c.id && (
                    <>
                      <button
                        onClick={(e) => { e.stopPropagation(); startRename(c); }}
                        title="Rename"
                        aria-label="Rename conversation"
                        style={{ border: "none", background: "transparent", fontSize: 12, cursor: "pointer", color: "var(--text-dim)" }}
                      >
                        ✎
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); del(c.id); }}
                        title="Delete"
                        aria-label="Delete conversation"
                        style={{ border: "none", background: "transparent", fontSize: 12, cursor: "pointer", color: "var(--text-dim)" }}
                      >
                        🗑
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </aside>

        {/* Conversation */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <ChatConversation
            key={selected ?? "new"}
            conversationId={selected}
            onConversationChanged={onConversationChanged}
            variant="full"
            title={
              (selected && conversations.find((c) => c.id === selected)?.title) || "New chat"
            }
          />
        </div>
      </div>
    </div>
  );
}
