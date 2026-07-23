"use client";

import { useTheme } from "@/lib/theme";
import { NotificationsBell } from "./NotificationsBell";
import { ProfileMenu } from "./ProfileMenu";

export function Header({
  onToggleSidebar,
  title,
  orgId,
}: {
  onToggleSidebar: () => void;
  title: string;
  orgId: string | null;
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
      <button onClick={onToggleSidebar} title="Toggle menu" aria-label="Toggle menu">
        ☰
      </button>
      <strong style={{ flex: 1 }}>{title}</strong>
      {orgId && <NotificationsBell key={orgId} />}
      <button onClick={toggle} title="Toggle theme">
        {theme === "light" ? "🌙" : "☀️"}
      </button>
      <ProfileMenu />
    </header>
  );
}
