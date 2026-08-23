/**
 * Coverage Dashboard — overview of rules, test scenarios, test cases, and findings resolution.
 * All metrics computed from React Context (browser memory).
 */

import { useParams } from "react-router";
import { useModStore } from "../context";
import { BarChart3 } from "lucide-react";

function CoverageBar({ label, covered, total }: { label: string; covered: number; total: number }) {
  const pct = total > 0 ? Math.round((covered / total) * 100) : 0;
  return (
    <div className="rounded-md border border-border bg-card px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium">{label}</span>
        <span className="text-xs text-muted-foreground">{covered}/{total} ({pct}%)</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: pct >= 80 ? "#10b981" : pct >= 50 ? "#f59e0b" : "#ef4444" }}
        />
      </div>
    </div>
  );
}

export default function ModCoverage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { state } = useModStore();

  const project = state.projects.find((p) => p.id === projectId);
  if (!project) {
    return <div className="flex items-center justify-center h-64 text-xs text-muted-foreground">Project not found.</div>;
  }

  const isFrozen = project.modFrozen || project.status === "FROZEN";

  // Compute coverage from state
  const businessRules = Object.values(state.businessRuleEntries).filter((r) => r.projectId === projectId);
  const findings = Object.values(state.findings).filter((f) => f.projectId === projectId);
  const testCases = Object.values(state.testCases).filter((tc) => tc.projectId === projectId);
  const testExecutions = Object.values(state.testExecutions).filter((e) => e.projectId === projectId);

  // Rule coverage
  const confirmedRules = businessRules.filter((r) => r.status === "CONFIRMED" || r.status === "IN_MOD");
  const ruleCoverage = { covered: confirmedRules.length, total: businessRules.length };

  // Test case execution
  const executedCases = testCases.filter((tc) => tc.status !== "NOT_EXECUTED");
  const passedCases = testCases.filter((tc) => tc.status === "PASS");
  const testCaseCoverage = { executed: executedCases.length, total: testCases.length, passed: passedCases.length };

  // Findings resolution
  const resolvedFindings = findings.filter((f) =>
    f.status === "ACCEPTED" || f.status === "INTENTIONAL" || f.status === "FALSE_POSITIVE" || f.status === "FIX_REQUIRED"
  );
  const diffCoverage = { resolved: resolvedFindings.length, total: findings.length };

  // Business rules breakdown
  const identified = businessRules.filter((r) => r.status === "IDENTIFIED").length;
  const confirmed = businessRules.filter((r) => r.status === "CONFIRMED").length;
  const inMod = businessRules.filter((r) => r.status === "IN_MOD").length;
  const missingInMod = businessRules.filter((r) => r.status === "MISSING_IN_MOD").length;
  const unknown = businessRules.filter((r) => r.status === "UNKNOWN").length;

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Coverage Dashboard</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Overview of rules, test scenarios, test cases, and finding resolution
        </p>
      </div>

      {!isFrozen ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <BarChart3 className="mb-3 size-5 text-muted-foreground" strokeWidth={1.5} />
          <p className="text-xs text-muted-foreground">
            Freeze the MOD version and generate test scenarios to see coverage metrics.
          </p>
        </div>
      ) : (
        <>
          <CoverageBar label="Rule Coverage" covered={ruleCoverage.covered} total={ruleCoverage.total} />
          <CoverageBar label="Test Case Execution" covered={testCaseCoverage.executed} total={testCaseCoverage.total} />
          <CoverageBar label="Finding Resolution" covered={diffCoverage.resolved} total={diffCoverage.total} />

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-border bg-card p-4">
              <h3 className="text-xs font-medium mb-3">Business Rules</h3>
              <div className="space-y-1.5 text-[11px]">
                <div className="flex justify-between"><span className="text-muted-foreground">Identified</span><span>{identified}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Confirmed</span><span className="text-emerald-600">{confirmed}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">In MOD</span><span>{inMod}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Missing in MOD</span><span className="text-red-600">{missingInMod}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Unknown</span><span className="text-muted-foreground">{unknown}</span></div>
              </div>
            </div>
            <div className="rounded-md border border-border bg-card p-4">
              <h3 className="text-xs font-medium mb-3">Test Execution</h3>
              <div className="space-y-1.5 text-[11px]">
                <div className="flex justify-between"><span className="text-muted-foreground">Total Test Cases</span><span>{testCases.length}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Passed</span><span className="text-emerald-600">{passedCases.length}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Failed</span><span className="text-red-600">{testCases.filter((tc) => tc.status === "FAIL").length}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Not Executed</span><span>{testCases.filter((tc) => tc.status === "NOT_EXECUTED").length}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Executions</span><span>{testExecutions.length}</span></div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
