/**
 * Modernization Dashboard — Project list, create, export/import.
 * All in browser memory.
 */

import { useState } from "react";
import { Link } from "react-router";
import { useModStore, genId } from "../context";
import { exportProject, importProject } from "../lib/projectIO";
import {
  Plus,
  Trash2,
  Download,
  FolderOpen,
  AlertCircle,
  Check,
} from "lucide-react";

export default function ModDashboard() {
  const { state, dispatch } = useModStore();
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);

  function createProject() {
    if (!newName.trim()) return;
    const project = {
      id: genId(),
      name: newName.trim(),
      description: newDesc.trim(),
      status: "CREATED" as const,
      modFrozen: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    dispatch({ type: "CREATE_PROJECT", project });
    setNewName("");
    setNewDesc("");
    setShowNew(false);
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    setImportSuccess(false);
    try {
      const mip = await importProject(file);
      dispatch({ type: "IMPORT_PROJECT_DATA", data: mip.data });
      setImportSuccess(true);
      setTimeout(() => setImportSuccess(false), 3000);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed");
    }
    e.target.value = "";
  }

  function deleteProject(id: string) {
    if (confirm("Delete this project and all its data? This cannot be undone.")) {
      dispatch({ type: "DELETE_PROJECT", projectId: id });
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">
            Modernization Testing Platform
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            All data is stored in browser memory. Export your project to save progress.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[11px] font-medium text-foreground hover:bg-muted cursor-pointer transition-colors">
            <Download className="size-3" />
            Import .mip
            <input
              type="file"
              accept=".mip"
              className="hidden"
              onChange={handleImport}
            />
          </label>
          <button
            onClick={() => setShowNew(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-[11px] font-medium text-background hover:opacity-90 transition-opacity"
          >
            <Plus className="size-3" />
            New Project
          </button>
        </div>
      </div>

      {/* Alerts */}
      {importError && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-400">
          <AlertCircle className="size-3.5 shrink-0" />
          {importError}
        </div>
      )}
      {importSuccess && (
        <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-[11px] text-green-400">
          <Check className="size-3.5 shrink-0" />
          Project imported successfully.
        </div>
      )}

      {/* New Project Form */}
      {showNew && (
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <h2 className="text-sm font-medium">Create New Project</h2>
          <input
            type="text"
            placeholder="Project name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createProject()}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            autoFocus
          />
          <textarea
            placeholder="Description (optional)"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring min-h-[60px]"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={createProject}
              className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-[11px] font-medium text-background hover:opacity-90"
            >
              Create
            </button>
            <button
              onClick={() => { setShowNew(false); setNewName(""); setNewDesc(""); }}
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Project List */}
      {state.projects.length === 0 ? (
        <div className="rounded-lg border border-border border-dashed bg-card p-12 text-center space-y-3">
          <FolderOpen className="mx-auto size-8 text-muted-foreground/40" />
          <p className="text-xs text-muted-foreground">No projects yet. Create one or import a .mip file.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {state.projects.map((project) => {
            const legacyCount = Object.values(state.sourceFiles).filter(
              (f) => f.projectId === project.id && f.sourceType === "LEGACY" && !f.superseded,
            ).length;
            const modCount = Object.values(state.sourceFiles).filter(
              (f) => f.projectId === project.id && f.sourceType === "MOD" && !f.superseded,
            ).length;
            const findingCount = Object.values(state.findings).filter(
              (f) => f.projectId === project.id,
            ).length;

            return (
              <div
                key={project.id}
                className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 hover:border-muted-foreground/20 transition-colors"
              >
                <Link
                  to={`/modernization/project/${project.id}`}
                  className="flex-1 min-w-0"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex size-8 items-center justify-center rounded bg-white/5 text-[10px] font-bold text-foreground shrink-0">
                      {project.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-xs font-medium truncate">{project.name}</h3>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-[10px] text-muted-foreground">
                          Legacy: {legacyCount} · MOD: {modCount}
                        </span>
                        {findingCount > 0 && (
                          <span className="text-[10px] text-muted-foreground">
                            Findings: {findingCount}
                          </span>
                        )}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                          project.status === "FROZEN" ? "bg-blue-500/10 text-blue-400" :
                          project.status === "GAPS_FOUND" ? "bg-amber-500/10 text-amber-400" :
                          "bg-muted text-muted-foreground"
                        }`}>
                          {project.status}
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
                <div className="flex items-center gap-1.5 shrink-0 ml-4">
                  <button
                    onClick={() => exportProject(state, project.name)}
                    className="rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    title="Export project as .mip"
                  >
                    <Download className="size-3.5" />
                  </button>
                  <button
                    onClick={() => deleteProject(project.id)}
                    className="rounded p-1.5 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title="Delete project"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Memory Notice */}
      <div className="rounded-lg border border-border bg-card/50 px-4 py-3">
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          <strong>Important:</strong> Project data is stored only in browser memory.
          Refreshing or closing the browser may remove the current project.
          Use <Download className="inline size-2.5" /> Export to download a .mip file you can import later.
          No data is ever sent to a server.
        </p>
      </div>
    </div>
  );
}
