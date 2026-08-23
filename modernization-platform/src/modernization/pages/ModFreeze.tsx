/**
 * Freeze MOD Version — lock the current MOD version to enable test case generation.
 * All state is in React Context (browser memory).
 */

import { useState } from "react";
import { useParams } from "react-router";
import { useModStore } from "../context";
import { Lock, AlertTriangle, CheckCircle } from "lucide-react";

export default function ModFreeze() {
  const { projectId } = useParams<{ projectId: string }>();
  const { state, dispatch, genId: gen } = useModStore();

  const project = state.projects.find((p) => p.id === projectId);
  const freezeEntries = Object.values(state.freezeHistory)
    .filter((f) => f.projectId === projectId)
    .sort((a, b) => b.frozenAt - a.frozenAt);

  const findings = Object.values(state.findings).filter((f) => f.projectId === projectId);
  const openFindings = findings.filter((f) => f.status === "OPEN" || f.status === "NEEDS_INFO");
  const highFindings = findings.filter((f) => f.severity === "CRITICAL" || f.severity === "HIGH");

  const [version, setVersion] = useState("v1");
  const [reason, setReason] = useState("");

  if (!project) {
    return (
      <div className="flex items-center justify-center h-64 text-xs text-muted-foreground">
        Project not found.
      </div>
    );
  }

  const isFrozen = project.modFrozen || project.status === "FROZEN";

  function handleFreeze(e: React.FormEvent) {
    e.preventDefault();
    if (!version.trim() || !reason.trim()) return;
    dispatch({
      type: "FREEZE_PROJECT",
      projectId: project!.id,
      version: version.trim(),
      reason: reason.trim(),
      resolvedDiffs: findings.length - openFindings.length,
      totalDiffs: findings.length,
      unresolvedCriticalDiffs: highFindings.filter((f) => f.status === "OPEN").length,
      frozenBy: "Current User",
    });
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Freeze MOD Version</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Lock the current MOD version to enable test case generation
        </p>
      </div>

      {isFrozen && (
        <div className="flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
          <CheckCircle className="size-4 text-emerald-500" />
          <span className="text-sm text-emerald-500">
            This project is frozen ({project.frozenVersion ?? "v1"}). Test generation is enabled.
          </span>
        </div>
      )}

      {/* Diff summary */}
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-md border border-border bg-card px-3 py-2">
          <p className="text-[11px] text-muted-foreground">Total Findings</p>
          <p className="text-lg font-semibold">{findings.length}</p>
        </div>
        <div className="rounded-md border border-border bg-card px-3 py-2">
          <p className="text-[11px] text-muted-foreground">Open</p>
          <p className="text-lg font-semibold text-amber-600">{openFindings.length}</p>
        </div>
        <div className="rounded-md border border-border bg-card px-3 py-2">
          <p className="text-[11px] text-muted-foreground">High Severity</p>
          <p className="text-lg font-semibold text-red-600">{highFindings.length}</p>
        </div>
        <div className="rounded-md border border-border bg-card px-3 py-2">
          <p className="text-[11px] text-muted-foreground">Test Cases</p>
          <p className="text-lg font-semibold">
            {Object.values(state.testCases).filter((tc) => tc.projectId === projectId).length}
          </p>
        </div>
      </div>

      {highFindings.length > 0 && !isFrozen && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-4 py-3">
          <AlertTriangle className="size-4 mt-0.5 text-amber-500 shrink-0" />
          <div className="text-xs text-amber-600">
            <p className="font-medium">Unresolved high-severity findings</p>
            <p className="mt-0.5 text-muted-foreground">
              You have {highFindings.length} high-severity open findings. Consider reviewing them before freezing.
            </p>
          </div>
        </div>
      )}

      {!isFrozen && (
        <div className="rounded-lg border border-border bg-card p-5">
          <form onSubmit={handleFreeze} className="space-y-4">
            <h3 className="text-sm font-medium">Freeze Configuration</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Version</label>
                <input
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  placeholder="e.g. v1"
                  required
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Reason for freeze</label>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. All gaps resolved"
                  required
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={!version.trim() || !reason.trim()}
                className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-[11px] font-medium text-background hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                <Lock className="size-3.5" />
                Freeze MOD Version
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Freeze history */}
      {freezeEntries.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-medium">Freeze History</h3>
          <div className="space-y-2">
            {freezeEntries.map((f) => (
              <div key={f.id} className="rounded-md border border-border bg-card px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400">
                      {f.version}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      by {f.frozenBy} · {new Date(f.frozenAt).toLocaleString()}
                    </span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {f.resolvedDiffs}/{f.totalDiffs} diffs resolved · {f.unresolvedCriticalDiffs} critical open
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{f.reason}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
