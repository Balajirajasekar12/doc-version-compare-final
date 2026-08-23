// ============================================================
// MIP Coverage Page - Metrics calculated from actual project data
// ============================================================

import React from "react";
import { useMip } from "../context";
import { BarChart3, Target, CheckCircle2, AlertTriangle, BookOpen, TestTubes, Shield } from "lucide-react";

function MetricCard({ label, value, total, icon: Icon, color }: {
  label: string; value: number; total?: number; icon: React.ElementType; color: string;
}) {
  const pct = total && total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-slate-500">{label}</span>
        <Icon size={14} className={color} />
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-bold text-white">{value}</span>
        {total !== undefined && <span className="text-xs text-slate-500">/ {total}</span>}
      </div>
      {total !== undefined && (
        <div className="mt-2 h-1.5 rounded-full bg-white/[0.06]">
          <div className={`h-full rounded-full ${pct >= 80 ? "bg-emerald-400" : pct >= 50 ? "bg-amber-400" : "bg-red-400"}`}
            style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
      )}
      <div className="mt-1 text-[10px] text-slate-500">{pct}%</div>
    </div>
  );
}

export default function CoveragePage() {
  const { state } = useMip();

  // Calculate coverage from actual data
  const totalConditions = state.analyses.reduce((sum, a) => sum + a.conditions.length, 0);
  const totalRules = state.rules.length;
  const totalFindings = state.findings.length;
  const totalScenarios = state.scenarios.length;
  const totalTestCases = state.testCases.length;
  const executedCases = state.testCases.filter(t => t.status !== "not_run");
  const passedCases = state.testCases.filter(t => t.status === "pass");
  const failedCases = state.testCases.filter(t => t.status === "fail");

  return (
    <div className="p-6">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-bold text-white">
          <BarChart3 size={18} className="text-cyan-400" /> Coverage
        </h1>
        <p className="mt-1 text-sm text-slate-400">All percentages calculated from actual project data — no arbitrary numbers</p>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Legacy Files Analyzed" value={state.sourceFiles.filter(f => f.side === "legacy" && f.status === "analyzed").length}
          total={state.sourceFiles.filter(f => f.side === "legacy").length} icon={Target} color="text-cyan-400" />
        <MetricCard label="Conditions Detected" value={totalConditions} icon={AlertTriangle} color="text-amber-400" />
        <MetricCard label="Business Rules" value={totalRules} icon={BookOpen} color="text-blue-400" />
        <MetricCard label="Findings" value={totalFindings} icon={AlertTriangle} color="text-orange-400" />
        <MetricCard label="Rules with Scenarios" value={state.rules.filter(r => r.linkedScenarioIds.length > 0).length}
          total={totalRules} icon={CheckCircle2} color="text-emerald-400" />
        <MetricCard label="Rules with Test Cases" value={state.rules.filter(r => r.linkedTestCaseIds.length > 0).length}
          total={totalRules} icon={TestTubes} color="text-purple-400" />
        <MetricCard label="Findings Resolved" value={state.findings.filter(f => f.status === "resolved").length}
          total={totalFindings} icon={Shield} color="text-emerald-400" />
        <MetricCard label="Test Execution Coverage" value={executedCases.length}
          total={totalTestCases} icon={CheckCircle2} color="text-cyan-400" />
        <MetricCard label="Pass Rate" value={passedCases.length}
          total={executedCases.length || 1} icon={CheckCircle2} color="text-emerald-400" />
        <MetricCard label="Failure Rate" value={failedCases.length}
          total={executedCases.length || 1} icon={AlertTriangle} color="text-red-400" />
      </div>

      {/* Finding status breakdown */}
      <div className="mt-6 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
        <h3 className="text-xs font-semibold text-slate-300">Finding Status Breakdown</h3>
        <div className="mt-3 space-y-2">
          {[
            { label: "Open", count: state.findings.filter(f => f.status === "open").length, color: "bg-slate-400" },
            { label: "Valid Issue", count: state.findings.filter(f => f.status === "valid_issue").length, color: "bg-red-400" },
            { label: "Intentionally Missed", count: state.findings.filter(f => f.status === "intentionally_missed").length, color: "bg-blue-400" },
            { label: "Deferred", count: state.findings.filter(f => f.status === "deferred").length, color: "bg-amber-400" },
            { label: "Accepted", count: state.findings.filter(f => f.status === "accepted").length, color: "bg-purple-400" },
            { label: "Resolved", count: state.findings.filter(f => f.status === "resolved").length, color: "bg-emerald-400" },
            { label: "Needs Investigation", count: state.findings.filter(f => f.status === "needs_investigation").length, color: "bg-orange-400" },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-3">
              <span className="w-32 text-xs text-slate-400">{item.label}</span>
              <div className="flex-1 h-2 rounded-full bg-white/[0.06]">
                <div className={`h-full rounded-full ${item.color}`}
                  style={{ width: `${totalFindings > 0 ? (item.count / totalFindings) * 100 : 0}%` }} />
              </div>
              <span className="w-8 text-right text-xs font-mono text-slate-300">{item.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
