// ============================================================
// MIP Test Cases Page - Manual test case management
// ============================================================

import React, { useState } from "react";
import { useMip } from "../context";
import { TestTubes, Plus, Play, CheckCircle2, XCircle, Clock, Ban, ArrowRight, AlertTriangle, Loader2 } from "lucide-react";

const STATUS_ICONS: Record<string, React.ReactNode> = {
  not_run: <Clock size={10} className="text-slate-500" />,
  in_progress: <Play size={10} className="text-amber-400" />,
  pass: <CheckCircle2 size={10} className="text-emerald-400" />,
  fail: <XCircle size={10} className="text-red-400" />,
  blocked: <Ban size={10} className="text-orange-400" />,
  deferred: <ArrowRight size={10} className="text-blue-400" />,
};

export default function TestCasesPage() {
  const { state, generateTestCases, dispatch } = useMip();
  const [generating, setGenerating] = useState(false);
  const [selectedScenarios, setSelectedScenarios] = useState<string[]>([]);

  const handleGenerate = async () => {
    if (selectedScenarios.length === 0) return;
    setGenerating(true);
    try {
      await generateTestCases(selectedScenarios);
      setSelectedScenarios([]);
    } finally {
      setGenerating(false);
    }
  };

  const toggleScenario = (id: string) => {
    setSelectedScenarios(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  };

  const updateStatus = (tcId: string, status: string) => {
    const tc = state.testCases.find(t => t.id === tcId);
    if (tc) dispatch({ type: "UPDATE_TEST_CASE", payload: { ...tc, status: status as any, updatedAt: Date.now() } });
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold text-white">
            <TestTubes size={18} className="text-cyan-400" /> Test Cases
          </h1>
          <p className="mt-1 text-sm text-slate-400">{state.testCases.length} test cases — NOT auto-regenerated</p>
        </div>
      </div>

      {/* Generate section - explicit user action required */}
      <div className="mt-4 rounded-xl border border-cyan-500/20 bg-cyan-500/[0.03] p-4">
        <h3 className="text-xs font-semibold text-cyan-300">Generate Manual Test Cases</h3>
        <p className="mt-1 text-xs text-slate-400">Select test scenarios and explicitly generate test cases. They will NOT be automatically regenerated.</p>
        <div className="mt-3 space-y-1">
          {state.scenarios.map(s => (
            <label key={s.id} className="flex items-center gap-2 rounded-lg bg-white/[0.02] px-3 py-1.5 cursor-pointer hover:bg-white/[0.04]">
              <input type="checkbox" checked={selectedScenarios.includes(s.id)} onChange={() => toggleScenario(s.id)}
                className="rounded border-white/20 bg-white/[0.03]" />
              <span className="text-[10px] font-mono text-cyan-300">{s.scenarioNumber}</span>
              <span className="text-xs text-slate-300">{s.title}</span>
            </label>
          ))}
          {state.scenarios.length === 0 && (
            <p className="text-xs text-slate-600">No test scenarios defined. Create scenarios in Test Design first.</p>
          )}
        </div>
        <button onClick={handleGenerate} disabled={selectedScenarios.length === 0 || generating}
          className="mt-3 flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-medium text-[#07090d] hover:bg-cyan-400 disabled:opacity-50">
          {generating ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
          Generate Test Cases ({selectedScenarios.length} scenarios)
        </button>
      </div>

      {/* Test cases list */}
      <div className="mt-6 space-y-2">
        {state.testCases.map(tc => (
          <div key={tc.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-mono font-bold text-cyan-300">{tc.caseNumber}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    tc.priority === "critical" ? "bg-red-500/10 text-red-300" :
                    tc.priority === "high" ? "bg-orange-500/10 text-orange-300" : "bg-slate-500/10 text-slate-400"
                  }`}>{tc.priority}</span>
                  <span className="text-[10px] text-slate-500">{tc.type}</span>
                </div>
                <h3 className="mt-1 text-sm font-medium text-white">{tc.title}</h3>
                <p className="mt-0.5 text-xs text-slate-400">{tc.objective}</p>
              </div>
              <div className="flex items-center gap-2">
                {STATUS_ICONS[tc.status]}
                <select value={tc.status} onChange={e => updateStatus(tc.id, e.target.value)}
                  className="rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-slate-300 outline-none">
                  <option value="not_run">Not Run</option>
                  <option value="in_progress">In Progress</option>
                  <option value="pass">Pass</option>
                  <option value="fail">Fail</option>
                  <option value="blocked">Blocked</option>
                  <option value="deferred">Deferred</option>
                </select>
              </div>
            </div>

            {/* Steps */}
            {tc.steps.length > 0 && (
              <div className="mt-3 space-y-1">
                <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Steps</span>
                {tc.steps.map(step => (
                  <div key={step.stepNumber} className="rounded-lg bg-white/[0.02] px-3 py-1.5 text-xs">
                    <span className="font-mono text-cyan-300">Step {step.stepNumber}:</span>
                    <span className="ml-1 text-slate-300">{step.action}</span>
                    {step.sql && (
                      <pre className="mt-1 rounded bg-white/[0.03] p-2 text-[10px] text-slate-400 font-mono whitespace-pre-wrap">{step.sql}</pre>
                    )}
                    <div className="mt-0.5 text-[10px] text-emerald-300">Expected: {step.expectedResult}</div>
                  </div>
                ))}
              </div>
            )}

            {tc.sqlValidation && (
              <div className="mt-2 rounded-lg bg-white/[0.02] p-2">
                <span className="text-[10px] text-slate-500">SQL Validation:</span>
                <pre className="mt-1 text-[10px] text-slate-300 font-mono whitespace-pre-wrap">{tc.sqlValidation}</pre>
              </div>
            )}
          </div>
        ))}
        {state.testCases.length === 0 && (
          <div className="rounded-xl border border-dashed border-white/10 py-12 text-center">
            <TestTubes size={32} className="mx-auto text-slate-600" />
            <p className="mt-2 text-sm text-slate-400">No test cases generated yet</p>
            <p className="mt-1 text-xs text-slate-600">Create scenarios in Test Design, then generate test cases above.</p>
          </div>
        )}
      </div>
    </div>
  );
}
