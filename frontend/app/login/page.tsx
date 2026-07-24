"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { Logo } from "@/components/ui";

type Step = "identify" | "channel" | "code";

function classify(id: string): "email" | "mobile" | "username" {
  if (id.includes("@")) return "email";
  if (/^\+?[0-9][0-9\s-]{5,}$/.test(id)) return "mobile";
  return "username";
}

export default function LoginPage() {
  const router = useRouter();
  const { user, loading, setToken } = useAuth();
  const { theme, toggle } = useTheme();
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
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 20,
        position: "relative",
        // Soft brand-tinted backdrop so the card floats rather than sitting on flat gray.
        background:
          "radial-gradient(1100px 520px at 50% -10%, color-mix(in srgb, var(--primary) 12%, transparent), transparent 70%), var(--bg)",
      }}
    >
      {/* Theme toggle — parity with the app header, so first-run users can flip it here too. */}
      <button
        className="icon-btn"
        onClick={toggle}
        title="Toggle theme"
        aria-label="Toggle theme"
        style={{ position: "absolute", top: 16, right: 16, fontSize: 16 }}
      >
        {theme === "light" ? "🌙" : "☀️"}
      </button>

      <div style={{ width: 400, maxWidth: "100%" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 22 }}>
          <Logo size={44} />
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em", marginTop: 14 }}>
            Task Management
          </div>
          <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
            Passwordless sign-in — we&apos;ll send a one-time code.
          </div>
        </div>

        <div
          className="card"
          style={{ borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)", padding: 28 }}
        >
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
              <p className="muted" style={{ marginTop: 0 }}>
                Where should we send your code?
              </p>
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
              <p className="muted" style={{ marginTop: 0 }}>
                Code sent to <strong style={{ color: "var(--text)" }}>{hint}</strong>
              </p>
              {devCode && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    padding: "8px 12px",
                    marginBottom: 14,
                    borderRadius: 8,
                    fontSize: 13,
                    color: "var(--primary)",
                    background: "color-mix(in srgb, var(--primary) 10%, transparent)",
                    border: "1px dashed color-mix(in srgb, var(--primary) 40%, var(--border))",
                  }}
                >
                  <span className="section-label" style={{ color: "inherit" }}>
                    Dev code
                  </span>
                  <strong style={{ fontSize: 16, letterSpacing: "0.15em", fontVariantNumeric: "tabular-nums" }}>
                    {devCode}
                  </strong>
                </div>
              )}
              <div className="field">
                <label>Enter code</label>
                <input
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="123456"
                  inputMode="numeric"
                  maxLength={6}
                  style={{
                    textAlign: "center",
                    fontSize: 22,
                    fontWeight: 700,
                    letterSpacing: "0.4em",
                    paddingLeft: "0.4em",
                  }}
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
    </div>
  );
}
