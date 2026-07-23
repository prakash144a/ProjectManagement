"use client";

import { useEffect, useState } from "react";
import { ApiError, Comment } from "@/lib/api";

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
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
        {comments.map((c) => (
          <div
            key={c.id}
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "8px 10px",
            }}
          >
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 2 }}>
              <strong style={{ fontSize: 13 }}>{c.author_name || "Unknown"}</strong>
              <span className="row" style={{ gap: 8 }}>
                <span className="muted" style={{ fontSize: 11 }}>
                  {new Date(c.created_at).toLocaleString()}
                </span>
                {c.author_id === currentUserId && (
                  <button
                    className="danger"
                    onClick={() => del(c.id)}
                    style={{ padding: "0 6px", fontSize: 11 }}
                  >
                    ✕
                  </button>
                )}
              </span>
            </div>
            <div style={{ whiteSpace: "pre-wrap" }}>{c.body}</div>
          </div>
        ))}
        {comments.length === 0 && <div className="muted">{emptyText}</div>}
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
