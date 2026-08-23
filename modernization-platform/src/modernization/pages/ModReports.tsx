/**
 * Test Reports — Phase 8: Comprehensive Test Execution Report with evidence, defects, and traceability.
 */

import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { useModStore } from "../context";
import { AlertTriangle, BarChart3, Download, Eye, FileText } from "lucide-react";

export default function ModReports() {
  const { projectId } = useParams<{ projectId: string }>();
  const { state, dispatch } = useModStore();
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);
  const [viewingEv, setViewingEv] = useState<string | null>(null);

  useEffect(() => {
    if (projectId) dispatch({ type: "SET_CURRENT_PROJECT", projectId });
  }, [projectId, dispatch]);

  const project = state.projects.find((p) => p.id === projectId);
  if (!project) return <div className="flex items-center justify-center h-64 text-xs text-muted-foreground">Project not found.</div>;

  const cycles = Object.values(state.testCycles).filter((c) => c.projectId === project!.id);
  const selectedCycle = selectedCycleId ? state.testCycles[selectedCycleId] : null;
  const executions = selectedCycleId ? Object.values(state.testExecutions).filter((e) => e.testCycleId === selectedCycleId) : [];
  const evidence = selectedCycleId ? Object.values(state.testEvidence).filter((e) => e.testCycleId === selectedCycleId) : [];
  const defects = selectedCycleId ? Object.values(state.defects).filter((d) => d.testCycleId === selectedCycleId) : [];

  const manualExecs = executions.filter((e) => e.executionType === "MANUAL");
  const total = manualExecs.length;
  const passed = manualExecs.filter((e) => e.overallStatus === "PASS").length;
  const failed = manualExecs.filter((e) => e.overallStatus === "FAIL").length;
  const blocked = manualExecs.filter((e) => e.overallStatus === "BLOCKED").length;
  const passRate = total > 0 ? ((passed / total) * 100).toFixed(1) : "0.0";

  function exportReportCSV() {
    const headers = ["Test Case", "Requirement", "Status", "Executed By", "Duration (ms)", "Steps Passed", "Steps Failed", "Steps Blocked"];
    const rows = manualExecs.map((e) => {
      const steps = Object.values(state.stepExecutions).filter((s) => s.executionId === e.id);
      return [
        e.testcaseId,
        (state.testCases[e.testcaseId]?.requirement) ?? "",
        e.overallStatus,
        e.executedBy,
        e.duration?.toString() ?? "N/A",
        steps.filter((s) => s.status === "PASS").length.toString(),
        steps.filter((s) => s.status === "FAIL").length.toString(),
        steps.filter((s) => s.status === "BLOCKED").length.toString(),
      ];
    });
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${project!.name}_${selectedCycle?.name ?? "report"}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  function exportDefectsCSV() {
    const headers = ["Defect ID", "Title", "Test Case", "Step", "Severity", "Status", "Expected", "Actual", "Created By"];
    const rows = defects.map((d) => [d.defectId, d.title, d.testcaseId, d.stepNumber.toString(), d.severity, d.status, d.expectedResult, d.actualResult, d.createdBy]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${project!.name}_${selectedCycle?.name ?? ""}_defects.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Test Reports</h1>
        <p className="mt-1 text-xs text-muted-foreground">Generate comprehensive execution reports with evidence and traceability</p>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] text-muted-foreground">Select Test Cycle</label>
        <select value={selectedCycleId ?? ""} onChange={(e) => setSelectedCycleId(e.target.value || null)} className="w-full max-w-xs rounded-md border border-border bg-background px-2 py-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring">
          <option value="">— Select —</option>
          {cycles.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {selectedCycle && (
        <>
          {/* Report Header */}
          <div className="rounded-lg border border-border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-medium">Test Execution Report</h2>
              <div className="flex gap-2">
                <button onClick={exportReportCSV} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[10px] font-medium hover:bg-muted transition-colors">
                  <Download className="size-3" /> Export Results CSV
                </button>
                {defects.length > 0 && (
                  <button onClick={exportDefectsCSV} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[10px] font-medium hover:bg-muted transition-colors">
                    <FileText className="size-3" /> Export Defects CSV
                  </button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px]">
              <div><span className="text-muted-foreground">Project:</span> {project!.name}</div>
              <div><span className="text-muted-foreground">Cycle:</span> {selectedCycle.name}</div>
              {selectedCycle.release && <div><span className="text-muted-foreground">Release:</span> {selectedCycle.release}</div>}
              {selectedCycle.build && <div><span className="text-muted-foreground">Build:</span> {selectedCycle.build}</div>}
              <div><span className="text-muted-foreground">Environment:</span> {selectedCycle.environment ?? "QA"}</div>
              <div><span className="text-muted-foreground">Tester:</span> {selectedCycle.tester}</div>
            </div>
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {[{ l: "Total", v: total }, { l: "Passed", v: passed, c: "text-green-400" }, { l: "Failed", v: failed, c: "text-red-400" }, { l: "Blocked", v: blocked, c: "text-amber-400" }, { l: "Pass Rate", v: `${passRate}%`, c: passRate === "100.0" ? "text-green-400" : "" }, { l: "Evidence", v: evidence.length }].map((s) => (
              <div key={s.l} className="rounded-lg border border-border bg-card p-3"><p className="text-[10px] text-muted-foreground">{s.l}</p><p className={`text-lg font-semibold ${s.c ?? ""}`}>{s.v}</p></div>
            ))}
          </div>

          {/* Execution Results with Traceability */}
          {manualExecs.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-medium">Execution Results — Step-Level Traceability</h3>
              <div className="space-y-3">
                {manualExecs.map((exec) => {
                  const tc = state.testCases[exec.testcaseId];
                  const steps = Object.values(state.stepExecutions).filter((s) => s.executionId === exec.id).sort((a, b) => a.stepNumber - b.stepNumber);
                  const execEvidence = evidence.filter((ev) => ev.executionId === exec.id);
                  return (
                    <div key={exec.id} className="rounded-lg border border-border bg-card overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-medium">{exec.testcaseId}</span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded ${exec.overallStatus === "PASS" ? "bg-green-500/10 text-green-400" : exec.overallStatus === "FAIL" ? "bg-red-500/10 text-red-400" : "bg-muted text-muted-foreground"}`}>{exec.overallStatus.replace(/_/g, " ")}</span>
                          {exec.duration && <span className="text-[10px] text-muted-foreground">{(exec.duration / 1000).toFixed(1)}s</span>}
                        </div>
                        <span className="text-[10px] text-muted-foreground">by {exec.executedBy}</span>
                      </div>
                      {tc && (
                        <div className="px-4 py-2 bg-muted/20 text-[10px] text-muted-foreground">
                          <span className="font-medium">Requirement:</span> {tc.requirement}
                        </div>
                      )}
                      <div className="px-4 py-3 space-y-2">
                        {steps.map((step) => (
                          <div key={step.id} className="flex items-start gap-3 text-[11px]">
                            <span className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded font-medium min-w-[28px] text-center ${step.status === "PASS" ? "bg-green-500/10 text-green-400" : step.status === "FAIL" ? "bg-red-500/10 text-red-400" : step.status === "BLOCKED" ? "bg-amber-500/10 text-amber-400" : "bg-muted text-muted-foreground"}`}>{step.status === "NOT_EXECUTED" ? "—" : step.status.slice(0, 2)}</span>
                            <div className="min-w-0 flex-1">
                              <p className="text-[10px] text-muted-foreground">Step {step.stepNumber}: {step.description}</p>
                              {step.actualResult && <p className="text-[10px] mt-0.5">Actual: {step.actualResult}</p>}
                              {step.comments && <p className="text-[10px] text-muted-foreground mt-0.5 italic">Comment: {step.comments}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                      {execEvidence.length > 0 && (
                        <div className="px-4 py-2 border-t border-border">
                          <p className="text-[10px] text-muted-foreground mb-1">📸 {execEvidence.length} evidence file(s)</p>
                          <div className="flex flex-wrap gap-2">
                            {execEvidence.map((ev) => (
                              <div key={ev.id} className="relative group cursor-pointer" onClick={() => setViewingEv(ev.dataUrl ?? null)}>
                                {ev.dataUrl ? <img src={ev.dataUrl} alt={ev.fileName} className="h-12 w-16 object-cover rounded border border-border" /> : <div className="h-12 w-16 flex items-center justify-center bg-muted rounded border border-border text-[8px] text-muted-foreground">{ev.captureType}</div>}
                                <div className="absolute bottom-0 left-0 right-0 bg-black/70 rounded-b px-1 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <p className="text-[7px] text-white/80 truncate">{ev.originalName}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Defect Summary */}
          {defects.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-medium"><AlertTriangle className="inline size-3.5 mr-1 text-red-400" />Defects ({defects.length})</h3>
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-card border-b border-border">
                    <tr className="text-[10px] font-medium text-muted-foreground">
                      <th className="px-3 py-2">ID</th><th className="px-3 py-2">Title</th><th className="px-3 py-2">Test Case</th><th className="px-3 py-2">Step</th><th className="px-3 py-2">Severity</th><th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {defects.map((d) => (
                      <tr key={d.id} className="border-b border-border/50 hover:bg-muted/30 text-[11px]">
                        <td className="px-3 py-2 font-mono text-[10px]">{d.defectId}</td>
                        <td className="px-3 py-2">{d.title}</td>
                        <td className="px-3 py-2 text-muted-foreground">{d.testcaseId}</td>
                        <td className="px-3 py-2 text-muted-foreground">{d.stepNumber}</td>
                        <td className="px-3 py-2"><span className={`text-[9px] px-1.5 py-0.5 rounded ${d.severity === "CRITICAL" || d.severity === "HIGH" ? "bg-red-500/10 text-red-400" : "bg-muted text-muted-foreground"}`}>{d.severity}</span></td>
                        <td className="px-3 py-2"><span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{d.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Evidence Gallery */}
          {evidence.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-medium"><Eye className="inline size-3.5 mr-1" />Evidence Gallery ({evidence.length} files)</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {evidence.map((ev) => (
                  <div key={ev.id} className="rounded-lg border border-border bg-card overflow-hidden cursor-pointer hover:border-muted-foreground/30 transition-colors" onClick={() => setViewingEv(ev.dataUrl ?? null)}>
                    {ev.dataUrl ? <img src={ev.dataUrl} alt={ev.fileName} className="h-24 w-full object-cover" /> : <div className="h-24 flex items-center justify-center bg-muted text-[10px] text-muted-foreground">{ev.captureType}</div>}
                    <div className="px-2 py-1.5">
                      <p className="text-[9px] font-medium truncate">{ev.originalName}</p>
                      <p className="text-[8px] text-muted-foreground">{ev.captureType} · Step {ev.stepNumber}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Lightbox */}
          {viewingEv && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-8" onClick={() => setViewingEv(null)}>
              <img src={viewingEv} className="max-h-[85vh] max-w-full rounded-lg border border-border" />
            </div>
          )}
        </>
      )}

      {!selectedCycle && cycles.length === 0 && (
        <div className="rounded-lg border border-border border-dashed bg-card p-10 text-center">
          <BarChart3 className="mx-auto size-6 text-muted-foreground/40" />
          <p className="mt-2 text-xs text-muted-foreground">No test cycles yet. Create a cycle to generate reports.</p>
        </div>
      )}
    </div>
  );
}
