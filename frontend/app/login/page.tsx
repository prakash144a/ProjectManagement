"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Step = "identify" | "channel" | "code";

function classify(id: string): "email" | "mobile" | "username" {
  if (id.includes("@")) return "email";
  if (/^\+?[0-9][0-9\s-]{5,}$/.test(id)) return "mobile";
  return "username";
}

export default function LoginPage() {
  const router = useRouter();
  const { user, loading, setToken } = useAuth();
  const [step, setStep] = useState<Step>("identify");
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && user) router.replace("/home");
  }, [user, loading, router]);

  function onIdentify(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    // Email/mobile imply the channel; a username needs the user to pick one.
    if (classify(identifier.trim()) === "username") {
      setStep("channel");
    } else {
      send();
    }
  }

  async function send(channel?: "email" | "sms") {
    setBusy(true);
    setError("");
    try {
      const res = await api.auth.requestCode(identifier.trim(), channel);
      setHint(res.target_hint);
      setDevCode(res.dev_code);
      setStep("code");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to send code");
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const session = await api.auth.verify(identifier.trim(), code.trim());
      await setToken(session.token);
      router.replace("/home");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to verify");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 }}>
      <div
        style={{
          width: 380,
          maxWidth: "100%",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          boxShadow: "var(--shadow)",
          padding: 28,
        }}
      >
        <h1 style={{ marginTop: 0, fontSize: 20 }}>Sign in</h1>
        <p className="muted" style={{ marginTop: -6 }}>
          Passwordless — we&apos;ll send a one-time code.
        </p>

        {step === "identify" && (
          <form onSubmit={onIdentify}>
            <div className="field">
              <label>Username, email, or mobile</label>
              <input
                autoFocus
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            {error && <p className="error">{error}</p>}
            <button className="primary" disabled={busy || !identifier.trim()} style={{ width: "100%" }}>
              {busy ? "Sending…" : "Continue"}
            </button>
          </form>
        )}

        {step === "channel" && (
          <div>
            <p className="muted">Where should we send your code?</p>
            {error && <p className="error">{error}</p>}
            <button
              className="primary"
              disabled={busy}
              onClick={() => send("email")}
              style={{ width: "100%", marginBottom: 8 }}
            >
              Send to email
            </button>
            <button
              disabled={busy}
              onClick={() => send("sms")}
              style={{ width: "100%", marginBottom: 8 }}
            >
              Send to mobile
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("identify");
                setError("");
              }}
              style={{ width: "100%" }}
            >
              Back
            </button>
          </div>
        )}

        {step === "code" && (
          <form onSubmit={verify}>
            <p className="muted">Code sent to {hint}</p>
            {devCode && (
              <p className="badge" style={{ marginBottom: 12 }}>
                dev code: <strong>{devCode}</strong>
              </p>
            )}
            <div className="field">
              <label>Enter code</label>
              <input
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                inputMode="numeric"
              />
            </div>
            {error && <p className="error">{error}</p>}
            <button className="primary" disabled={busy || !code.trim()} style={{ width: "100%" }}>
              {busy ? "Verifying…" : "Verify & continue"}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("identify");
                setCode("");
                setError("");
              }}
              style={{ width: "100%", marginTop: 8 }}
            >
              Back
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
