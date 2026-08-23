import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { AppLayout, PageHeader } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge, getStatusVariant } from "@/components/ui/status-badge";
import {
  Loader2,
  Play,
  Camera,
  BarChart3,
  AlertTriangle,
  FileText,
  ArrowRight,
  ChevronRight,
  Eye,
  Upload,
} from "lucide-react";
import type { Id } from "../convex/_generated/dataModel";

export default function CycleDetail() {
  const { projectId, cycleId } = useParams<{ projectId: string; cycleId: string }>();
  const pid = projectId as Id<"projects">;
  const cid = cycleId as Id<"testCycles">;
  const navigate = useNavigate();

  const stats = useQuery(api.testExecution.getCycleStats, { cycleId: cid });
  const testCases = useQuery(api.testCases.listByProject, { projectId: pid });
  const executions = useQuery(api.testExecution.listExecutions, { testCycleId: cid });
  const createExecution = useMutation(api.testExecution.createExecution);

  const [executing, setExecuting] = useState<string | null>(null);

  const handleExecuteTest = async (testcaseId: string) => {
    setExecuting(testcaseId);
    try {
      const execId = await createExecution({
        projectId: pid,
        testCycleId: cid,
        testcaseId,
        executionType: "MANUAL",
        executedBy: stats?.cycle?.tester || "Unknown",
        environment: stats?.cycle?.environment,
        build: stats?.cycle?.build,
      });
      navigate(`/app/projects/${projectId}/test-cycles/${cycleId}/execute/${execId}`);
    } finally {
      setExecuting(null);
    }
  };

  if (stats === undefined || testCases === undefined) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!stats) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
          Test cycle not found
        </div>
      </AppLayout>
    );
  }

  const { cycle } = stats;
  const totalManual = testCases.length;
  const executedCount = executions?.length ?? 0;

  return (
    <AppLayout>
      <PageHeader
        title={cycle.name}
        description={`${cycle.release || ""} ${cycle.build ? `· Build ${cycle.build}` : ""} ${cycle.environment ? `· ${cycle.environment}` : ""}`}
        breadcrumbs={[
          { label: "Dashboard", path: "/app" },
          { label: "Test Cycles", path: `/app/projects/${projectId}/test-cycles` },
          { label: cycle.name },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate(`/app/projects/${projectId}/test-cycles/${cycleId}/evidence`)}
              className="gap-1.5"
            >
              <Camera className="size-3.5" />
              Evidence ({stats.totalEvidence})
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate(`/app/projects/${projectId}/test-cycles/${cycleId}/report`)}
              className="gap-1.5"
            >
              <FileText className="size-3.5" />
              Report
            </Button>
          </div>
        }
      />
      <div className="p-8">
        <div className="mx-auto max-w-6xl space-y-6">
          {/* Summary Cards */}
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-md border border-border bg-card px-3 py-3">
              <p className="text-[11px] text-muted-foreground">Manual Test Cases</p>
              <p className="text-lg font-semibold">{totalManual}</p>
              <div className="mt-1 flex items-center gap-2 text-[10px]">
                <span className="text-emerald-600">{stats.manualPassed} passed</span>
                <span className="text-red-600">{stats.manualFailed} failed</span>
                <span className="text-amber-600">{stats.manualNotExecuted} pending</span>
              </div>
            </div>
            <div className="rounded-md border border-border bg-card px-3 py-3">
              <p className="text-[11px] text-muted-foreground">Automation Executions</p>
              <p className="text-lg font-semibold">{stats.totalAutomation}</p>
              <div className="mt-1 flex items-center gap-2 text-[10px]">
                <span className="text-emerald-600">{stats.autoPassed} passed</span>
                <span className="text-red-600">{stats.autoFailed} failed</span>
                <span className="text-amber-600">{stats.autoSkipped} skipped</span>
              </div>
            </div>
            <div className="rounded-md border border-border bg-card px-3 py-3">
              <p className="text-[11px] text-muted-foreground">Evidence Captured</p>
              <p className="text-lg font-semibold">{stats.totalEvidence}</p>
              <div className="mt-1 text-[10px] text-muted-foreground">
                Across {stats.totalSteps} steps
              </div>
            </div>
            <div className="rounded-md border border-border bg-card px-3 py-3">
              <p className="text-[11px] text-muted-foreground">Defects</p>
              <p className="text-lg font-semibold">{stats.totalDefects}</p>
              <div className="mt-1 text-[10px] text-muted-foreground">
                {stats.openDefects} open
              </div>
            </div>
          </div>

          {/* Execution Progress */}
          {executedCount > 0 && (
            <Card className="border-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-medium">Execution Progress</h3>
                  <span className="text-[11px] text-muted-foreground">
                    {executedCount} / {totalManual} test cases executed
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-600 transition-all"
                    style={{ width: `${totalManual > 0 ? (executedCount / totalManual) * 100 : 0}%` }}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Quick Actions */}
          <div className="grid gap-2 sm:grid-cols-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/app/projects/${projectId}/test-cycles/${cycleId}/report`)}
              className="justify-start gap-2"
            >
              <BarChart3 className="size-3.5" />
              View Report
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/app/projects/${projectId}/test-cycles/${cycleId}/evidence`)}
              className="justify-start gap-2"
            >
              <Camera className="size-3.5" />
              View Evidence
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/app/projects/${projectId}/test-cycles/${cycleId}/automation-results`)}
              className="justify-start gap-2"
            >
              <Upload className="size-3.5" />
              Import Automation Results
            </Button>
          </div>

          {/* Test Cases to Execute */}
          <div className="border-t border-border pt-6">
            <h2 className="mb-3 text-sm font-medium">Test Cases</h2>
            {testCases.length === 0 ? (
              <div className="rounded-md border border-dashed border-border py-10 text-center">
                <p className="text-xs text-muted-foreground">
                  No test cases generated yet. Generate test cases from approved scenarios first.
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {testCases.map((tc) => {
                  const tcExecs = executions?.filter((e) => e.testcaseId === tc.testcaseId) ?? [];
                  const latestExec = tcExecs.sort((a, b) => b.createdAt - a.createdAt)[0];
                  return (
                    <div
                      key={tc._id}
                      className="flex items-center justify-between rounded-md border border-border bg-card px-4 py-2.5"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-mono text-[11px] text-muted-foreground w-16 shrink-0">
                          {tc.testcaseId}
                        </span>
                        <span className="text-xs truncate">{tc.requirement}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {latestExec ? (
                          <StatusBadge
                            label={latestExec.overallStatus}
                            variant={getStatusVariant(latestExec.overallStatus)}
                          />
                        ) : (
                          <span className="text-[10px] text-muted-foreground">Not executed</span>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleExecuteTest(tc.testcaseId)}
                          disabled={executing === tc.testcaseId}
                          className="gap-1 text-[11px] h-7"
                        >
                          {executing === tc.testcaseId ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : tcExecs.length > 0 ? (
                            <>
                              <ArrowRight className="size-3" />
                              Re-execute
                            </>
                          ) : (
                            <>
                              <Play className="size-3" />
                              Execute
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
