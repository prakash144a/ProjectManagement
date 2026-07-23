"use client";

import { useState } from "react";
import { ChatConversation } from "./ChatConversation";

export function ChatWidget({ orgId }: { orgId: string }) {
  const [open, setOpen] = useState(false);

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

  const openInWindow = (
    <button
      onClick={() => window.open("/chat", "pm-chat", "width=440,height=720")}
      title="Open in a separate window"
      aria-label="Open chat in a separate window"
      style={{ border: "none", background: "transparent", fontSize: 15, cursor: "pointer" }}
    >
      ↗
    </button>
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
        persistKey={`pm_chat:${orgId}`}
        headerExtra={openInWindow}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}
