"use client";

import { useTheme } from "@/lib/theme";
import { NotificationsBell } from "./NotificationsBell";
import { ProfileMenu } from "./ProfileMenu";
import { ProjectIcon } from "./ui";

export function Header({
  onToggleSidebar,
  title,
  titleSeed,
  titleEmoji,
  orgId,
  onToggleChat,
  chatOpen,
}: {
  onToggleSidebar: () => void;
  title: string;
  titleSeed?: string | null;
  titleEmoji?: string | null;
  orgId: string | null;
  onToggleChat?: () => void;
  chatOpen?: boolean;
}) {
  const { theme, toggle } = useTheme();

  return (
    <header
      style={{
        height: 52,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "0 16px",
        borderBottom: "1px solid var(--border)",
        background: "var(--surface)",
      }}
    >
      <button className="icon-btn" onClick={onToggleSidebar} title="Toggle menu" aria-label="Toggle menu" style={{ fontSize: 16 }}>
        ☰
      </button>
      <span style={{ flex: 1, minWidth: 0, display: "inline-flex", alignItems: "center", gap: 9 }}>
        {titleSeed ? (
          <ProjectIcon seed={titleSeed} size={26} />
        ) : titleEmoji ? (
          <span
            aria-hidden
            style={{
              width: 26,
              height: 26,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              borderRadius: 7,
              fontSize: 15,
              lineHeight: 1,
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
            }}
          >
            {titleEmoji}
          </span>
        ) : null}
        <strong style={{ fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {title}
        </strong>
      </span>
      {orgId && onToggleChat && (
        <button
          className="icon-btn"
          onClick={onToggleChat}
          title="Assistant"
          aria-label="Toggle assistant"
          aria-pressed={chatOpen}
          style={{ fontSize: 16, background: chatOpen ? "var(--surface-2)" : undefined }}
        >
          💬
        </button>
      )}
      {orgId && <NotificationsBell key={orgId} />}
      <button className="icon-btn" onClick={toggle} title="Toggle theme" aria-label="Toggle theme" style={{ fontSize: 16 }}>
        {theme === "light" ? "🌙" : "☀️"}
      </button>
      <ProfileMenu />
    </header>
  );
}
