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
 * The full chat experience (text + voice). Two visual variants:
 * - "widget" (default): compact, for the floating drawer. Renders its own header.
 * - "full": a roomy, centered full-page layout (ChatGPT/Claude-style) for /chat —
 *   no header bar, a centered message column, and a rounded composer.
 *
 * Conversations are DB-backed: `conversationId` selects the thread (null = a new,
 * not-yet-created conversation — the first send creates it server-side). When the
 * server assigns/returns a conversation, `onConversationChanged` bubbles it up so
 * the parent can track the active id and refresh its list.
 */
export function ChatConversation({
  conversationId,
  onConversationChanged,
  variant = "widget",
  title = "Assistant",
  headerExtra,
  onClose,
}: {
  conversationId: string | null;
  onConversationChanged?: (conv: { id: string; title: string | null }) => void;
  variant?: "widget" | "full";
  title?: string;
  headerExtra?: ReactNode;
  onClose?: () => void;
}) {
  const full = variant === "full";
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

  // A message row. Full variant: assistant is full-width unstyled prose, user is a
  // soft right-aligned bubble (market-standard). Widget variant: compact bubbles.
  function messageRow(m: Msg, i: number) {
    const isUser = m.role === "user";
    return (
      <div
        key={i}
        style={{
          alignSelf: isUser ? "flex-end" : full ? "stretch" : "flex-start",
          maxWidth: full ? (isUser ? "min(85%, 680px)" : "100%") : "85%",
        }}
      >
        <div
          className={m.role === "assistant" ? "md" : undefined}
          style={{
            padding: full && !isUser ? 0 : full ? "10px 14px" : "8px 12px",
            borderRadius: 16,
            fontSize: full ? 15 : 14,
            lineHeight: full ? 1.65 : 1.45,
            whiteSpace: isUser ? "pre-wrap" : undefined,
            wordBreak: "break-word",
            background: full
              ? isUser
                ? "var(--surface-2)"
                : "transparent"
              : isUser
                ? "var(--primary)"
                : "var(--surface-2)",
            border: full && isUser ? "1px solid var(--border)" : undefined,
            color: !full && isUser ? "#fff" : "var(--text)",
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
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", minHeight: 0 }}>
      {/* Header. Compact widget: title bar + controls. Full page: a slim,
          quiet bar showing the current conversation title. */}
      {!full ? (
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
      ) : (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            height: 52,
            padding: "0 24px",
            borderBottom: "1px solid var(--border)",
            fontWeight: 600,
            fontSize: 15,
            color: "var(--text)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {title}
        </div>
      )}

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: full ? 20 : 10,
            padding: full ? "28px 44px 16px" : 14,
            maxWidth: full ? 1180 : undefined,
            width: "100%",
            margin: full ? "0 auto" : undefined,
            boxSizing: "border-box",
          }}
        >
          {loading && (
            <div className="muted" style={{ fontSize: 13 }}>
              Loading…
            </div>
          )}
          {!loading && messages.length === 0 &&
            (full ? (
              <div style={{ textAlign: "center", padding: "56px 0 24px" }}>
                <div style={{ fontSize: 24, fontWeight: 600, marginBottom: 12 }}>
                  How can I help?
                </div>
                <div className="muted" style={{ fontSize: 14, lineHeight: 1.6, maxWidth: 520, margin: "0 auto" }}>
                  {GREETING}
                </div>
              </div>
            ) : (
              <div className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
                {GREETING}
              </div>
            ))}
          {messages.map((m, i) => messageRow(m, i))}
          {busy && (
            <div className="muted" style={{ fontSize: full ? 14 : 13, alignSelf: "flex-start" }}>
              Thinking…
            </div>
          )}

          {/* Live voice transcripts for the in-progress turn */}
          {liveUser && messageRow({ role: "user", content: liveUser }, -1)}
          {liveAsst && messageRow({ role: "assistant", content: liveAsst }, -2)}

          <div ref={endRef} />
        </div>
      </div>

      {/* Voice status strip */}
      {voice !== "off" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
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
      <div
        style={{
          borderTop: full ? undefined : "1px solid var(--border)",
          padding: full ? "8px 44px 20px" : 10,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "flex-end",
            maxWidth: full ? 1180 : undefined,
            margin: full ? "0 auto" : undefined,
            border: full ? "1px solid var(--border)" : undefined,
            borderRadius: full ? 20 : undefined,
            background: full ? "var(--surface)" : undefined,
            padding: full ? "8px 8px 8px 10px" : undefined,
            boxShadow: full ? "0 2px 12px rgba(0,0,0,0.06)" : undefined,
          }}
        >
          <button
            onClick={() => (voice === "off" ? startVoice() : stopVoice())}
            title={voice === "off" ? "Start voice" : "Stop voice"}
            aria-label={voice === "off" ? "Start voice" : "Stop voice"}
            style={{
              flexShrink: 0,
              width: full ? 40 : 38,
              height: full ? 40 : 38,
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
            style={{
              flex: 1,
              resize: "none",
              maxHeight: full ? 200 : 120,
              fontSize: full ? 15 : 14,
              padding: full ? "9px 8px" : "8px 10px",
              border: full ? "none" : undefined,
              background: full ? "transparent" : undefined,
              outline: full ? "none" : undefined,
            }}
          />
          {full ? (
            <button
              className="primary"
              onClick={send}
              disabled={busy || !input.trim()}
              title="Send"
              aria-label="Send"
              style={{
                flexShrink: 0,
                width: 40,
                height: 40,
                borderRadius: "50%",
                padding: 0,
                fontSize: 18,
                lineHeight: 1,
              }}
            >
              ↑
            </button>
          ) : (
            <button className="primary" onClick={send} disabled={busy || !input.trim()} style={{ padding: "8px 14px" }}>
              Send
            </button>
          )}
        </div>
        {full && (
          <div style={{ textAlign: "center", fontSize: 11, color: "var(--text-dim)", marginTop: 8 }}>
            Enter to send · Shift+Enter for a new line
          </div>
        )}
      </div>
    </div>
  );
}
