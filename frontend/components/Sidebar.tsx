"use client";

import { useState } from "react";
import { Org, Project, Team } from "@/lib/api";
import { Logo, ProjectIcon, SectionLabel } from "./ui";
import { ResizeHandle } from "./ResizeHandle";
import { useResizableWidth } from "@/lib/useResizableWidth";

function AddInline({
  placeholder,
  onCreate,
  onCancel,
}: {
  placeholder: string;
  onCreate: (name: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onCreate(name.trim());
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="row">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") onCancel();
        }}
        placeholder={placeholder}
        style={{ fontSize: 13 }}
      />
      <button className="primary" disabled={busy} onClick={submit} style={{ padding: "6px 10px" }}>
        Add
      </button>
      <button onClick={onCancel} style={{ padding: "6px 10px" }}>
        ✕
      </button>
    </div>
  );
}

/** A labelled dropdown selector with a + button to create a new item. */
function Selector({
  label,
  items,
  selectedId,
  onSelect,
  onCreate,
}: {
  label: string;
  items: { id: string; name: string }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: (name: string) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <div style={{ marginBottom: 14 }}>
      <SectionLabel style={{ marginBottom: 5 }}>{label}</SectionLabel>
      {adding ? (
        <AddInline
          placeholder={`New ${label.toLowerCase()}`}
          onCreate={async (n) => {
            await onCreate(n);
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <div className="row">
          <select
            value={selectedId || ""}
            onChange={(e) => onSelect(e.target.value)}
            style={{ flex: 1 }}
          >
            <option value="" disabled>
              Select {label.toLowerCase()}…
            </option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
          <button onClick={() => setAdding(true)} title={`New ${label.toLowerCase()}`}>
            +
          </button>
        </div>
      )}
    </div>
  );
}

/** A top-level nav entry (My Tasks, Dashboard) with an icon. */
function NavItem({
  icon,
  label,
  active,
  onClick,
}: {
  icon: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`nav-item${active ? " active" : ""}`}
      style={{ padding: "7px 10px 7px 12px" }}
    >
      <span style={{ width: 16, textAlign: "center" }}>{icon}</span>
      {label}
    </div>
  );
}

function ProjectRow({
  label,
  seed,
  active,
  onClick,
}: {
  label: string;
  seed: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`nav-item${active ? " active" : ""}`}
      style={{ padding: "6px 8px 6px 12px" }}
    >
      <ProjectIcon seed={seed} size={22} />
      <span style={{ minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {label}
      </span>
    </div>
  );
}

export function Sidebar(props: {
  collapsed: boolean;
  orgs: Org[];
  selectedOrgId: string | null;
  onSelectOrg: (id: string) => void;
  onCreateOrg: (name: string) => Promise<void>;
  teams: Team[];
  selectedTeamId: string | null;
  onSelectTeam: (id: string) => void;
  onCreateTeam: (name: string) => Promise<void>;
  projects: Project[];
  selectedProjectId: string | null;
  onSelectProject: (id: string) => void;
  onCreateProject: (name: string) => Promise<void>;
  onOpenMyTasks: () => void;
  myTasksActive: boolean;
  onOpenDashboard: () => void;
  dashboardActive: boolean;
  onOpenSettings: () => void;
  settingsActive: boolean;
}) {
  const [addingProject, setAddingProject] = useState(false);
  const { width, dragging, handleProps } = useResizableWidth({
    storageKey: "pm_w_sidebar",
    defaultWidth: 260,
    min: 140,
    max: 420,
    side: "right",
  });

  if (props.collapsed) return null;

  return (
    <aside
      style={{
        position: "relative",
        width,
        flexShrink: 0,
        borderRight: "1px solid var(--border)",
        background: "var(--surface)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Brand header, aligned to the app header height. */}
      <div
        style={{
          height: 52,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          padding: "0 14px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <Logo size={26} wordmark />
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
        <Selector
          label="Organization"
          items={props.orgs}
          selectedId={props.selectedOrgId}
          onSelect={props.onSelectOrg}
          onCreate={props.onCreateOrg}
        />

        {props.selectedOrgId && (
          <div style={{ marginBottom: 14 }}>
            <NavItem
              icon="🎯"
              label="My Tasks"
              active={props.myTasksActive}
              onClick={props.onOpenMyTasks}
            />
            <NavItem
              icon="📊"
              label="Dashboard"
              active={props.dashboardActive}
              onClick={props.onOpenDashboard}
            />
          </div>
        )}

        {props.selectedOrgId && (
          <Selector
            label="Team"
            items={props.teams}
            selectedId={props.selectedTeamId}
            onSelect={props.onSelectTeam}
            onCreate={props.onCreateTeam}
          />
        )}

        {props.selectedTeamId && (
          <div>
            <div
              className="row"
              style={{ justifyContent: "space-between", marginBottom: 5 }}
            >
              <SectionLabel>Projects</SectionLabel>
              <button
                onClick={() => setAddingProject((v) => !v)}
                title="New project"
                style={{ padding: "0 8px", lineHeight: "20px" }}
              >
                +
              </button>
            </div>
            {addingProject && (
              <div style={{ marginBottom: 6 }}>
                <AddInline
                  placeholder="New project"
                  onCreate={async (n) => {
                    await props.onCreateProject(n);
                    setAddingProject(false);
                  }}
                  onCancel={() => setAddingProject(false)}
                />
              </div>
            )}
            {props.projects.map((p) => (
              <ProjectRow
                key={p.id}
                label={p.name}
                seed={p.id}
                active={p.id === props.selectedProjectId}
                onClick={() => props.onSelectProject(p.id)}
              />
            ))}
            {props.projects.length === 0 && !addingProject && (
              <div className="muted" style={{ fontSize: 12 }}>
                No projects yet
              </div>
            )}
          </div>
        )}
      </div>

      {/* App-wide settings, pinned to the bottom. */}
      <div style={{ borderTop: "1px solid var(--border)", padding: 10 }}>
        <div
          onClick={props.onOpenSettings}
          className={`nav-item${props.settingsActive ? " active" : ""}`}
          style={{ padding: "7px 10px 7px 12px" }}
        >
          <span style={{ width: 16, textAlign: "center" }}>⚙️</span>
          Settings
        </div>
      </div>
      <ResizeHandle side="right" dragging={dragging} handleProps={handleProps} />
    </aside>
  );
}
