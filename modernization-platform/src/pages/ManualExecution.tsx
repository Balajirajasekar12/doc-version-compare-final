import { useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { AppLayout, PageHeader } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge, getStatusVariant } from "@/components/ui/status-badge";
import {
  Loader2,
  Camera,
  Upload,
  Check,
  X,
  AlertTriangle,
  Ban,
  ChevronRight,
  Image,
  Trash2,
  MessageSquare,
  AlertCircle,
} from "lucide-react";
import { captureWithFallback, getAllProviderStatuses } from "@/lib/capture";
import type { CaptureProviderStatus } from "@/lib/capture";
import type { Id } from "../convex/_generated/dataModel";

export default function ManualExecution() {
  const { projectId, cycleId, executionId } = useParams<{
    projectId: string;
    cycleId: string;
    executionId: string;
  }>();
  const pid = projectId as Id<"projects">;
  const cid = cycleId as Id<"testCycles">;
  const eid = executionId as Id<"testExecutions">;
  const navigate = useNavigate();

  const execution = useQuery(api.testExecution.getExecution, { executionId: eid });
  const steps = useQuery(api.testExecution.getExecutionSteps, { executionId: eid });
  const evidence = useQuery(api.testExecution.getExecutionEvidence, { executionId: eid });
  const project = useQuery(api.projects.get, { projectId: pid });
  const testCase = useQuery(api.testCases.listByProject, { projectId: pid });

  const updateStep = useMutation(api.testExecution.updateStepExecution);
  const completeExec = useMutation(api.testExecution.completeExecution);
  const addEvidence = useMutation(api.testExecution.addEvidence);
  const deleteEvidenceMutation = useMutation(api.testExecution.deleteEvidence);
  const createDefect = useMutation(api.testExecution.createDefect);

  const [capturing, setCapturing] = useState<string | null>(null);
  const [providerStatuses, setProviderStatuses] = useState<CaptureProviderStatus[]>([]);
  const [showDefectForm, setShowDefectForm] = useState<string | null>(null);
  const [defectTitle, setDefectTitle] = useState("");
  const [defectDesc, setDefectDesc] = useState("");
  const [defectSeverity, setDefectSeverity] = useState<"CRITICAL" | "HIGH" | "MEDIUM" | "LOW">("MEDIUM");

  const currentTC = execution
    ? testCase?.find((t) => t.testcaseId === execution.testcaseId)
    : null;

  // Load provider statuses once
  const loadProviders = useCallback(async () => {
    const statuses = await getAllProviderStatuses();
    setProviderStatuses(statuses);
  }, []);

  const handleCapture = async (stepNum: number) => {
    setCapturing(`step-${stepNum}`);
    try {
      await loadProviders();
      const result = await captureWithFallback("UPLOAD");
      if (result) {
        await addEvidence({
          projectId: pid,
          testCycleId: cid,
          executionId: eid,
          testcaseId: execution?.testcaseId || "",
          stepNumber: stepNum,
          captureType: result.captureType,
          fileName: result.fileName,
          originalName: result.fileName,
          mimeType: result.mimeType,
          size: result.blob.size,
          capturedBy: project?.owner || "Unknown",
          description: `Evidence for step ${stepNum}`,
        });
      }
    } finally {
      setCapturing(null);
    }
  };

  const handleStepStatus = async (
    stepId: Id<"stepExecutions">,
    status: "PASS" | "FAIL" | "BLOCKED" | "NOT_APPLICABLE",
  ) => {
    await updateStep({
      stepId,
      status,
      executedBy: project?.owner || "Unknown",
    });
  };

  const handleComplete = async () => {
    await completeExec({ executionId: eid, notes: "Execution completed" });
    navigate(`/app/projects/${projectId}/test-cycles/${cycleId}`);
  };

  const handleCreateDefect = async (stepNumber: number, expectedResult: string, actualResult: string) => {
    if (!defectTitle.trim()) return;
    await createDefect({
      projectId: pid,
      testCycleId: cid,
      executionId: eid,
      testcaseId: execution?.testcaseId || "",
      stepNumber,
      title: defectTitle.trim(),
      description: defectDesc.trim(),
      expectedResult,
      actualResult,
      environment: execution?.environment,
      build: execution?.build,
      severity: defectSeverity,
      createdBy: project?.owner || "Unknown",
    });
    setShowDefectForm(null);
    setDefectTitle("");
    setDefectDesc("");
    setDefectSeverity("MEDIUM");
  };

  const handleDeleteEvidence = async (evId: Id<"testEvidence">) => {
    if (!confirm("Delete this evidence item?")) return;
    await deleteEvidenceMutation({ evidenceId: evId });
  };

  if (execution === undefined || steps === undefined || evidence === undefined) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!execution) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
          Execution not found
        </div>
      </AppLayout>
    );
  }

  const stepEvidence = (stepNum: number) =>
    evidence.filter((e) => e.stepNumber === stepNum);

  return (
    <AppLayout>
      <PageHeader
        title={`${execution.testcaseId} — Execution #${execution.executionNumber}`}
        description={currentTC?.requirement || "Manual test execution"}
        breadcrumbs={[
          { label: "Dashboard", path: "/app" },
          { label: "Test Cycles", path: `/app/projects/${projectId}/test-cycles` },
          { label: cycleId ?? "", path: `/app/projects/${projectId}/test-cycles/${cycleId}` },
          { label: `Execution #${execution.executionNumber}` },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge
              label={execution.overallStatus}
              variant={getStatusVariant(execution.overallStatus)}
            />
            <Button size="sm" onClick={handleComplete} className="gap-1.5">
              <Check className="size-3.5" />
              Complete
            </Button>
          </div>
        }
      />
      <div className="p-8">
        <div className="mx-auto max-w-4xl space-y-6">
          {/* Test Case Info */}
          {currentTC && (
            <Card className="border-border">
              <CardContent className="p-4 space-y-2">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Requirement</p>
                    <p className="text-xs mt-0.5">{currentTC.requirement}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Precondition</p>
                    <p className="text-xs mt-0.5">{currentTC.precondition || "None"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Test Data</p>
                    <p className="text-xs mt-0.5 font-mono">{currentTC.testData}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Environment</p>
                    <p className="text-xs mt-0.5">{execution.environment || "QA"} · {execution.build || "—"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Steps */}
          {steps.map((step) => {
            const stepEvs = stepEvidence(step.stepNumber);
            return (
              <Card key={step._id} className="border-border">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-sm font-medium">
                        Step {step.stepNumber}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {step.description}
                      </p>
                    </div>
                    <StatusBadge
                      label={step.status}
                      variant={getStatusVariant(step.status)}
                    />
                  </div>

                  {/* Expected Result */}
                  <div className="mb-3 rounded-md bg-muted/40 px-3 py-2">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Expected Result</p>
                    <p className="text-xs mt-0.5">{step.expectedResult}</p>
                  </div>

                  {/* Actual Result */}
                  <div className="mb-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Actual Result</p>
                    <textarea
                      value={step.actualResult || ""}
                      onChange={(e) => {
                        // Update step actual result (we'll use updateStep with same status)
                        updateStep({
                          stepId: step._id,
                          status: step.status === "NOT_EXECUTED" ? "NOT_EXECUTED" : step.status,
                          actualResult: e.target.value || undefined,
                          executedBy: project?.owner || "Unknown",
                        });
                      }}
                      placeholder="Enter actual result..."
                      className="w-full rounded-md border border-border bg-card px-3 py-2 text-xs min-h-[60px] resize-y focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-wrap items-center gap-1.5 mb-3">
                    <Button
                      size="sm"
                      variant={step.status === "PASS" ? "default" : "outline"}
                      onClick={() => handleStepStatus(step._id, "PASS")}
                      className="gap-1 text-[11px] h-7"
                    >
                      <Check className="size-3" />
                      Pass
                    </Button>
                    <Button
                      size="sm"
                      variant={step.status === "FAIL" ? "default" : "outline"}
                      onClick={() => handleStepStatus(step._id, "FAIL")}
                      className="gap-1 text-[11px] h-7"
                    >
                      <X className="size-3" />
                      Fail
                    </Button>
                    <Button
                      size="sm"
                      variant={step.status === "BLOCKED" ? "default" : "outline"}
                      onClick={() => handleStepStatus(step._id, "BLOCKED")}
                      className="gap-1 text-[11px] h-7"
                    >
                      <Ban className="size-3" />
                      Blocked
                    </Button>
                    <div className="w-px h-4 bg-border mx-1" />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCapture(step.stepNumber)}
                      disabled={capturing === `step-${step.stepNumber}`}
                      className="gap-1 text-[11px] h-7"
                    >
                      {capturing === `step-${step.stepNumber}` ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Camera className="size-3" />
                      )}
                      Capture
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCapture(step.stepNumber)}
                      disabled={capturing === `step-${step.stepNumber}`}
                      className="gap-1 text-[11px] h-7"
                    >
                      <Upload className="size-3" />
                      Upload
                    </Button>
                    {step.status === "FAIL" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowDefectForm(`step-${step.stepNumber}`)}
                        className="gap-1 text-[11px] h-7 text-destructive border-destructive/30"
                      >
                        <AlertCircle className="size-3" />
                        Create Defect
                      </Button>
                    )}
                  </div>

                  {/* Evidence for this step */}
                  {stepEvs.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                        Evidence ({stepEvs.length})
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {stepEvs.map((ev) => (
                          <div
                            key={ev._id}
                            className="group relative flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5"
                          >
                            <Image className="size-3.5 text-muted-foreground" />
                            <span className="text-[10px] text-muted-foreground">
                              {ev.captureType} · {ev.originalName}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(ev.capturedAt).toLocaleTimeString()}
                            </span>
                            <button
                              onClick={() => handleDeleteEvidence(ev._id)}
                              className="rounded p-0.5 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Trash2 className="size-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Defect Form */}
                  {showDefectForm === `step-${step.stepNumber}` && (
                    <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-2">
                      <p className="text-xs font-medium text-destructive">Create Defect</p>
                      <Input
                        value={defectTitle}
                        onChange={(e) => setDefectTitle(e.target.value)}
                        placeholder="Defect title"
                        className="h-7 text-xs"
                      />
                      <textarea
                        value={defectDesc}
                        onChange={(e) => setDefectDesc(e.target.value)}
                        placeholder="Description of the defect..."
                        className="w-full rounded-md border border-border bg-card px-3 py-2 text-xs min-h-[60px] resize-y focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                      <div className="flex items-center gap-2">
                        <select
                          value={defectSeverity}
                          onChange={(e) => setDefectSeverity(e.target.value as typeof defectSeverity)}
                          className="rounded-md border border-border bg-card px-2 py-1 text-xs"
                        >
                          <option value="LOW">Low</option>
                          <option value="MEDIUM">Medium</option>
                          <option value="HIGH">High</option>
                          <option value="CRITICAL">Critical</option>
                        </select>
                        <Button
                          size="sm"
                          onClick={() =>
                            handleCreateDefect(
                              step.stepNumber,
                              step.expectedResult,
                              step.actualResult || "No actual result provided",
                            )
                          }
                          disabled={!defectTitle.trim()}
                          className="gap-1 text-[11px] h-7"
                        >
                          Create
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setShowDefectForm(null)}
                          className="text-[11px] h-7"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}

          {/* Snagit Unavailable Notice */}
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="size-4 text-amber-500 mt-0.5 shrink-0" />
                <div className="text-xs space-y-1">
                  <p className="font-medium">Evidence Capture</p>
                  <p className="text-muted-foreground">
                    Browser capture and manual upload are always available.
                    For Snagit integration, install the MIPTE Capture Agent
                    on your local Windows machine. Snagit is optional and not required.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
