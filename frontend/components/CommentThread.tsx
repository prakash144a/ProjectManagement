"use client";

import { useEffect, useState } from "react";
import { ApiError, Comment } from "@/lib/api";
import { Avatar, EmptyState } from "./ui";

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

export function CommentThread({
  load,
  add,
  remove,
  currentUserId,
  emptyText = "No comments yet.",
}: {
  load: () => Promise<Comment[]>;
  add: (body: string) => Promise<Comment>;
  remove: (id: string) => Promise<void>;
  currentUserId: string;
  emptyText?: string;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function fail(e: unknown) {
    setError(e instanceof ApiError ? e.message : "Something went wrong");
  }

  useEffect(() => {
    load().then(setComments).catch(fail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit() {
    if (!text.trim()) return;
    setBusy(true);
    setError("");
    try {
      const c = await add(text.trim());
      setComments((cs) => [...cs, c]);
      setText("");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function del(id: string) {
    setError("");
    try {
      await remove(id);
      setComments((cs) => cs.filter((c) => c.id !== id));
    } catch (e) {
      fail(e);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 14 }}>
        {comments.map((c) => {
          const name = c.author_name || "Unknown";
          const mine = c.author_id === currentUserId;
          return (
            <div key={c.id} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <Avatar name={name} seed={c.author_id || name} size={30} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row" style={{ justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ display: "flex", alignItems: "baseline", gap: 7, minWidth: 0 }}>
                    <strong style={{ fontSize: 13 }}>{name}</strong>
                    <span className="muted" style={{ fontSize: 11 }} title={new Date(c.created_at).toLocaleString()}>
                      {relTime(c.created_at)}
                    </span>
                  </span>
                  {mine && (
                    <button
                      className="icon-btn"
                      title="Delete comment"
                      onClick={() => del(c.id)}
                      style={{ padding: "2px 6px", fontSize: 11, color: "var(--text-dim)" }}
                    >
                      ✕
                    </button>
                  )}
                </div>
                <div
                  style={{
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    borderRadius: "3px 10px 10px 10px",
                    padding: "8px 11px",
                    whiteSpace: "pre-wrap",
                    fontSize: 13.5,
                    lineHeight: 1.5,
                  }}
                >
                  {c.body}
                </div>
              </div>
            </div>
          );
        })}
        {comments.length === 0 && (
          <EmptyState emoji="💬" title={emptyText} desc="Be the first to weigh in." />
        )}
      </div>

      <textarea
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
        }}
        placeholder="Write a comment… (Ctrl/⌘+Enter to send)"
      />
      {error && <p className="error">{error}</p>}
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 6 }}>
        <button className="primary" disabled={busy || !text.trim()} onClick={submit}>
          {busy ? "Posting…" : "Comment"}
        </button>
      </div>
    </div>
  );
}
