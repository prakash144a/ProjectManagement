"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { User } from "@/lib/api";

// Name shown in the menu; prefer a real name, fall back to any identifier.
function displayName(user: User): string {
  return user.display_name || user.username || user.email || user.mobile || "User";
}

// Initials for the avatar: first letter of each word (max 2). For a single
// word, take its first two letters — e.g. "Prakash Annadura" → PA, "Dhivya" → DH.
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function ProfileMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!user) return null;

  const name = displayName(user);
  const secondary = user.email || user.username || user.mobile || "";

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        title={name}
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          width: 32,
          height: 32,
          padding: 0,
          borderRadius: "50%",
          border: "none",
          background: "var(--primary)",
          color: "#fff",
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: 0.3,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {initials(name)}
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: 40,
            right: 0,
            minWidth: 200,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            boxShadow: "0 6px 24px rgba(0,0,0,0.18)",
            padding: 6,
            zIndex: 50,
          }}
        >
          <div style={{ padding: "8px 10px 10px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{name}</div>
            {secondary && secondary !== name && (
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                {secondary}
              </div>
            )}
          </div>

          <button
            role="menuitem"
            onClick={() => setOpen(false)}
            style={menuItemStyle}
          >
            My Account
          </button>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              logout();
            }}
            style={menuItemStyle}
          >
            Log Out
          </button>
        </div>
      )}
    </div>
  );
}

const menuItemStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  border: "none",
  background: "transparent",
  borderRadius: 6,
  padding: "8px 10px",
  fontSize: 13,
  cursor: "pointer",
};
