/**
 * Manual Test Cases — generate, view, and manage manual test cases.
 */

import { useEffect } from "react";
import { useParams } from "react-router";
import { useModStore, genId } from "../context";
import type { TestCase } from "../lib/types";
import { ClipboardList, Download, Plus } from "lucide-react";

export default function ModTestCases() {
  const { projectId } = useParams<{ projectId: string }>();
  const { state, dispatch, getProjectTestCases } = useModStore();

  useEffect(() => {
    if (projectId) dispatch({ type: "SET_CURRENT_PROJECT", projectId });
  }, [projectId, dispatch]);

  const project = state.projects.find((p) => p.id === projectId);
  if (!project) return <div className="flex items-center justify-center h-64 text-xs text-muted-foreground">Project not found.</div>;

  const testCases = getProjectTestCases(project!.id);

  function generateFromFindings() {
    const findings = Object.values(state.findings).filter((f) => f.projectId === project!.id);
    const newCases: TestCase[] = [];

    findings.forEach((finding) => {
      if (finding.findingType === "MISSING_FUNCTIONALITY" || finding.findingType === "MISSING_VALIDATION") {
        newCases.push({
          id: genId(), projectId: project!.id,
          testcaseId: `TC-${String(testCases.length + newCases.length + 1).padStart(3, "0")}`,
          scenarioId: finding.functionalityId,
          requirement: finding.title,
          precondition: "MOD code has been uploaded and analyzed",
          description: `Verify: ${finding.description}`,
          testData: finding.informationNeeded ?? "See finding for details",
          steps: `1. Execute the relevant MOD job/functionality\n2. Verify behavior matches Legacy expectations\n3. Capture evidence`,
          expectedResult: `MOD behavior matches Legacy: ${finding.title}`,
          status: "NOT_EXECUTED",
          ruleIds: [],
          findingIds: [finding.id],
          createdAt: Date.now(),
        });
      }
    });

    if (newCases.length > 0) {
      dispatch({ type: "SET_TEST_CASES", testCases: [...testCases, ...newCases] });
    }
  }

  function exportCSV() {
    const headers = ["Test Case ID", "Requirement", "Precondition", "Description", "Test Data", "Steps", "Expected Result", "Status"];
    const rows = testCases.map((tc) => [
      tc.testcaseId, tc.requirement, tc.precondition, tc.description, tc.testData, tc.steps, tc.expectedResult, tc.status,
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${project!.name}_test_cases.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Manual Test Cases</h1>
          <p className="mt-1 text-xs text-muted-foreground">{testCases.length} test cases</p>
        </div>
        <div className="flex gap-2">
          <button onClick={generateFromFindings}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[11px] font-medium hover:bg-muted transition-colors">
            <Plus className="size-3" /> Generate from Findings
          </button>
          {testCases.length > 0 && (
            <button onClick={exportCSV}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[11px] font-medium hover:bg-muted transition-colors">
              <Download className="size-3" /> Export CSV
            </button>
          )}
        </div>
      </div>

      {testCases.length === 0 ? (
        <div className="rounded-lg border border-border border-dashed bg-card p-10 text-center">
          <ClipboardList className="mx-auto size-6 text-muted-foreground/40" />
          <p className="mt-2 text-xs text-muted-foreground">No test cases yet. Generate from findings or add manually.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-card border-b border-border">
                <tr className="text-[10px] font-medium text-muted-foreground">
                  <th className="px-3 py-2">ID</th>
                  <th className="px-3 py-2">Requirement</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2">Expected</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {testCases.map((tc) => (
                  <tr key={tc.id} className="border-b border-border/50 hover:bg-muted/30 text-[11px]">
                    <td className="px-3 py-2 font-medium">{tc.testcaseId}</td>
                    <td className="px-3 py-2 text-muted-foreground truncate max-w-[200px]">{tc.requirement}</td>
                    <td className="px-3 py-2 text-muted-foreground truncate max-w-[250px]">{tc.description}</td>
                    <td className="px-3 py-2 text-muted-foreground truncate max-w-[200px]">{tc.expectedResult}</td>
                    <td className="px-3 py-2">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                        tc.status === "PASS" ? "bg-green-500/10 text-green-400" :
                        tc.status === "FAIL" ? "bg-red-500/10 text-red-400" :
                        "bg-muted text-muted-foreground"
                      }`}>{tc.status.replace(/_/g, " ")}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
