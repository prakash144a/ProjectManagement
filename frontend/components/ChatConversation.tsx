"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api, ApiError, ChatAction } from "@/lib/api";
import { VoiceSession } from "@/lib/voice";

export type Msg = { role: "user" | "assistant"; content: string; actions?: ChatAction[] };
type VoiceStatus = "off" | "connecting" | "listening";

const GREETING =
  "Hi! I can help you manage your teams, projects, and tasks. Try “what's on my plate this week?” or “create a task in Alpha to draft the report, due Friday”. Tap 🎙 to talk instead.";

/**
 * The full chat experience (text + voice), used by both the floating widget and
 * the dedicated /chat page. Fills its parent; the parent controls size/chrome.
 *
 * Conversations are DB-backed: `conversationId` selects the thread (null = a new,
 * not-yet-created conversation — the first send creates it server-side). When the
 * server assigns/returns a conversation, `onConversationChanged` bubbles it up so
 * the parent can track the active id and refresh its list.
 */
export function ChatConversation({
  conversationId,
  onConversationChanged,
  title = "Assistant",
  headerExtra,
  onClose,
}: {
  conversationId: string | null;
  onConversationChanged?: (conv: { id: string; title: string | null }) => void;
  title?: string;
  headerExtra?: ReactNode;
  onClose?: () => void;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // --- load the selected conversation's messages from the DB ---
  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api.chat
      .messages(conversationId)
      .then((rows) => {
        if (cancelled) return;
        setMessages(
          rows.map((r) => ({
            role: r.role,
            content: r.content,
            actions: r.actions ?? undefined,
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setMessages([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  // --- voice ---
  const [voice, setVoice] = useState<VoiceStatus>("off");
  const [liveUser, setLiveUser] = useState("");
  const [liveAsst, setLiveAsst] = useState("");
  const voiceRef = useRef<VoiceSession | null>(null);
  const liveUserRef = useRef("");
  const liveAsstRef = useRef("");

  function flushLive() {
    const u = liveUserRef.current.trim();
    const a = liveAsstRef.current.trim();
    if (u || a) {
      setMessages((m) => [
        ...m,
        ...(u ? [{ role: "user", content: u } as Msg] : []),
        ...(a ? [{ role: "assistant", content: a } as Msg] : []),
      ]);
    }
    liveUserRef.current = "";
    liveAsstRef.current = "";
    setLiveUser("");
    setLiveAsst("");
  }

  function stopVoice() {
    voiceRef.current?.stop();
    voiceRef.current = null;
    flushLive();
    setVoice("off");
  }

  async function startVoice() {
    if (voiceRef.current) return;
    setVoice("connecting");
    const vs = new VoiceSession({
      onStatus: (s) => {
        if (s === "closed") stopVoice();
        else setVoice(s);
      },
      onTranscript: (role, frag) => {
        if (role === "user") {
          liveUserRef.current += frag;
          setLiveUser(liveUserRef.current);
        } else {
          liveAsstRef.current += frag;
          setLiveAsst(liveAsstRef.current);
        }
      },
      onTurnComplete: () => flushLive(),
      onError: (msg) => {
        setMessages((m) => [...m, { role: "assistant", content: msg }]);
        stopVoice();
      },
    });
    voiceRef.current = vs;
    try {
      await vs.start();
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "Couldn't start voice." }]);
      stopVoice();
    }
  }

  // Stop voice on unmount (e.g. the widget drawer closing).
  useEffect(() => {
    return () => {
      voiceRef.current?.stop();
      voiceRef.current = null;
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy, liveUser, liveAsst]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setMessages((m) => [...m, { role: "user", content: text }]);
    setInput("");
    setBusy(true);
    try {
      const res = await api.chat.send(text, conversationId);
      setMessages((m) => [...m, { role: "assistant", content: res.reply, actions: res.actions }]);
      // The server may have just created the conversation (conversationId was null),
      // or refreshed its title/order — let the parent track it.
      onConversationChanged?.({ id: res.conversation_id, title: res.title });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Something went wrong.";
      setMessages((m) => [...m, { role: "assistant", content: msg }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", minHeight: 0 }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 14px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface-2)",
        }}
      >
        <span style={{ fontWeight: 600, flex: 1 }}>{title}</span>
        {headerExtra}
        {onClose && (
          <button
            onClick={onClose}
            title="Close"
            aria-label="Close assistant"
            style={{ border: "none", background: "transparent", fontSize: 18, cursor: "pointer" }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
        {loading && (
          <div className="muted" style={{ fontSize: 13 }}>
            Loading…
          </div>
        )}
        {!loading && messages.length === 0 && (
          <div className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
            {GREETING}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "85%" }}>
            <div
              className={m.role === "assistant" ? "md" : undefined}
              style={{
                padding: "8px 12px",
                borderRadius: 12,
                fontSize: 14,
                lineHeight: 1.45,
                whiteSpace: m.role === "user" ? "pre-wrap" : undefined,
                wordBreak: "break-word",
                background: m.role === "user" ? "var(--primary)" : "var(--surface-2)",
                color: m.role === "user" ? "#fff" : "var(--text)",
              }}
            >
              {m.role === "assistant" ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
              ) : (
                m.content
              )}
            </div>
            {m.actions && m.actions.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                {m.actions.map((a, j) => (
                  <span
                    key={j}
                    className="badge"
                    style={{ fontSize: 11, color: a.ok ? "var(--text-dim)" : "#dc2626" }}
                    title={a.ok ? "succeeded" : "failed"}
                  >
                    {a.ok ? "✓" : "✕"} {a.tool}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div className="muted" style={{ fontSize: 13, alignSelf: "flex-start" }}>
            Thinking…
          </div>
        )}

        {/* Live voice transcripts for the in-progress turn */}
        {liveUser && (
          <div style={{ alignSelf: "flex-end", maxWidth: "85%" }}>
            <div style={{ padding: "8px 12px", borderRadius: 12, fontSize: 14, opacity: 0.75, background: "var(--primary)", color: "#fff" }}>
              {liveUser}
            </div>
          </div>
        )}
        {liveAsst && (
          <div style={{ alignSelf: "flex-start", maxWidth: "85%" }}>
            <div style={{ padding: "8px 12px", borderRadius: 12, fontSize: 14, opacity: 0.8, background: "var(--surface-2)", color: "var(--text)" }}>
              {liveAsst}
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* Voice status strip */}
      {voice !== "off" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 12px",
            borderTop: "1px solid var(--border)",
            background: "var(--surface-2)",
            fontSize: 12,
            color: "var(--text-dim)",
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: voice === "listening" ? "#16a34a" : "var(--text-dim)",
              boxShadow: voice === "listening" ? "0 0 0 3px rgba(22,163,74,0.2)" : undefined,
            }}
          />
          {voice === "connecting"
            ? "Connecting…"
            : "Listening — speak, then pause and I'll reply. Tap ⏹ to end."}
        </div>
      )}

      {/* Composer */}
      <div style={{ borderTop: "1px solid var(--border)", padding: 10, display: "flex", gap: 8, alignItems: "flex-end" }}>
        <button
          onClick={() => (voice === "off" ? startVoice() : stopVoice())}
          title={voice === "off" ? "Start voice" : "Stop voice"}
          aria-label={voice === "off" ? "Start voice" : "Stop voice"}
          style={{
            flexShrink: 0,
            width: 38,
            height: 38,
            borderRadius: "50%",
            padding: 0,
            border: "1px solid var(--border)",
            background: voice !== "off" ? "#dc2626" : "var(--surface)",
            color: voice !== "off" ? "#fff" : "var(--text)",
            fontSize: 16,
          }}
        >
          {voice === "off" ? "🎙" : "⏹"}
        </button>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Ask or tell me to do something…"
          rows={1}
          style={{ flex: 1, resize: "none", maxHeight: 120, fontSize: 14, padding: "8px 10px" }}
        />
        <button className="primary" onClick={send} disabled={busy || !input.trim()} style={{ padding: "8px 14px" }}>
          Send
        </button>
      </div>
    </div>
  );
}
