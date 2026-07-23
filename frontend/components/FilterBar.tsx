"use client";

export type FilterOption = { id: string; name: string };

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
  return (
    <div
      className="row"
      style={{ gap: 10, marginBottom: 18, flexWrap: "wrap", alignItems: "center" }}
    >
      <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--text-dim)" }}>
        Filters
      </span>
      <select value={teamId || ""} onChange={(e) => onTeam(e.target.value || null)} style={{ width: "auto" }}>
        <option value="">All teams</option>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <select value={projectId || ""} onChange={(e) => onProject(e.target.value || null)} style={{ width: "auto" }}>
        <option value="">All projects</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      {(teamId || projectId) && (
        <button
          onClick={() => {
            onTeam(null);
            onProject(null);
          }}
          style={{ padding: "4px 10px" }}
        >
          Clear
        </button>
      )}
    </div>
  );
}
