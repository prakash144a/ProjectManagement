"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { store } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ChatConversation } from "@/components/ChatConversation";

// Full-page chat experience. Opens in its own tab/window from the widget's ↗
// button and shares the current conversation (same localStorage key per org).
export default function ChatPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [orgId, setOrgId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  useEffect(() => {
    setOrgId(store.getOrg());
  }, []);

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
    <div style={{ height: "100vh", display: "flex", justifyContent: "center", background: "var(--bg)" }}>
      <div
        style={{
          width: "100%",
          maxWidth: 820,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "var(--surface)",
          borderLeft: "1px solid var(--border)",
          borderRight: "1px solid var(--border)",
        }}
      >
        <ChatConversation
          persistKey={`pm_chat:${orgId}`}
          headerExtra={
            <Link href="/home" style={{ fontSize: 13, color: "var(--text-dim)" }} title="Back to the app">
              ← App
            </Link>
          }
        />
      </div>
    </div>
  );
}
