/**
 * System-Level Analysis — runs the complete analysis pipeline in-browser.
 * No server calls. All code analysis happens locally.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { useModStore } from "../context";
import {
  runFullAnalysis,
  generateBusinessExplanation,
  type AnalysisProgress,
  type PipelineStep,
} from "../../lib/analysis";
import type { Finding as EngineFinding, InformationRequest as EngineInfoRequest } from "../../lib/analysis/types";
import { Zap, Check, AlertCircle, Loader2 } from "lucide-react";

const STEP_LABELS: Record<PipelineStep, string> = {
  FILE_DISCOVERY: "File discovery",
  COMPONENT_EXTRACTION: "Component extraction",
  DEPENDENCY_BUILDING: "Dependency graph building",
  FUNCTIONALITY_CLUSTERING: "Functionality clustering",
  SEMANTIC_MAPPING: "Semantic mapping",
  BEHAVIOR_GRAPH: "Behavior graph construction",
  BEHAVIOR_COMPARISON: "Behavior comparison",
  FINDING_GENERATION: "Finding generation",
  INFORMATION_REQUESTS: "Information request generation",
  COMPLETED: "Completed",
};

export default function ModAnalysis() {
  const { projectId } = useParams<{ projectId: string }>();
  const { state, dispatch, getProjectFiles } = useModStore();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{
    findings: number;
    functionalities: number;
    mappings: number;
    infoRequests: number;
  } | null>(null);

  useEffect(() => {
    if (projectId) dispatch({ type: "SET_CURRENT_PROJECT", projectId });
  }, [projectId, dispatch]);

  const project = state.projects.find((p) => p.id === projectId);

  const legacyFiles = useMemo(
    () => (project ? getProjectFiles(project.id, "LEGACY") : []),
    [project, getProjectFiles],
  );
  const modFiles = useMemo(
    () => (project ? getProjectFiles(project.id, "MOD") : []),
    [project, getProjectFiles],
  );
  const canAnalyze = legacyFiles.length > 0 && modFiles.length > 0;

  const runAnalysis = useCallback(async () => {
    if (!canAnalyze || running || !project) return;
    setRunning(true);
    setError(null);
    setLastResult(null);

    try {
      const legacyInput = legacyFiles.map((f) => ({
        fileId: f.id,
        fileName: f.fileName,
        content: f.content,
        language: f.language,
      }));
      const modInput = modFiles.map((f) => ({
        fileId: f.id,
        fileName: f.fileName,
        content: f.content,
        language: f.language,
      }));

      dispatch({ type: "UPDATE_PROJECT", projectId: project.id, updates: { status: "ANALYZING" } });

      const result = await runFullAnalysis(legacyInput, modInput, project.id, setProgress);

      // Save functionalities
      const functionalities = result.functionalities.map((f) => ({
        ...f,
        projectId: project.id,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }));
      dispatch({ type: "SET_FUNCTIONALITIES", functionalities });

      // Save mappings
      const mappings = result.mappings.map((m) => ({
        ...m,
        projectId: project.id,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }));
      dispatch({ type: "SET_COMPONENT_MAPPINGS", mappings });

      // Generate business explanations and save findings
      const findings = result.findings.map((f: EngineFinding) => {
        const legacyNodes = result.legacyBehavior.nodes;
        const modNodes = result.modBehavior.nodes;
        const legacyComps = result.components.filter((c) => c.sourceType === "LEGACY");
        const modComps = result.components.filter((c) => c.sourceType === "MOD");
        const businessExplanation = generateBusinessExplanation(f, legacyComps, modComps, legacyNodes, modNodes);
        return {
          ...f,
          projectId: project.id,
          businessExplanation,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
      });
      dispatch({ type: "SET_FINDINGS", findings });

      // Save information requests
      const infoRequests = result.informationRequests.map((r: EngineInfoRequest) => ({
        ...r,
        projectId: project.id,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }));
      dispatch({ type: "SET_INFORMATION_REQUESTS", requests: infoRequests });

      setLastResult({
        findings: findings.length,
        functionalities: functionalities.length,
        mappings: mappings.length,
        infoRequests: infoRequests.length,
      });

      const hasOpenFindings = findings.some((f) => f.status === "OPEN");
      dispatch({
        type: "UPDATE_PROJECT",
        projectId: project.id,
        updates: { status: hasOpenFindings ? "GAPS_FOUND" : "COMPARING" },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
      dispatch({ type: "UPDATE_PROJECT", projectId: project.id, updates: { status: "COMPARING" } });
    }

    setRunning(false);
  }, [canAnalyze, running, project, legacyFiles, modFiles, dispatch]);

  const steps: PipelineStep[] = [
    "FILE_DISCOVERY", "COMPONENT_EXTRACTION", "DEPENDENCY_BUILDING",
    "FUNCTIONALITY_CLUSTERING", "SEMANTIC_MAPPING", "BEHAVIOR_GRAPH",
    "BEHAVIOR_COMPARISON", "FINDING_GENERATION", "INFORMATION_REQUESTS", "COMPLETED",
  ];

  if (!project) return <div className="flex items-center justify-center h-64 text-xs text-muted-foreground">Project not found.</div>;

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 space-y-8">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">System-Level Analysis</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Analyze the complete Legacy and MOD codebases together. No file-pair selection required.
        </p>
      </div>

      {/* Source Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-[10px] text-muted-foreground">Legacy Source</p>
          <p className="text-lg font-semibold">{legacyFiles.length}</p>
          <p className="text-[10px] text-muted-foreground">
            {new Set(legacyFiles.map((f) => f.language)).size} languages
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-[10px] text-muted-foreground">MOD Source</p>
          <p className="text-lg font-semibold">{modFiles.length}</p>
          <p className="text-[10px] text-muted-foreground">
            {new Set(modFiles.map((f) => f.language)).size} languages
          </p>
        </div>
      </div>

      {/* Run Analysis */}
      <button
        onClick={runAnalysis}
        disabled={!canAnalyze || running}
        className={`inline-flex items-center gap-1.5 rounded-md px-5 py-2 text-[11px] font-medium transition-colors ${
          canAnalyze && !running
            ? "bg-foreground text-background hover:opacity-90"
            : "bg-muted text-muted-foreground cursor-not-allowed"
        }`}
      >
        {running ? (
          <>
            <Loader2 className="size-3.5 animate-spin" />
            Analyzing...
          </>
        ) : (
          <>
            <Zap className="size-3.5" />
            Analyze Entire System
          </>
        )}
      </button>

      {!canAnalyze && (
        <p className="text-[10px] text-muted-foreground">
          Upload both Legacy and MOD source files before running analysis.
        </p>
      )}

      {/* Progress */}
      {running && progress && (
        <div className="rounded-lg border border-border bg-card p-5 space-y-3">
          <p className="text-xs font-medium">Analysis Progress</p>
          <div className="space-y-1.5">
            {steps.map((step) => {
              const completed = progress.stepsCompleted.includes(step);
              const isCurrent = progress.currentStep === step && !completed;
              const isDone = step === "COMPLETED" && completed;
              return (
                <div key={step} className="flex items-center gap-2 text-[11px]">
                  {isDone ? (
                    <Check className="size-3 text-green-400" />
                  ) : isCurrent ? (
                    <Loader2 className="size-3 text-foreground animate-spin" />
                  ) : completed ? (
                    <Check className="size-3 text-green-400" />
                  ) : (
                    <div className="size-3 rounded-full border border-border" />
                  )}
                  <span className={completed || isCurrent ? "text-foreground" : "text-muted-foreground"}>
                    {STEP_LABELS[step]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Results */}
      {lastResult && (
        <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-5 space-y-3">
          <div className="flex items-center gap-2 text-xs font-medium text-green-400">
            <Check className="size-3.5" />
            Analysis Complete
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded border border-border bg-card p-3">
              <p className="text-[10px] text-muted-foreground">Functionalities</p>
              <p className="text-lg font-semibold">{lastResult.functionalities}</p>
            </div>
            <div className="rounded border border-border bg-card p-3">
              <p className="text-[10px] text-muted-foreground">Findings</p>
              <p className="text-lg font-semibold">{lastResult.findings}</p>
            </div>
            <div className="rounded border border-border bg-card p-3">
              <p className="text-[10px] text-muted-foreground">Component Mappings</p>
              <p className="text-lg font-semibold">{lastResult.mappings}</p>
            </div>
            <div className="rounded border border-border bg-card p-3">
              <p className="text-[10px] text-muted-foreground">Info Requests</p>
              <p className="text-lg font-semibold">{lastResult.infoRequests}</p>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2.5 text-[11px] text-red-400">
          <AlertCircle className="size-3.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Previous Results */}
      {!running && !lastResult && Object.values(state.findings).filter((f) => f.projectId === project.id).length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">
            Previous analysis found {Object.values(state.functionalities).filter((f) => f.projectId === project.id).length} functionalities
            and {Object.values(state.findings).filter((f) => f.projectId === project.id).length} findings.
            Run analysis again to re-evaluate.
          </p>
        </div>
      )}
    </div>
  );
}
