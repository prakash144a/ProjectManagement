"use client";

import { ReactNode } from "react";

export type FilterOption = { id: string; name: string };

// A native <select> styled as a pill-shaped filter chip: it picks up a soft
// primary tint when a value is chosen, with a theme-aware custom chevron.
function FilterChip({
  value,
  onChange,
  allLabel,
  options,
  icon,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  allLabel: string;
  options: FilterOption[];
  icon?: ReactNode;
}) {
  const active = !!value;
  return (
    <span className={`select-wrap${active ? " active" : ""}`}>
      {icon && (
        <span style={{ position: "absolute", left: 11, pointerEvents: "none", fontSize: 12, opacity: 0.8 }}>
          {icon}
        </span>
      )}
      <select
        className={`chip-select${active ? " active" : ""}`}
        style={icon ? { paddingLeft: 28 } : undefined}
        value={value || ""}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      <span className="chevron">▼</span>
    </span>
  );
}

// Team + project filters shared by My Tasks and the Dashboard. `projects` is
// expected to already be scoped to the selected team by the caller.
export function FilterBar({
  teams,
  projects,
  teamId,
  projectId,
  onTeam,
  onProject,
}: {
  teams: FilterOption[];
  projects: FilterOption[];
  teamId: string | null;
  projectId: string | null;
  onTeam: (id: string | null) => void;
  onProject: (id: string | null) => void;
}) {
  const anyActive = !!(teamId || projectId);
  return (
    <div className="row" style={{ gap: 8, marginBottom: 18, flexWrap: "wrap", alignItems: "center" }}>
      <span className="section-label" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
        <span style={{ fontSize: 13 }}>⛃</span> Filters
      </span>
      <FilterChip value={teamId} onChange={onTeam} allLabel="All teams" options={teams} icon="▦" />
      <FilterChip value={projectId} onChange={onProject} allLabel="All projects" options={projects} icon="▸" />
      {anyActive && (
        <button
          className="icon-btn"
          onClick={() => {
            onTeam(null);
            onProject(null);
          }}
          style={{ fontSize: 12, padding: "4px 10px", color: "var(--text-dim)" }}
          title="Clear all filters"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
