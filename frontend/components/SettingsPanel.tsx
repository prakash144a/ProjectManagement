"use client";

import { useState } from "react";
import { OrgSettings } from "./OrgSettings";
import { StatusSettings } from "./StatusSettings";
import { UsersSettings } from "./UsersSettings";
import { TeamsSettings } from "./TeamsSettings";

// App-wide settings. Sections are listed on the left; more (Profile, Billing)
// slot in here later.
const SECTIONS = [
  { id: "organization", label: "Organization" },
  { id: "teams", label: "Teams & Groups" },
  { id: "statuses", label: "Statuses" },
  { id: "users", label: "Users" },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

export function SettingsPanel({ orgName }: { orgName: string }) {
  const [section, setSection] = useState<SectionId>("organization");

  return (
    <div style={{ display: "flex", flex: 1, minWidth: 0 }}>
      <nav
        style={{
          width: 180,
          flexShrink: 0,
          borderRight: "1px solid var(--border)",
          padding: 14,
          background: "var(--surface)",
        }}
      >
        <div className="section-label" style={{ marginBottom: 8 }}>Settings</div>
        {SECTIONS.map((s) => (
          <div
            key={s.id}
            onClick={() => setSection(s.id)}
            className="list-row"
            style={{
              padding: "7px 10px",
              borderRadius: 6,
              cursor: "pointer",
              background: section === s.id ? "var(--surface-2)" : "transparent",
              fontWeight: section === s.id ? 600 : 400,
            }}
          >
            {s.label}
          </div>
        ))}
      </nav>

      <div style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>
        {section === "organization" && <OrgSettings orgName={orgName} />}
        {section === "teams" && <TeamsSettings />}
        {section === "statuses" && <StatusSettings />}
        {section === "users" && <UsersSettings />}
      </div>
    </div>
  );
}
