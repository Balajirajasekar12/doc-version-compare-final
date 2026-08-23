/**
 * Project Overview — shows project status, quick stats, and actions.
 */

import { useEffect } from "react";
import { Link, useParams } from "react-router";
import { useModStore } from "../context";
import {
  Upload,
  Zap,
  FileSearch,
  ClipboardList,
  AlertTriangle,
  FolderOpen,
} from "lucide-react";

export default function ModProject() {
  const { projectId } = useParams<{ projectId: string }>();
  const { state, dispatch, getProjectFiles, getProjectFindings } = useModStore();

  useEffect(() => {
    if (projectId) dispatch({ type: "SET_CURRENT_PROJECT", projectId });
  }, [projectId, dispatch]);

  const project = state.projects.find((p) => p.id === projectId);
  if (!project) {
    return (
      <div className="flex items-center justify-center h-64 text-xs text-muted-foreground">
        Project not found.
      </div>
    );
  }

  const legacyFiles = getProjectFiles(project.id, "LEGACY");
  const modFiles = getProjectFiles(project.id, "MOD");
  const findings = getProjectFindings(project.id);
  // Functionalities available for this project
  const testCases = Object.values(state.testCases).filter((tc) => tc.projectId === project.id);
  const cycles = Object.values(state.testCycles).filter((c) => c.projectId === project.id);

  const openFindings = findings.filter((f) => f.status === "OPEN" || f.status === "NEEDS_INFO");
  const critFindings = findings.filter((f) => f.severity === "CRITICAL" || f.severity === "HIGH");

  const base = `/modernization/project/${project.id}`;

  const actions = [
    { label: "Upload Source", desc: "Add Legacy or MOD files", icon: Upload, path: `${base}/upload`, enabled: true },
    { label: "Source Inventory", desc: `${legacyFiles.length + modFiles.length} files uploaded`, icon: FolderOpen, path: `${base}/inventory`, enabled: legacyFiles.length + modFiles.length > 0 },
    { label: "Run Analysis", desc: "Compare entire codebases", icon: Zap, path: `${base}/analysis`, enabled: legacyFiles.length > 0 && modFiles.length > 0 },
    { label: "View Findings", desc: `${openFindings.length} open findings`, icon: FileSearch, path: `${base}/findings`, enabled: findings.length > 0 },
    { label: "Test Cases", desc: `${testCases.length} test cases`, icon: ClipboardList, path: `${base}/test-cases`, enabled: true },
  ];

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-8">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold tracking-tight">{project.name}</h1>
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
            project.status === "FROZEN" ? "bg-blue-500/10 text-blue-400" :
            project.status === "GAPS_FOUND" ? "bg-amber-500/10 text-amber-400" :
            "bg-muted text-muted-foreground"
          }`}>
            {project.status}
          </span>
        </div>
        {project.description && (
          <p className="text-xs text-muted-foreground">{project.description}</p>
        )}
      </div>

      {/* Memory Warning */}
      <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
        <AlertTriangle className="size-3.5 text-amber-500 shrink-0 mt-0.5" />
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          Data is stored in browser memory only. Export this project to preserve your work.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Legacy Files", value: legacyFiles.length },
          { label: "MOD Files", value: modFiles.length },
          { label: "Findings", value: findings.length },
          { label: "Test Cycles", value: cycles.length },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg border border-border bg-card px-3 py-3">
            <p className="text-[10px] text-muted-foreground">{stat.label}</p>
            <p className="text-lg font-semibold mt-0.5">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Critical Findings */}
      {critFindings.length > 0 && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 space-y-2">
          <p className="text-xs font-medium text-red-400">
            {critFindings.length} Critical/High Findings Require Attention
          </p>
          {critFindings.slice(0, 3).map((f) => (
            <div key={f.id} className="text-[11px] text-muted-foreground">
              • {f.title}
            </div>
          ))}
          {critFindings.length > 3 && (
            <Link to={`${base}/findings`} className="text-[11px] text-foreground hover:underline">
              View all {critFindings.length} findings →
            </Link>
          )}
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {actions.map((action) => (
          <Link
            key={action.label}
            to={action.enabled ? action.path : "#"}
            className={`flex items-start gap-3 rounded-lg border border-border bg-card p-4 transition-colors ${
              action.enabled
                ? "hover:border-muted-foreground/20 cursor-pointer"
                : "opacity-50 cursor-not-allowed"
            }`}
          >
            <action.icon className="size-4 text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium">{action.label}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{action.desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
