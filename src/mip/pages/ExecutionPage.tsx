// ============================================================
// MIP Test Execution Page
// ============================================================

import React, { useState } from "react";
import { useMip } from "../context";
import { Play, Plus, CheckCircle2, XCircle, Clock, Ban, ArrowRight, Camera } from "lucide-react";

const STATUS_OPTIONS = [
  { value: "not_run", label: "Not Run", color: "bg-slate-500/10 text-slate-400", icon: Clock },
  { value: "in_progress", label: "In Progress", color: "bg-amber-500/10 text-amber-300", icon: Play },
  { value: "pass", label: "Pass", color: "bg-emerald-500/10 text-emerald-300", icon: CheckCircle2 },
  { value: "fail", label: "Fail", color: "bg-red-500/10 text-red-300", icon: XCircle },
  { value: "blocked", label: "Blocked", color: "bg-orange-500/10 text-orange-300", icon: Ban },
  { value: "deferred", label: "Deferred", color: "bg-blue-500/10 text-blue-300", icon: ArrowRight },
];

export default function ExecutionPage() {
  const { state, dispatch } = useMip();
  const [showCycle, setShowCycle] = useState(false);
  const [cycleName, setCycleName] = useState("");
  const [selectedCycle, setSelectedCycle] = useState<string | null>(null);

  const handleCreateCycle = () => {
    if (!cycleName.trim()) return;
    const cycle = {
      id: `cycle_${Date.now()}`,
      projectId: state.currentProjectId || "",
      name: cycleName,
      createdAt: Date.now(),
      status: "active" as const,
    };
    dispatch({ type: "ADD_CYCLE", payload: cycle });
    setSelectedCycle(cycle.id);
    setCycleName("");
    setShowCycle(false);
  };

  const createExecutions = (cycleId: string) => {
    const existingExecIds = new Set(state.executions.filter(e => e.cycleId === cycleId).map(e => e.testCaseId));
    const newExecs = state.testCases
      .filter(tc => !existingExecIds.has(tc.id))
      .map(tc => ({
        id: `exec_${Date.now()}_${tc.id.slice(-6)}`,
        projectId: state.currentProjectId || "",
        cycleId,
        testCaseId: tc.id,
        status: "not_run" as const,
        evidenceIds: [],
      }));
    if (newExecs.length > 0) {
      dispatch({ type: "ADD_EXECUTIONS", payload: newExecs });
    }
  };

  const updateExecStatus = (execId: string, status: string) => {
    const exec = state.executions.find(e => e.id === execId);
    if (exec) {
      dispatch({ type: "UPDATE_EXECUTION", payload: { ...exec, status: status as any, executedAt: Date.now() } });
      // Also update the linked test case status
      const tc = state.testCases.find(t => t.id === exec.testCaseId);
      if (tc) {
        dispatch({ type: "UPDATE_TEST_CASE", payload: { ...tc, status: status as any, updatedAt: Date.now() } });
      }
    }
  };

  const cycleExecutions = selectedCycle ? state.executions.filter(e => e.cycleId === selectedCycle) : [];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold text-white">
            <Play size={18} className="text-cyan-400" /> Test Execution
          </h1>
          <p className="mt-1 text-sm text-slate-400">Manage test cycles and track execution status</p>
        </div>
        <button onClick={() => setShowCycle(!showCycle)}
          className="flex items-center gap-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 px-3 py-1.5 text-xs text-cyan-300 hover:bg-cyan-500/20">
          <Plus size={14} /> New Cycle
        </button>
      </div>

      {showCycle && (
        <div className="mt-4 rounded-xl border border-cyan-500/20 bg-cyan-500/[0.03] p-4 flex items-center gap-3">
          <input value={cycleName} onChange={e => setCycleName(e.target.value)} placeholder="Cycle name (e.g., Regression Cycle 01)"
            className="flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-slate-500 outline-none" />
          <button onClick={handleCreateCycle} disabled={!cycleName.trim()}
            className="rounded-lg bg-cyan-500 px-3 py-2 text-xs font-medium text-[#07090d] disabled:opacity-50">Create</button>
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[240px_1fr]">
        {/* Cycles sidebar */}
        <div className="space-y-1.5">
          <h3 className="text-xs font-semibold text-slate-300 mb-2">Test Cycles</h3>
          {state.cycles.map(cycle => {
            const execs = state.executions.filter(e => e.cycleId === cycle.id);
            const passed = execs.filter(e => e.status === "pass").length;
            return (
              <button key={cycle.id} onClick={() => { setSelectedCycle(cycle.id); createExecutions(cycle.id); }}
                className={`w-full rounded-lg p-3 text-left transition-colors ${
                  selectedCycle === cycle.id ? "bg-cyan-500/10 border border-cyan-500/30" : "border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]"
                }`}>
                <div className="text-xs font-medium text-white">{cycle.name}</div>
                <div className="mt-1 text-[10px] text-slate-500">{execs.length} executions · {passed} passed</div>
              </button>
            );
          })}
          {state.cycles.length === 0 && (
            <p className="text-xs text-slate-600 py-4">No test cycles created yet.</p>
          )}
        </div>

        {/* Execution list */}
        <div>
          {cycleExecutions.length > 0 ? (
            <div className="space-y-1.5">
              {cycleExecutions.map(exec => {
                const tc = state.testCases.find(t => t.id === exec.testCaseId);
                if (!tc) return null;
                const statusOpt = STATUS_OPTIONS.find(s => s.value === exec.status);
                return (
                  <div key={exec.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-mono text-cyan-300">{tc.caseNumber}</span>
                        <span className="ml-2 text-xs text-white">{tc.title}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {STATUS_OPTIONS.map(opt => {
                          const Icon = opt.icon;
                          return (
                            <button key={opt.value} onClick={() => updateExecStatus(exec.id, opt.value)}
                              className={`rounded p-1 transition-colors ${exec.status === opt.value ? opt.color + " ring-1 ring-cyan-500" : "text-slate-600 hover:text-white"}`}
                              title={opt.label}>
                              <Icon size={12} />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : selectedCycle ? (
            <div className="rounded-xl border border-dashed border-white/10 py-8 text-center">
              <p className="text-xs text-slate-500">No test cases to execute. Generate test cases first.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-white/10 py-12 text-center">
              <Play size={32} className="mx-auto text-slate-600" />
              <p className="mt-2 text-sm text-slate-400">Select or create a test cycle</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
