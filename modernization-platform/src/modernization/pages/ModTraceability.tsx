/**
 * Traceability Matrix — map requirements to rules, test cases, and evidence.
 * All computed from React Context (browser memory).
 */

import { useMemo } from "react";
import { useParams } from "react-router";
import { useModStore } from "../context";
import { Link2 } from "lucide-react";

interface TraceLink {
  id: string;
  requirement: string;
  ruleId?: string;
  testcaseId?: string;
  findingId?: string;
  status: string;
}

export default function ModTraceability() {
  const { projectId } = useParams<{ projectId: string }>();
  const { state } = useModStore();

  const project = state.projects.find((p) => p.id === projectId);

  // Build traceability links from findings → rules → test cases
  const links = useMemo<TraceLink[]>(() => {
    if (!projectId) return [];
    const result: TraceLink[] = [];

    const findings = Object.values(state.findings).filter((f) => f.projectId === projectId);
    const rules = Object.values(state.businessRuleEntries).filter((r) => r.projectId === projectId);
    const testCases = Object.values(state.testCases).filter((tc) => tc.projectId === projectId);

    for (const finding of findings) {
      // Find linked rules
      const linkedRules = rules.filter(
        (r) => r.description.includes(finding.title) || finding.description.includes(r.ruleId),
      );
      // Find linked test cases
      const linkedTCs = testCases.filter(
        (tc) => tc.findingIds.includes(finding.id) || tc.requirement.includes(finding.title),
      );

      result.push({
        id: `trace-${finding.id}`,
        requirement: finding.title,
        ruleId: linkedRules.length > 0 ? linkedRules.map((r) => r.ruleId).join(", ") : undefined,
        testcaseId: linkedTCs.length > 0 ? linkedTCs.map((tc) => tc.testcaseId).join(", ") : undefined,
        findingId: finding.id,
        status: finding.status,
      });
    }

    return result;
  }, [projectId, state.findings, state.businessRuleEntries, state.testCases]);

  // Compute coverage
  const testCases = Object.values(state.testCases).filter((tc) => tc.projectId === projectId);
  const executed = testCases.filter((tc) => tc.status !== "NOT_EXECUTED").length;
  const passed = testCases.filter((tc) => tc.status === "PASS").length;
  const totalRules = Object.values(state.businessRuleEntries).filter((r) => r.projectId === projectId).length;
  const confirmedRules = Object.values(state.businessRuleEntries).filter(
    (r) => r.projectId === projectId && (r.status === "CONFIRMED" || r.status === "IN_MOD"),
  ).length;

  const isFrozen = project?.modFrozen || project?.status === "FROZEN";

  function statusColor(status: string): string {
    switch (status) {
      case "ACCEPTED": case "INTENTIONAL": case "FIX_REQUIRED": return "bg-green-500/10 text-green-400";
      case "OPEN": case "NEEDS_INFO": return "bg-amber-500/10 text-amber-400";
      case "FALSE_POSITIVE": return "bg-muted text-muted-foreground";
      default: return "bg-muted text-muted-foreground";
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Traceability Matrix</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Map requirements to rules, test cases, and evidence
        </p>
      </div>

      {/* Coverage summary */}
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-md border border-border bg-card px-3 py-2">
          <p className="text-[11px] text-muted-foreground">Rule Coverage</p>
          <p className="text-lg font-semibold">{confirmedRules}/{totalRules}</p>
        </div>
        <div className="rounded-md border border-border bg-card px-3 py-2">
          <p className="text-[11px] text-muted-foreground">Test Cases</p>
          <p className="text-lg font-semibold">{testCases.length}</p>
        </div>
        <div className="rounded-md border border-border bg-card px-3 py-2">
          <p className="text-[11px] text-muted-foreground">Execution Rate</p>
          <p className="text-lg font-semibold">
            {testCases.length > 0 ? Math.round((executed / testCases.length) * 100) : 0}%
          </p>
        </div>
        <div className="rounded-md border border-border bg-card px-3 py-2">
          <p className="text-[11px] text-muted-foreground">Pass Rate</p>
          <p className="text-lg font-semibold text-emerald-600">
            {executed > 0 ? Math.round((passed / executed) * 100) : 0}%
          </p>
        </div>
      </div>

      {/* Links table */}
      {links.length > 0 ? (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-2 font-medium text-muted-foreground">Requirement</th>
                <th className="px-3 py-2 font-medium text-muted-foreground">Rule</th>
                <th className="px-3 py-2 font-medium text-muted-foreground">Test Case</th>
                <th className="px-3 py-2 font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {links.map((link) => (
                <tr key={link.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 max-w-[300px] truncate">{link.requirement}</td>
                  <td className="px-3 py-2 text-muted-foreground">{link.ruleId ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{link.testcaseId ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded ${statusColor(link.status)}`}>
                      {link.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Link2 className="mb-3 size-5 text-muted-foreground" strokeWidth={1.5} />
          <p className="text-xs text-muted-foreground">
            {isFrozen
              ? "No traceability links yet. Upload source files and run analysis to generate findings."
              : "Freeze the MOD version and generate test cases first."}
          </p>
        </div>
      )}
    </div>
  );
}
