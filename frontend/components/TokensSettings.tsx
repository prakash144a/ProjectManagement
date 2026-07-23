"use client";

import { useEffect, useState } from "react";
import { api, ApiError, ApiToken, ApiTokenCreated } from "@/lib/api";
import { Card } from "./ui";

const MCP_URL = process.env.NEXT_PUBLIC_MCP_URL || "http://localhost:8100/mcp";

export function TokensSettings() {
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [name, setName] = useState("");
  const [created, setCreated] = useState<ApiTokenCreated | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function fail(e: unknown) {
    setError(e instanceof ApiError ? e.message : "Something went wrong");
  }

  const load = () => api.tokens.list().then(setTokens).catch(fail);
  useEffect(() => {
    load();
  }, []);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    setError("");
    try {
      const t = await api.tokens.create(name.trim());
      setCreated(t);
      setCopied(false);
      setName("");
      load();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(t: ApiToken) {
    if (!confirm(`Revoke token "${t.name || "token"}"? Any client using it will stop working.`)) return;
    setError("");
    try {
      await api.tokens.remove(t.id);
      setTokens((ts) => ts.filter((x) => x.id !== t.id));
    } catch (e) {
      fail(e);
    }
  }

  const fmt = (s: string | null) => (s ? new Date(s).toLocaleDateString() : "—");

  return (
    <div style={{ padding: 24, maxWidth: 760 }}>
      <h2 className="page-title">API Tokens</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Personal access tokens let external AI clients (Claude, ChatGPT, custom agents) act
        <strong> as you</strong>, in <strong>this organization</strong>, through the MCP server. A token
        carries your identity and permissions — treat it like a password.
      </p>

      {/* Connect info */}
      <Card style={{ padding: 16, marginBottom: 20 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Connect an AI client (MCP)</div>
        <p className="muted" style={{ marginTop: 0, marginBottom: 8, fontSize: 13 }}>
          Add this MCP server URL in your client, then authenticate with a token below:
        </p>
        <code
          style={{
            display: "block",
            padding: "8px 10px",
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            fontSize: 13,
            wordBreak: "break-all",
          }}
        >
          {MCP_URL}
        </code>
      </Card>

      {/* Create */}
      <div className="row" style={{ alignItems: "flex-end", marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <label>New token name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            placeholder="e.g. Claude on my laptop"
          />
        </div>
        <button className="primary" disabled={busy} onClick={create} style={{ marginBottom: 0 }}>
          Generate token
        </button>
      </div>

      {/* One-time reveal */}
      {created && (
        <Card style={{ padding: 16, marginBottom: 20, borderColor: "var(--primary)" }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Copy your token now</div>
          <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
            This is the only time it’s shown. Paste it into your AI client as the bearer token.
          </p>
          <div className="row">
            <code
              style={{
                flex: 1,
                padding: "8px 10px",
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                fontSize: 13,
                wordBreak: "break-all",
              }}
            >
              {created.token}
            </code>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(created.token);
                setCopied(true);
              }}
            >
              {copied ? "Copied ✓" : "Copy"}
            </button>
          </div>
          <div style={{ marginTop: 8 }}>
            <button onClick={() => setCreated(null)}>Done</button>
          </div>
        </Card>
      )}

      {/* Existing tokens */}
      <Card style={{ overflow: "hidden" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.6fr 1fr 1fr 90px",
            padding: "8px 14px",
            background: "var(--surface-2)",
            fontSize: 12,
            color: "var(--text-dim)",
          }}
        >
          <span>Name</span>
          <span>Created</span>
          <span>Last used</span>
          <span></span>
        </div>
        {tokens.map((t) => (
          <div
            key={t.id}
            style={{
              display: "grid",
              gridTemplateColumns: "1.6fr 1fr 1fr 90px",
              alignItems: "center",
              padding: "10px 14px",
              borderTop: "1px solid var(--border)",
            }}
          >
            <span>{t.name || "token"}</span>
            <span className="muted">{fmt(t.created_at)}</span>
            <span className="muted">{fmt(t.last_used_at)}</span>
            <button className="danger" style={{ padding: "2px 8px" }} onClick={() => revoke(t)}>
              Revoke
            </button>
          </div>
        ))}
        {tokens.length === 0 && (
          <div className="muted" style={{ padding: 14, fontSize: 13 }}>
            No tokens yet.
          </div>
        )}
      </Card>

      {error && <p className="error">{error}</p>}
    </div>
  );
}
