"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ChatConversation } from "./ChatConversation";

export function ChatWidget({ orgId }: { orgId: string }) {
  const [open, setOpen] = useState(false);
  // The widget is a single rolling thread: it tracks the *active* conversation id
  // (just the id, in localStorage) and restores the most recent one on first open.
  // The full conversation list/switcher lives on the /chat page.
  const activeKey = `pm_chat_active:${orgId}`;
  const [convId, setConvId] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    if (!open || restored) return;
    let cancelled = false;
    const stored = localStorage.getItem(activeKey);
    if (stored) {
      setConvId(stored);
      setRestored(true);
      return;
    }
    // No remembered thread — fall back to the most recent conversation, if any.
    api.chat
      .conversations()
      .then((list) => {
        if (!cancelled && list.length > 0) setConvId(list[0].id);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setRestored(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, restored, activeKey]);

  function setActive(id: string | null) {
    setConvId(id);
    if (id) localStorage.setItem(activeKey, id);
    else localStorage.removeItem(activeKey);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Assistant"
        aria-label="Open assistant"
        style={{
          position: "fixed",
          right: 20,
          bottom: 20,
          width: 40,
          height: 40,
          borderRadius: "50%",
          border: "none",
          background: "var(--primary)",
          color: "#fff",
          fontSize: 17,
          cursor: "pointer",
          boxShadow: "0 4px 14px rgba(0,0,0,0.22)",
          zIndex: 60,
        }}
      >
        💬
      </button>
    );
  }

  const headerControls = (
    <>
      <button
        onClick={() => setActive(null)}
        title="New chat"
        aria-label="New chat"
        style={{ border: "none", background: "transparent", fontSize: 13, cursor: "pointer" }}
      >
        + New
      </button>
      <button
        onClick={() => window.open("/chat", "pm-chat", "width=440,height=720")}
        title="Open in a separate window"
        aria-label="Open chat in a separate window"
        style={{ border: "none", background: "transparent", fontSize: 15, cursor: "pointer" }}
      >
        ↗
      </button>
    </>
  );

  return (
    <div
      style={{
        position: "fixed",
        right: 20,
        bottom: 20,
        width: 380,
        maxWidth: "calc(100vw - 40px)",
        height: 560,
        maxHeight: "calc(100vh - 40px)",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        boxShadow: "0 12px 40px rgba(0,0,0,0.3)",
        zIndex: 60,
        overflow: "hidden",
      }}
    >
      <ChatConversation
        conversationId={convId}
        onConversationChanged={(c) => setActive(c.id)}
        headerExtra={headerControls}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}
