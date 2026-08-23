import { useParams } from "react-router";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { AppLayout, PageHeader } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge, getStatusVariant } from "@/components/ui/status-badge";
import {
  Loader2,
  Download,
  FileText,
  CheckCircle2,
  XCircle,
  Ban,
  Clock,
  AlertTriangle,
  Image,
  Camera,
} from "lucide-react";
import type { Id } from "../convex/_generated/dataModel";

function exportReportToCSV(reportData: Record<string, unknown>[]) {
  const headers = [
    "Testcase ID",
    "Execution Type",
    "Status",
    "Environment",
    "Build",
    "Duration (ms)",
    "Executed By",
    "Executed At",
  ];
  const csvRows = [
    headers.map((h) => `"${h}"`).join(","),
    ...reportData.map((row) =>
      headers
        .map((h) => {
          const val = row[h] ?? "";
          return `"${String(val).replace(/"/g, '""')}"`;
        })
        .join(","),
    ),
  ];
  const blob = new Blob(["\uFEFF" + csvRows.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "TestExecution_Report.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function TestReport() {
  const { projectId, cycleId } = useParams<{ projectId: string; cycleId: string }>();
  const cid = cycleId as Id<"testCycles">;
  const pid = projectId as Id<"projects">;

  const reportData = useQuery(api.testExecution.generateReportData, { cycleId: cid });

  const handleExportCSV = () => {
    if (!reportData) return;
    const rows = reportData.detailedResults.map((r) => ({
      "Testcase ID": r.testcaseId,
      "Execution Type": r.executionType,
      Status: r.overallStatus,
      Environment: r.environment || "QA",
      Build: r.build || "",
      "Duration (ms)": r.duration || "",
      "Executed By": r.executedBy,
      "Executed At": new Date(r.executedAt).toLocaleString(),
    }));
    exportReportToCSV(rows);
  };

  const handlePrint = () => {
    window.print();
  };

  if (reportData === undefined) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!reportData) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
          Test cycle not found
        </div>
      </AppLayout>
    );
  }

  const { cycle, summary, detailedResults, totalEvidence, totalDefects, openDefects } = reportData;

  return (
    <AppLayout>
      <PageHeader
        title="Test Execution Report"
        description={`${cycle.name} · Generated ${new Date().toLocaleDateString()}`}
        breadcrumbs={[
          { label: "Dashboard", path: "/app" },
          { label: "Test Cycles", path: `/app/projects/${projectId}/test-cycles` },
          { label: cycle.name, path: `/app/projects/${projectId}/test-cycles/${cycleId}` },
          { label: "Report" },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={handleExportCSV} className="gap-1.5">
              <Download className="size-3.5" />
              Export CSV
            </Button>
            <Button size="sm" variant="outline" onClick={handlePrint} className="gap-1.5">
              <FileText className="size-3.5" />
              Print Report
            </Button>
          </div>
        }
      />
      <div className="p-8">
        <div className="mx-auto max-w-4xl space-y-6 print:max-w-full print:p-4">
          {/* Report Header */}
          <Card className="border-border print:shadow-none">
            <CardContent className="p-5">
              <h2 className="text-base font-semibold mb-3">Test Execution Report</h2>
              <div className="grid gap-2 sm:grid-cols-2 text-xs">
                <div><span className="text-muted-foreground">Project:</span> {cycle.name}</div>
                <div><span className="text-muted-foreground">Release:</span> {cycle.release || "—"}</div>
                <div><span className="text-muted-foreground">Environment:</span> {cycle.environment || "QA"}</div>
                <div><span className="text-muted-foreground">Build:</span> {cycle.build || "—"}</div>
                <div><span className="text-muted-foreground">Tester:</span> {cycle.tester}</div>
                <div>
                  <span className="text-muted-foreground">Date:</span>{" "}
                  {new Date(cycle.createdAt).toLocaleDateString()}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Summary */}
          <Card className="border-border print:shadow-none">
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold mb-3">Summary</h3>
              <div className="grid gap-3 sm:grid-cols-5 text-center">
                <div className="rounded-md border border-border p-3">
                  <p className="text-2xl font-bold">{summary.total}</p>
                  <p className="text-[10px] text-muted-foreground">Total</p>
                </div>
                <div className="rounded-md border border-emerald-600/30 bg-emerald-600/5 p-3">
                  <p className="text-2xl font-bold text-emerald-600">{summary.passed}</p>
                  <p className="text-[10px] text-emerald-600">Passed</p>
                </div>
                <div className="rounded-md border border-red-600/30 bg-red-600/5 p-3">
                  <p className="text-2xl font-bold text-red-600">{summary.failed}</p>
                  <p className="text-[10px] text-red-600">Failed</p>
                </div>
                <div className="rounded-md border border-amber-600/30 bg-amber-600/5 p-3">
                  <p className="text-2xl font-bold text-amber-600">{summary.blocked}</p>
                  <p className="text-[10px] text-amber-600">Blocked</p>
                </div>
                <div className="rounded-md border border-border p-3">
                  <p className="text-2xl font-bold">{summary.passRate}%</p>
                  <p className="text-[10px] text-muted-foreground">Pass Rate</p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-4 text-[11px] text-muted-foreground">
                <span>{totalEvidence} evidence items</span>
                <span>{totalDefects} defects ({openDefects} open)</span>
                <span>{summary.notExecuted} not executed</span>
              </div>
            </CardContent>
          </Card>

          {/* Detailed Results */}
          <Card className="border-border print:shadow-none">
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold mb-3">Test Results</h3>
              <div className="space-y-4">
                {detailedResults.map((result) => (
                  <div key={result._id} className="border border-border rounded-md overflow-hidden">
                    <div className="flex items-center justify-between bg-muted/40 px-4 py-2">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-[11px]">{result.testcaseId}</span>
                        <span className="text-xs">{result.testCase?.requirement}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground">{result.executionType}</span>
                        <StatusBadge
                          label={result.overallStatus}
                          variant={getStatusVariant(result.overallStatus)}
                        />
                      </div>
                    </div>
                    <div className="px-4 py-3 space-y-2">
                      {/* Steps */}
                      {result.steps.map((step) => (
                        <div key={step._id} className="flex items-start gap-3 text-xs">
                          <span className="text-muted-foreground shrink-0 w-16">Step {step.stepNumber}</span>
                          <div className="flex-1 min-w-0">
                            <p>{step.description}</p>
                            {step.actualResult && (
                              <p className="text-muted-foreground mt-0.5">
                                Actual: {step.actualResult}
                              </p>
                            )}
                          </div>
                          <StatusBadge
                            label={step.status}
                            variant={getStatusVariant(step.status)}
                          />
                        </div>
                      ))}

                      {/* Evidence */}
                      {result.evidence.length > 0 && (
                        <div className="border-t border-border pt-2 mt-2">
                          <p className="text-[10px] text-muted-foreground mb-1">Evidence ({result.evidence.length})</p>
                          <div className="flex flex-wrap gap-1.5">
                            {result.evidence.map((ev) => (
                              <span
                                key={ev._id}
                                className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-[9px] text-muted-foreground"
                              >
                                <Camera className="size-2.5" />
                                {ev.captureType} · Step {ev.stepNumber}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Footer */}
          <div className="text-center text-[10px] text-muted-foreground py-4 border-t border-border">
            Report generated by MIPTE — Modernization Intelligence Platform
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
