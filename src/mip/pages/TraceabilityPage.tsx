// ============================================================
// MIP Traceability Page
// ============================================================

import React from "react";
import { useMip } from "../context";
import { Link2, FileText, BookOpen, AlertTriangle, TestTubeDiagonal, TestTubes, Bot, Play, Camera, ArrowRight } from "lucide-react";

export default function TraceabilityPage() {
  const { state } = useMip();

  // Build traceability chains
  const chains = state.rules.map(rule => {
    const findings = state.findings.filter(f => rule.linkedFindingIds.includes(f.id));
    const scenarios = state.scenarios.filter(s => rule.linkedScenarioIds.includes(s.id));
    const testCases = state.testCases.filter(tc => rule.linkedTestCaseIds.includes(tc.id));
    const sourceFiles = state.sourceFiles.filter(f => rule.source === f.name);

    return { rule, findings, scenarios, testCases, sourceFiles };
  });

  // Find orphaned items
  const unmatchedFindings = state.findings.filter(f => !f.linkedRuleId && !f.linkedScenarioId);
  const unmatchedScenarios = state.scenarios.filter(s => s.linkedFindingIds.length === 0 && s.linkedRuleIds.length === 0);

  return (
    <div className="p-6">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-bold text-white">
          <Link2 size={18} className="text-cyan-400" /> Traceability
        </h1>
        <p className="mt-1 text-sm text-slate-400">Complete traceability from source → rules → findings → scenarios → test cases</p>
      </div>

      {/* Summary stats */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { label: "Rules", value: state.rules.length, color: "text-cyan-300" },
          { label: "Findings", value: state.findings.length, color: "text-amber-300" },
          { label: "Scenarios", value: state.scenarios.length, color: "text-purple-300" },
          { label: "Test Cases", value: state.testCases.length, color: "text-emerald-300" },
          { label: "Orphaned", value: unmatchedFindings.length + unmatchedScenarios.length, color: "text-red-300" },
        ].map(s => (
          <div key={s.label} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
            <div className="text-[10px] text-slate-500">{s.label}</div>
            <div className={`mt-1 text-xl font-bold ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Traceability chains */}
      <div className="mt-6 space-y-3">
        {chains.map(({ rule, findings, scenarios, testCases, sourceFiles }) => (
          <div key={rule.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="flex items-center gap-2 text-xs">
              <BookOpen size={12} className="text-cyan-400" />
              <span className="font-mono text-cyan-300">{rule.ruleNumber}</span>
              <span className="font-medium text-white">{rule.title}</span>
            </div>

            {/* Chain visualization */}
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px]">
              {sourceFiles.map(f => (
                <span key={f.id} className="flex items-center gap-1 rounded bg-amber-500/10 px-2 py-1 text-amber-300">
                  <FileText size={10} /> {f.name}
                </span>
              ))}
              {findings.map(f => (
                <span key={f.id} className="flex items-center gap-1 rounded bg-red-500/10 px-2 py-1 text-red-300">
                  <AlertTriangle size={10} /> {f.title.slice(0, 30)}
                </span>
              ))}
              {scenarios.map(s => (
                <span key={s.id} className="flex items-center gap-1 rounded bg-purple-500/10 px-2 py-1 text-purple-300">
                  <TestTubeDiagonal size={10} /> {s.scenarioNumber}
                </span>
              ))}
              {testCases.map(tc => (
                <span key={tc.id} className="flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-1 text-emerald-300">
                  <TestTubes size={10} /> {tc.caseNumber}
                </span>
              ))}
            </div>
          </div>
        ))}

        {chains.length === 0 && (
          <div className="rounded-xl border border-dashed border-white/10 py-12 text-center">
            <Link2 size={32} className="mx-auto text-slate-600" />
            <p className="mt-2 text-sm text-slate-400">No traceability links yet</p>
            <p className="mt-1 text-xs text-slate-600">Create rules and link them to findings and scenarios.</p>
          </div>
        )}
      </div>

      {/* Orphaned items */}
      {(unmatchedFindings.length > 0 || unmatchedScenarios.length > 0) && (
        <div className="mt-6 rounded-xl border border-amber-500/20 bg-amber-500/[0.03] p-4">
          <h3 className="flex items-center gap-2 text-xs font-semibold text-amber-300">
            <AlertTriangle size={14} /> Unlinked Items
          </h3>
          <p className="mt-1 text-xs text-slate-400">These items are not connected to any traceability chain.</p>
          <div className="mt-2 space-y-1">
            {unmatchedFindings.map(f => (
              <div key={f.id} className="text-xs text-slate-400">• Finding: {f.title}</div>
            ))}
            {unmatchedScenarios.map(s => (
              <div key={s.id} className="text-xs text-slate-400">• Scenario: {s.title}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
