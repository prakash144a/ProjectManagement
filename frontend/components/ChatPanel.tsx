"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ChatConversation } from "./ChatConversation";
import { ResizeHandle } from "./ResizeHandle";
import { useResizableWidth } from "@/lib/useResizableWidth";

/**
 * The assistant docked as a right-side panel (same footprint as TaskDetail).
 * The parent controls visibility by mounting/unmounting this component; when
 * both are open the layout is [main content][TaskDetail][ChatPanel], chat
 * rightmost. It's a single rolling thread: it tracks the *active* conversation
 * id (just the id, in localStorage) and restores the most recent one on mount.
 * The full conversation list/switcher lives on the /chat page.
 */
export function ChatPanel({ orgId, onClose }: { orgId: string; onClose: () => void }) {
  const activeKey = `pm_chat_active:${orgId}`;
  const [convId, setConvId] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const { width, dragging, handleProps } = useResizableWidth({
    storageKey: "pm_w_chat",
    defaultWidth: 380,
    min: 320,
    max: 640,
    side: "left",
  });

  useEffect(() => {
    if (restored) return;
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
  }, [restored, activeKey]);

  function setActive(id: string | null) {
    setConvId(id);
    if (id) localStorage.setItem(activeKey, id);
    else localStorage.removeItem(activeKey);
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
        onClick={() => window.open("/chat", "pm-chat")}
        title="Open in a new tab"
        aria-label="Open chat in a new tab"
        style={{ border: "none", background: "transparent", fontSize: 15, cursor: "pointer" }}
      >
        ↗
      </button>
    </>
  );

  return (
    <aside
      style={{
        position: "relative",
        width,
        flexShrink: 0,
        borderLeft: "1px solid var(--border)",
        background: "var(--surface)",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
      }}
    >
      <ResizeHandle side="left" dragging={dragging} handleProps={handleProps} />
      <ChatConversation
        conversationId={convId}
        onConversationChanged={(c) => setActive(c.id)}
        headerExtra={headerControls}
        onClose={onClose}
      />
    </aside>
  );
}
