import { useState, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { AppLayout, PageHeader } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  runFullAnalysis,
  generateBusinessExplanation,
  generateDevQuestion,
  getFindingTypeLabel,
  type SystemAnalysisResult,
  type Finding,
  type InformationRequest,
  type Functionality,
  type ExtractedComponent,
  type BehaviorNode,
  type BusinessExplanation,
  type MissingInformationItem,
} from "@/lib/analysis";
import { toast } from "sonner";
import {
  Brain,
  Loader2,
  Play,
  ChevronDown,
  CheckCircle2,
  Circle,
  AlertTriangle,
  FileSearch,
  GitBranch,
  Search,
  Shield,
  Zap,
  ArrowRight,
  ChevronRight,
  ExternalLink,
  Eye,
  Code2,
  MessageCircleQuestion,
  Lightbulb,
  Copy,
  Check,
  BookOpen,
  HelpCircle,
  Info,
  FileText,
  Layers,
} from "lucide-react";
import type { Id } from "../convex/_generated/dataModel";
import type { Doc } from "../convex/_generated/dataModel";

// ── Pipeline Steps Display ────────────────────────────────────

const PIPELINE_STEPS = [
  { key: "FILE_DISCOVERY", label: "File discovery", icon: FileSearch },
  { key: "COMPONENT_EXTRACTION", label: "Component extraction", icon: Search },
  { key: "DEPENDENCY_BUILDING", label: "Dependency extraction", icon: GitBranch },
  { key: "FUNCTIONALITY_CLUSTERING", label: "Functionality clustering", icon: Brain },
  { key: "SEMANTIC_MAPPING", label: "Semantic mapping", icon: ArrowRight },
  { key: "BEHAVIOR_GRAPH", label: "Behavior graph", icon: GitBranch },
  { key: "BEHAVIOR_COMPARISON", label: "Behavior comparison", icon: Shield },
  { key: "COMPLETED", label: "Finding generation", icon: CheckCircle2 },
] as const;

// ── Severity Colors ───────────────────────────────────────────

function severityColor(s: string) {
  switch (s) {
    case "CRITICAL": return "text-red-400 bg-red-500/10 border-red-500/20";
    case "HIGH": return "text-orange-400 bg-orange-500/10 border-orange-500/20";
    case "MEDIUM": return "text-amber-400 bg-amber-500/10 border-amber-500/20";
    case "LOW": return "text-blue-400 bg-blue-500/10 border-blue-500/20";
    case "INFO": return "text-muted-foreground bg-muted/50 border-border";
    default: return "text-muted-foreground bg-muted/50 border-border";
  }
}

function severityIcon(s: string) {
  switch (s) {
    case "CRITICAL": return "🔴";
    case "HIGH": return "🟠";
    case "MEDIUM": return "🟡";
    case "LOW": return "🔵";
    case "INFO": return "⚪";
    default: return "⚪";
  }
}

function evidenceLevelBadge(level: string) {
  switch (level) {
    case "PROVEN": return { color: "text-emerald-400 bg-emerald-500/10", label: "Proven from source code" };
    case "STRONG_EVIDENCE": return { color: "text-teal-400 bg-teal-500/10", label: "Strong evidence from Legacy source" };
    case "POSSIBLE": return { color: "text-amber-400 bg-amber-500/10", label: "Possible — needs confirmation" };
    case "UNKNOWN": return { color: "text-red-400 bg-red-500/10", label: "Insufficient source evidence" };
    case "MISSING_INFORMATION": return { color: "text-red-400 bg-red-500/10", label: "Missing information required" };
    default: return { color: "text-muted-foreground bg-muted/50", label: level };
  }
}

// ── Main Page ─────────────────────────────────────────────────

export default function Compare() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("project") as Id<"projects"> | null;

  const projects = useQuery(api.projects.list);
  const [selectedProject, setSelectedProject] = useState<string>(projectId || "");
  const projectFiles = useQuery(
    api.sourceFiles.listByProject,
    selectedProject ? { projectId: selectedProject as Id<"projects"> } : "skip",
  );

  const [analysisResult, setAnalysisResult] = useState<SystemAnalysisResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [pipelineStep, setPipelineStep] = useState<number>(-1);

  const [activeTab, setActiveTab] = useState<"overview" | "findings" | "functionalities" | "mappings" | "info">("overview");
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [findingFilter, setFindingFilter] = useState<{ severity?: string; status?: string }>({});
  const [selectedFuncId, setSelectedFuncId] = useState<string | null>(null);

  const saveFunctionalities = useMutation(api.systemAnalysis.saveFunctionalities);
  const saveFindings = useMutation(api.systemAnalysis.saveFindings);
  const saveMappings = useMutation(api.systemAnalysis.saveComponentMappings);
  const saveInfoRequests = useMutation(api.systemAnalysis.saveInformationRequests);
  const updateFindingStatus = useMutation(api.systemAnalysis.updateFindingStatus);
  const answerInfoRequest = useMutation(api.systemAnalysis.answerInfoRequest);
  const dismissInfoRequest = useMutation(api.systemAnalysis.dismissInfoRequest);

  const legacyFiles = useMemo(
    () => (projectFiles || []).filter((f) => f.sourceType === "LEGACY"),
    [projectFiles],
  );
  const modFiles = useMemo(
    () => (projectFiles || []).filter((f) => f.sourceType === "MOD"),
    [projectFiles],
  );

  const handleAnalyze = useCallback(async () => {
    if (!selectedProject || legacyFiles.length === 0 || modFiles.length === 0) {
      toast.error("Upload both Legacy and MOD source files before analysis.");
      return;
    }

    setAnalyzing(true);
    setPipelineStep(0);
    setAnalysisResult(null);

    try {
      const legacyInputs = legacyFiles.map((f) => ({
        fileId: f._id,
        fileName: f.fileName,
        content: f.content,
        language: f.language || "text",
      }));
      const modInputs = modFiles.map((f) => ({
        fileId: f._id,
        fileName: f.fileName,
        content: f.content,
        language: f.language || "text",
      }));

      const result = await runFullAnalysis(
        legacyInputs,
        modInputs,
        selectedProject,
        (progress) => {
          const stepIdx = PIPELINE_STEPS.findIndex((s) => s.key === progress.currentStep);
          setPipelineStep(stepIdx >= 0 ? stepIdx : PIPELINE_STEPS.length - 1);
        },
      );

      // Generate business explanations for each finding
      const enrichedFindings = result.findings.map((finding) => {
        const explanation = generateBusinessExplanation(
          finding,
          result.components.filter((c) => c.sourceType === "LEGACY"),
          result.components.filter((c) => c.sourceType === "MOD"),
          result.legacyBehavior.nodes,
          result.modBehavior.nodes,
        );
        return { ...finding, _explanation: explanation };
      });

      setAnalysisResult({
        ...result,
        findings: enrichedFindings,
      } as unknown as SystemAnalysisResult);

      // Persist to Convex with business explanations
      await saveFunctionalities({
        projectId: selectedProject as Id<"projects">,
        functionalities: result.functionalities.map((f) => ({
          name: f.name,
          description: f.description,
          status: f.status,
          legacyComponentIds: f.legacyComponentIds,
          modComponentIds: f.modComponentIds,
          confidence: f.confidence,
          clusteringReason: f.clusteringReason,
        })),
      });

      await saveFindings({
        projectId: selectedProject as Id<"projects">,
        findings: enrichedFindings.map((f) => ({
          functionalityId: f.functionalityId,
          findingType: f.findingType,
          severity: f.severity,
          confidence: f.confidence,
          title: f.title,
          description: f.description,
          legacyEvidence: f.legacyEvidence,
          modEvidence: f.modEvidence,
          informationNeeded: f.informationNeeded,
          businessExplanation: {
            legacyBehavior: f._explanation.legacyBehavior,
            modBehavior: f._explanation.modBehavior,
            difference: f._explanation.difference,
            impact: f._explanation.impact,
            possibleImpact: f._explanation.possibleImpact,
            example: f._explanation.example,
            summary: f._explanation.summary,
            evidenceLevel: f._explanation.evidenceLevel,
            confidenceExplanation: f._explanation.confidenceExplanation,
            businessRules: f._explanation.businessRules,
            missingInformation: f._explanation.missingInformation,
          },
        })),
      });

      await saveMappings({
        projectId: selectedProject as Id<"projects">,
        mappings: result.mappings.map((m) => ({
          functionalityId: m.functionalityId,
          mappingType: m.mappingType,
          legacyComponentIds: m.legacyComponentIds,
          modComponentIds: m.modComponentIds,
          reason: m.reason,
          evidence: m.evidence,
          confidence: m.confidence,
          source: m.source,
        })),
      });

      await saveInfoRequests({
        projectId: selectedProject as Id<"projects">,
        requests: result.informationRequests.map((r) => ({
          functionalityId: r.functionalityId,
          findingId: r.findingId,
          type: r.type,
          title: r.title,
          description: r.description,
          whatIsNeeded: r.whatIsNeeded,
          reason: r.reason,
          suggestedQuery: r.suggestedQuery,
        })),
      });

      toast.success(`Analysis complete: ${result.findings.length} findings, ${result.functionalities.length} functionalities`);
    } catch (err) {
      console.error("Analysis failed:", err);
      toast.error("Analysis failed. Check console for details.");
    } finally {
      setAnalyzing(false);
      setPipelineStep(PIPELINE_STEPS.length - 1);
    }
  }, [selectedProject, legacyFiles, modFiles, saveFunctionalities, saveFindings, saveMappings, saveInfoRequests]);

  const filteredFindings = useMemo(() => {
    if (!analysisResult) return [];
    let findings = analysisResult.findings;
    if (findingFilter.severity) findings = findings.filter((f) => f.severity === findingFilter.severity);
    if (findingFilter.status) findings = findings.filter((f) => f.status === findingFilter.status);
    if (selectedFuncId) findings = findings.filter((f) => f.functionalityId === selectedFuncId);
    return findings;
  }, [analysisResult, findingFilter, selectedFuncId]);

  const stats = useMemo(() => {
    if (!analysisResult) return null;
    const bySeverity = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
    const byType: Record<string, number> = {};
    let archChanges = 0;

    for (const f of analysisResult.findings) {
      bySeverity[f.severity as keyof typeof bySeverity]++;
      byType[f.findingType] = (byType[f.findingType] || 0) + 1;
      if (f.findingType === "INTENTIONAL_ARCHITECTURAL_CHANGE") archChanges++;
    }

    return {
      total: analysisResult.findings.length,
      functionalities: analysisResult.functionalities.length,
      mappings: analysisResult.mappings.length,
      infoRequests: analysisResult.informationRequests.length,
      pendingInfo: analysisResult.informationRequests.filter((r) => r.status === "PENDING").length,
      bySeverity,
      byType,
      archChanges,
    };
  }, [analysisResult]);

  const hasFiles = legacyFiles.length > 0 && modFiles.length > 0;

  return (
    <AppLayout>
      <PageHeader
        title="System-Level Analysis"
        description="Automatically analyze entire Legacy and MOD codebases to discover functionalities, map components, and identify behavioral differences."
        breadcrumbs={[
          { label: "Dashboard", path: "/app" },
          { label: "Analysis" },
        ]}
      />

      <div className="p-8">
        <div className="mx-auto max-w-7xl space-y-6">

          {/* Project selector + upload summary */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-3">
              <label className="text-xs text-muted-foreground">Project:</label>
              <div className="relative">
                <select
                  value={selectedProject}
                  onChange={(e) => {
                    setSelectedProject(e.target.value);
                    setAnalysisResult(null);
                  }}
                  className="appearance-none rounded-md border border-border bg-card px-3 py-1.5 pr-7 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">Select project...</option>
                  {projects?.map((p) => (
                    <option key={p._id} value={p._id}>{p.name}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>

            {selectedProject && (
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block size-2 rounded-full bg-orange-500" />
                  Legacy: <strong className="text-foreground">{legacyFiles.length} files</strong>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block size-2 rounded-full bg-blue-500" />
                  MOD: <strong className="text-foreground">{modFiles.length} files</strong>
                </span>
              </div>
            )}

            {selectedProject && hasFiles && (
              <Button
                size="sm"
                disabled={analyzing}
                onClick={handleAnalyze}
                className="ml-auto gap-1.5"
              >
                {analyzing ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
                {analyzing ? "Analyzing..." : "Analyze Entire System"}
              </Button>
            )}
          </div>

          {/* Pipeline progress */}
          {analyzing && (
            <div className="rounded-md border border-border bg-card p-4">
              <h3 className="mb-3 text-xs font-medium">Analysis Progress</h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {PIPELINE_STEPS.map((step, idx) => {
                  const isCompleted = idx < pipelineStep;
                  const isCurrent = idx === pipelineStep;
                  const Icon = step.icon;
                  return (
                    <div
                      key={step.key}
                      className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs transition-colors ${
                        isCurrent ? "border-primary/40 bg-primary/5 text-primary"
                          : isCompleted ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-400"
                            : "border-border bg-muted/30 text-muted-foreground"
                      }`}
                    >
                      {isCompleted ? <CheckCircle2 className="size-3.5 shrink-0" />
                        : isCurrent ? <Loader2 className="size-3.5 shrink-0 animate-spin" />
                          : <Circle className="size-3.5 shrink-0" />}
                      <span>{step.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* No files warning */}
          {selectedProject && !hasFiles && (
            <div className="rounded-md border border-border bg-card p-6 text-center">
              <AlertTriangle className="mx-auto mb-2 size-5 text-amber-400" />
              <p className="text-xs text-muted-foreground">
                Upload both Legacy and MOD source files before running system analysis.
              </p>
              <Button
                size="sm" variant="outline" className="mt-3"
                onClick={() => window.location.href = `/app/projects/${selectedProject}/upload`}
              >
                Upload Files
              </Button>
            </div>
          )}

          {/* ── Analysis Results ── */}
          {analysisResult && stats && (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <SummaryCard label="Functionalities" value={stats.functionalities} icon={<Brain className="size-4" />} color="text-purple-400" />
                <SummaryCard label="Findings" value={stats.total} icon={<Zap className="size-4" />} color="text-amber-400" />
                <SummaryCard label="Info Requests" value={stats.pendingInfo} icon={<AlertTriangle className="size-4" />} color="text-orange-400" subtitle={`${stats.infoRequests} total`} />
                <SummaryCard label="Architecture Changes" value={stats.archChanges} icon={<GitBranch className="size-4" />} color="text-blue-400" subtitle="Intentional" />
              </div>

              <div className="flex flex-wrap gap-2">
                {(["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"] as const).map((sev) => (
                  <button
                    key={sev}
                    onClick={() => setFindingFilter((prev) => ({ ...prev, severity: prev.severity === sev ? undefined : sev }))}
                    className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-colors ${
                      findingFilter.severity === sev ? severityColor(sev) + " ring-1 ring-current" : severityColor(sev)
                    }`}
                  >
                    <span>{severityIcon(sev)}</span>
                    <span>{sev}</span>
                    <span className="opacity-60">({stats.bySeverity[sev]})</span>
                  </button>
                ))}
              </div>

              <div className="flex gap-1 border-b border-border">
                {(["overview", "findings", "functionalities", "mappings", "info"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-4 py-2 text-xs font-medium capitalize transition-colors border-b-2 -mb-px ${
                      activeTab === tab ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tab === "info" ? "Information Requests" : tab}
                    {tab === "findings" && ` (${filteredFindings.length})`}
                    {tab === "info" && stats.pendingInfo > 0 && (
                      <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-orange-500/20 px-1.5 py-0.5 text-[10px] text-orange-400">
                        {stats.pendingInfo}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <div className="min-h-[400px]">
                {activeTab === "overview" && <OverviewTab result={analysisResult} stats={stats} />}
                {activeTab === "findings" && (
                  <FindingsTab
                    findings={filteredFindings}
                    result={analysisResult}
                    selectedFinding={selectedFinding}
                    onSelectFinding={setSelectedFinding}
                    onUpdateStatus={async (findingId, status) => {
                      await updateFindingStatus({ findingId: findingId as Id<"findings">, status: status as Doc<"findings">["status"] });
                      toast.success(`Finding marked as ${status}`);
                    }}
                  />
                )}
                {activeTab === "functionalities" && (
                  <FunctionalitiesTab
                    functionalities={analysisResult.functionalities}
                    selectedFuncId={selectedFuncId}
                    onSelectFunc={setSelectedFuncId}
                    onSwitchToFindings={() => setActiveTab("findings")}
                  />
                )}
                {activeTab === "mappings" && <MappingsTab mappings={analysisResult.mappings} />}
                {activeTab === "info" && (
                  <InfoRequestsTab
                    requests={analysisResult.informationRequests}
                    onAnswer={async (reqId, answer) => {
                      await answerInfoRequest({ requestId: reqId as Id<"informationRequests">, answer });
                      toast.success("Information request answered");
                    }}
                    onDismiss={async (reqId) => {
                      await dismissInfoRequest({ requestId: reqId as Id<"informationRequests"> });
                      toast.success("Information request dismissed");
                    }}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

// ── Summary Card ──────────────────────────────────────────────

function SummaryCard({ label, value, icon, color, subtitle }: { label: string; value: number; icon: React.ReactNode; color: string; subtitle?: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={color}>{icon}</span>
      </div>
      <div className="mt-2 text-2xl font-bold tracking-tight">{value}</div>
      {subtitle && <span className="text-[11px] text-muted-foreground">{subtitle}</span>}
    </div>
  );
}

// ── Overview Tab ──────────────────────────────────────────────

function OverviewTab({ result, stats }: { result: SystemAnalysisResult; stats: { total: number; functionalities: number; mappings: number; infoRequests: number; pendingInfo: number; bySeverity: Record<string, number>; byType: Record<string, number>; archChanges: number } }) {
  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border bg-card p-4">
        <h3 className="mb-3 text-xs font-medium">Analysis Summary</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 text-xs">
          <div><span className="text-muted-foreground">Total components extracted:</span><span className="ml-2 font-medium">{result.components.length}</span></div>
          <div><span className="text-muted-foreground">Legacy components:</span><span className="ml-2 font-medium">{result.components.filter((c) => c.sourceType === "LEGACY").length}</span></div>
          <div><span className="text-muted-foreground">MOD components:</span><span className="ml-2 font-medium">{result.components.filter((c) => c.sourceType === "MOD").length}</span></div>
          <div><span className="text-muted-foreground">Legacy dependency edges:</span><span className="ml-2 font-medium">{result.legacyEdges.length}</span></div>
          <div><span className="text-muted-foreground">MOD dependency edges:</span><span className="ml-2 font-medium">{result.modEdges.length}</span></div>
          <div><span className="text-muted-foreground">Component mappings:</span><span className="ml-2 font-medium">{result.mappings.length}</span></div>
        </div>
      </div>
      {Object.keys(stats.byType).length > 0 && (
        <div className="rounded-md border border-border bg-card p-4">
          <h3 className="mb-3 text-xs font-medium">Findings by Type</h3>
          <div className="space-y-1.5">
            {Object.entries(stats.byType).sort(([, a], [, b]) => b - a).map(([type, count]) => (
              <div key={type} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{getFindingTypeLabel(type as any)}</span>
                <span className="font-medium">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-md border border-border bg-card p-4">
          <h3 className="mb-2 text-xs font-medium">Legacy Behavior Graph</h3>
          <div className="text-xs text-muted-foreground">{result.legacyBehavior.nodes.length} nodes · {result.legacyBehavior.edges.length} edges</div>
          <div className="mt-2 space-y-1">
            {result.legacyBehavior.nodes.slice(0, 5).map((n) => (
              <div key={n.id} className="flex items-center gap-2 text-[11px]">
                <StatusBadge label={n.type} variant="info" />
                <span className="truncate text-muted-foreground">{n.label}</span>
              </div>
            ))}
            {result.legacyBehavior.nodes.length > 5 && <div className="text-[11px] text-muted-foreground">+{result.legacyBehavior.nodes.length - 5} more...</div>}
          </div>
        </div>
        <div className="rounded-md border border-border bg-card p-4">
          <h3 className="mb-2 text-xs font-medium">MOD Behavior Graph</h3>
          <div className="text-xs text-muted-foreground">{result.modBehavior.nodes.length} nodes · {result.modBehavior.edges.length} edges</div>
          <div className="mt-2 space-y-1">
            {result.modBehavior.nodes.slice(0, 5).map((n) => (
              <div key={n.id} className="flex items-center gap-2 text-[11px]">
                <StatusBadge label={n.type} variant="info" />
                <span className="truncate text-muted-foreground">{n.label}</span>
              </div>
            ))}
            {result.modBehavior.nodes.length > 5 && <div className="text-[11px] text-muted-foreground">+{result.modBehavior.nodes.length - 5} more...</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Findings Tab ──────────────────────────────────────────────

function FindingsTab({ findings, result, selectedFinding, onSelectFinding, onUpdateStatus }: {
  findings: Finding[];
  result: SystemAnalysisResult;
  selectedFinding: Finding | null;
  onSelectFinding: (f: Finding | null) => void;
  onUpdateStatus: (findingId: string, status: string) => Promise<void>;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-1 space-y-1 max-h-[600px] overflow-y-auto">
        {findings.length === 0 && (
          <div className="rounded-md border border-border bg-card p-6 text-center text-xs text-muted-foreground">
            No findings match the current filters.
          </div>
        )}
        {findings.map((f) => {
          const explanation = (f as any)._explanation as BusinessExplanation | undefined;
          return (
            <button
              key={f.id}
              onClick={() => onSelectFinding(f)}
              className={`w-full rounded-md border p-3 text-left transition-colors ${
                selectedFinding?.id === f.id ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted/30"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[10px]">{severityIcon(f.severity)}</span>
                    <span className="text-[10px] text-muted-foreground">{f.confidence} confidence</span>
                    {explanation && (
                      <span className={`text-[9px] px-1 py-0.5 rounded ${evidenceLevelBadge(explanation.evidenceLevel).color}`}>
                        {explanation.evidenceLevel.replace(/_/g, " ")}
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-medium leading-tight truncate">{f.title}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{getFindingTypeLabel(f.findingType)}</p>
                  {explanation && (
                    <p className="mt-0.5 text-[10px] text-muted-foreground/70 line-clamp-2">{explanation.summary}</p>
                  )}
                </div>
                <StatusBadge label={f.status} variant={f.status === "OPEN" ? "warning" : "info"} />
              </div>
            </button>
          );
        })}
      </div>

      <div className="lg:col-span-2">
        {selectedFinding ? (
          <FindingDetail finding={selectedFinding} result={result} onUpdateStatus={onUpdateStatus} />
        ) : (
          <div className="rounded-md border border-border bg-card p-12 text-center text-xs text-muted-foreground">
            Select a finding to view details.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Finding Detail (Enhanced with Business View / Technical View) ─────────

function FindingDetail({ finding, result, onUpdateStatus }: {
  finding: Finding;
  result: SystemAnalysisResult;
  onUpdateStatus: (findingId: string, status: string) => Promise<void>;
}) {
  const func = result.functionalities.find((f) => f.id === finding.functionalityId);
  const explanation = (finding as any)._explanation as BusinessExplanation | undefined;

  // Compute explanation on-the-fly if not pre-generated
  const liveExplanation = useMemo(() => {
    if (explanation) return explanation;
    return generateBusinessExplanation(
      finding,
      result.components.filter((c) => c.sourceType === "LEGACY"),
      result.components.filter((c) => c.sourceType === "MOD"),
      result.legacyBehavior.nodes,
      result.modBehavior.nodes,
    );
  }, [finding, result]);

  const [viewMode, setViewMode] = useState<"business" | "technical">("business");
  const [copiedQuestion, setCopiedQuestion] = useState(false);
  const [showDevQuestion, setShowDevQuestion] = useState(false);

  const handleCopyQuestion = useCallback(async () => {
    const question = generateDevQuestion(finding, liveExplanation);
    await navigator.clipboard.writeText(question);
    setCopiedQuestion(true);
    setTimeout(() => setCopiedQuestion(false), 2000);
  }, [finding, liveExplanation]);

  const evo = evidenceLevelBadge(liveExplanation.evidenceLevel);

  return (
    <div className="rounded-md border border-border bg-card overflow-hidden">
      {/* Header with View Toggle */}
      <div className="border-b border-border bg-muted/20 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <h3 className="text-sm font-medium">{finding.title}</h3>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <StatusBadge label={getFindingTypeLabel(finding.findingType)} variant="warning" />
              <StatusBadge label={finding.severity} variant={finding.severity === "CRITICAL" || finding.severity === "HIGH" ? "error" : "info"} />
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${evo.color}`}>{evo.label}</span>
              {func && <span className="text-[10px] text-muted-foreground">in {func.name}</span>}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {/* View mode toggle */}
            <div className="flex rounded-md border border-border bg-background">
              <button
                onClick={() => setViewMode("business")}
                className={`flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium rounded-l-md transition-colors ${
                  viewMode === "business" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <BookOpen className="size-3" /> Business View
              </button>
              <button
                onClick={() => setViewMode("technical")}
                className={`flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium rounded-r-md transition-colors ${
                  viewMode === "technical" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Code2 className="size-3" /> Technical View
              </button>
            </div>
          </div>
        </div>

        {/* Status buttons */}
        <div className="mt-3 flex flex-wrap gap-1">
          {["OPEN", "ACCEPTED", "INTENTIONAL", "FALSE_POSITIVE", "FIX_REQUIRED", "NEEDS_INFO"].map((status) => (
            <Button
              key={status}
              size="sm"
              variant={finding.status === status ? "default" : "outline"}
              onClick={() => onUpdateStatus(finding.id, status)}
              className="text-[10px] px-2 py-0.5 h-auto"
            >
              {status.replace(/_/g, " ")}
            </Button>
          ))}
        </div>
      </div>

      {/* Business View */}
      {viewMode === "business" && (
        <div className="p-4 space-y-5">

          {/* Summary */}
          <div className="rounded-md bg-primary/5 border border-primary/20 p-3">
            <h4 className="text-[11px] font-medium text-primary mb-1 flex items-center gap-1.5">
              <Info className="size-3" /> Summary
            </h4>
            <p className="text-xs leading-relaxed">{liveExplanation.summary}</p>
          </div>

          {/* 1. What Legacy Does */}
          <Section
            number="1"
            title="What Happens in Legacy?"
            icon={<Layers className="size-3.5 text-orange-400" />}
          >
            <p className="text-xs leading-relaxed text-muted-foreground">{liveExplanation.legacyBehavior}</p>
          </Section>

          {/* 2. What MOD Does */}
          <Section
            number="2"
            title="What Happens in MOD?"
            icon={<Layers className="size-3.5 text-blue-400" />}
          >
            <p className="text-xs leading-relaxed text-muted-foreground">{liveExplanation.modBehavior}</p>
          </Section>

          {/* 3. What Is Different */}
          <Section
            number="3"
            title="What Is Different?"
            icon={<ArrowRight className="size-3.5 text-amber-400" />}
          >
            <p className="text-xs leading-relaxed text-muted-foreground">{liveExplanation.difference}</p>
          </Section>

          {/* 4. Why Does This Matter */}
          <Section
            number="4"
            title="Why Does This Matter?"
            icon={<AlertTriangle className="size-3.5 text-orange-400" />}
          >
            <p className="text-xs leading-relaxed text-muted-foreground">{liveExplanation.impact}</p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground italic">{liveExplanation.possibleImpact}</p>
          </Section>

          {/* 5. Confidence Explanation */}
          <div className="rounded-md border border-border bg-card p-3">
            <h4 className="text-[11px] font-medium mb-1.5 flex items-center gap-1.5">
              <Shield className="size-3.5" /> Confidence Assessment
            </h4>
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${evidenceLevelBadge(liveExplanation.evidenceLevel).color}`}>
                {liveExplanation.confidenceExplanation.level}
              </span>
              <span className="text-[10px] text-muted-foreground">{liveExplanation.confidenceExplanation.evidenceStrength}</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">{liveExplanation.confidenceExplanation.reason}</p>
          </div>

          {/* 6. Business Rules */}
          {liveExplanation.businessRules.length > 0 && (
            <div className="rounded-md border border-border bg-card p-3">
              <h4 className="text-[11px] font-medium mb-2 flex items-center gap-1.5">
                <CheckCircle2 className="size-3.5 text-emerald-400" /> Business Rules Identified ({liveExplanation.businessRules.length})
              </h4>
              <div className="space-y-2">
                {liveExplanation.businessRules.map((rule) => (
                  <div key={rule.id} className="rounded-md bg-muted/30 border border-border p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[10px] font-mono text-muted-foreground">BR-{String(rule.ruleNumber).padStart(3, "0")}</span>
                          <span className={`text-[9px] px-1 py-0.5 rounded ${rule.confidence === "HIGH" ? "text-emerald-400 bg-emerald-500/10" : rule.confidence === "MEDIUM" ? "text-amber-400 bg-amber-500/10" : "text-red-400 bg-red-500/10"}`}>
                            {rule.confidence}
                          </span>
                        </div>
                        <p className="text-[11px] leading-relaxed">{rule.description}</p>
                      </div>
                      <div className="text-right text-[9px] text-muted-foreground space-y-0.5">
                        <div>Legacy: {rule.legacyStatus}</div>
                        <div>MOD: {rule.modStatus}</div>
                      </div>
                    </div>
                    {rule.sourceFile && (
                      <div className="mt-1 flex items-center gap-1 text-[9px] text-muted-foreground">
                        <ExternalLink className="size-2.5" />
                        <span className="font-mono">{rule.sourceFile}</span>
                        {rule.lineStart > 0 && <span>L{rule.lineStart}–{rule.lineEnd}</span>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 7. Missing Information */}
          {liveExplanation.missingInformation.length > 0 && (
            <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3">
              <h4 className="text-[11px] font-medium text-amber-400 mb-2 flex items-center gap-1.5">
                <HelpCircle className="size-3.5" /> Information Needed ({liveExplanation.missingInformation.length})
              </h4>
              <div className="space-y-2">
                {liveExplanation.missingInformation.map((mi) => (
                  <div key={mi.id} className="rounded-md bg-card/50 border border-border p-2.5">
                    <p className="text-[11px] font-medium mb-0.5">{mi.whatIsNeeded}</p>
                    <p className="text-[10px] text-muted-foreground mb-1">{mi.whyNeeded}</p>
                    <div className="flex items-center gap-1 text-[9px] text-primary">
                      <Lightbulb className="size-2.5" />
                      {mi.suggestedAction}
                    </div>
                    {mi.suggestedQuery && (
                      <pre className="mt-1.5 rounded bg-muted/50 p-1.5 text-[9px] font-mono text-muted-foreground whitespace-pre-wrap">{mi.suggestedQuery}</pre>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* User Action Buttons */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
            <Button
              size="sm" variant="outline"
              className="text-[10px] gap-1.5"
              onClick={() => setShowDevQuestion(!showDevQuestion)}
            >
              <MessageCircleQuestion className="size-3" />
              What Should I Ask Development?
            </Button>
            <Button
              size="sm" variant="outline"
              className="text-[10px] gap-1.5"
              onClick={handleCopyQuestion}
            >
              {copiedQuestion ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
              {copiedQuestion ? "Copied!" : "Copy Question"}
            </Button>
            <Button
              size="sm" variant="outline"
              className="text-[10px] gap-1.5"
              onClick={() => setViewMode("technical")}
            >
              <Code2 className="size-3" />
              View Technical Evidence
            </Button>
          </div>

          {/* Expandable Dev Question */}
          {showDevQuestion && (
            <div className="rounded-md border border-primary/20 bg-primary/5 p-3">
              <h4 className="text-[11px] font-medium mb-2">Suggested Question for Development</h4>
              <pre className="whitespace-pre-wrap text-[11px] text-muted-foreground leading-relaxed font-sans">
                {generateDevQuestion(finding, liveExplanation)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Technical View */}
      {viewMode === "technical" && (
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Code2 className="size-3.5" />
            <span>Technical evidence and code references</span>
            <Button size="sm" variant="ghost" className="ml-auto text-[10px] gap-1" onClick={() => setViewMode("business")}>
              <BookOpen className="size-3" /> Switch to Business View
            </Button>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">{finding.description}</p>

          {/* Evidence */}
          <div className="grid gap-3 sm:grid-cols-2">
            {finding.legacyEvidence.length > 0 && (
              <div>
                <h4 className="mb-1.5 text-[11px] font-medium text-orange-400">Legacy Evidence</h4>
                <div className="space-y-1">
                  {finding.legacyEvidence.map((ev, i) => (
                    <div key={i} className="rounded-md bg-muted/30 border border-border p-2 text-[11px]">
                      <div className="flex items-center gap-2 mb-1">
                        <ExternalLink className="size-3 text-muted-foreground" />
                        <span className="font-mono text-muted-foreground">{ev.fileName}</span>
                        {ev.lineStart > 0 && <span className="text-muted-foreground">L{ev.lineStart}–{ev.lineEnd}</span>}
                      </div>
                      <pre className="whitespace-pre-wrap font-mono text-[10px] text-muted-foreground/80">{ev.snippet}</pre>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {finding.modEvidence.length > 0 && (
              <div>
                <h4 className="mb-1.5 text-[11px] font-medium text-blue-400">MOD Evidence</h4>
                <div className="space-y-1">
                  {finding.modEvidence.map((ev, i) => (
                    <div key={i} className="rounded-md bg-muted/30 border border-border p-2 text-[11px]">
                      <div className="flex items-center gap-2 mb-1">
                        <ExternalLink className="size-3 text-muted-foreground" />
                        <span className="font-mono text-muted-foreground">{ev.fileName}</span>
                        {ev.lineStart > 0 && <span className="text-muted-foreground">L{ev.lineStart}–{ev.lineEnd}</span>}
                      </div>
                      <pre className="whitespace-pre-wrap font-mono text-[10px] text-muted-foreground/80">{ev.snippet}</pre>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {finding.modEvidence.length === 0 && (
            <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3 text-xs">
              <div className="flex items-center gap-1.5 text-amber-400 font-medium mb-1">
                <AlertTriangle className="size-3" />
                No MOD evidence found
              </div>
              <p className="text-muted-foreground">
                The MOD implementation does not appear to contain equivalent components for this finding.
              </p>
            </div>
          )}

          {finding.informationNeeded && (
            <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3 text-xs">
              <div className="flex items-center gap-1.5 mb-1 text-amber-400 font-medium">
                <AlertTriangle className="size-3" /> Information Needed
              </div>
              <p className="text-muted-foreground">{finding.informationNeeded}</p>
            </div>
          )}

          {finding.developerComment && (
            <div className="rounded-md bg-muted/30 border border-border p-3 text-xs">
              <span className="text-muted-foreground">Developer comment:</span> {finding.developerComment}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Section Component ─────────────────────────────────────────

function Section({ number, title, icon, children }: { number: string; title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <h4 className="text-[11px] font-medium mb-2 flex items-center gap-1.5">
        <span className="inline-flex items-center justify-center size-4 rounded-full bg-muted text-[9px] font-bold">{number}</span>
        {icon}
        {title}
      </h4>
      {children}
    </div>
  );
}

// ── Functionalities Tab ───────────────────────────────────────

function FunctionalitiesTab({ functionalities, selectedFuncId, onSelectFunc, onSwitchToFindings }: {
  functionalities: Functionality[];
  selectedFuncId: string | null;
  onSelectFunc: (id: string | null) => void;
  onSwitchToFindings: () => void;
}) {
  return (
    <div className="space-y-3">
      {functionalities.map((func) => (
        <div
          key={func.id}
          className={`rounded-md border bg-card p-4 transition-colors cursor-pointer ${
            selectedFuncId === func.id ? "border-primary" : "border-border hover:border-muted-foreground/30"
          }`}
          onClick={() => onSelectFunc(selectedFuncId === func.id ? null : func.id)}
        >
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-sm font-medium">{func.name}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">{func.description}</p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge
                label={func.status.replace(/_/g, " ")}
                variant={func.status === "UNMAPPED_LEGACY" ? "error" : func.status === "CONFIRMED" ? "success" : "info"}
              />
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${func.confidence === "HIGH" ? "text-emerald-400 bg-emerald-500/10" : func.confidence === "MEDIUM" ? "text-amber-400 bg-amber-500/10" : "text-red-400 bg-red-500/10"}`}>
                {func.confidence}
              </span>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-4 text-[11px] text-muted-foreground">
            <span>Legacy: {func.legacyComponentIds.length} components</span>
            <span>MOD: {func.modComponentIds.length} components</span>
            <span className="italic">{func.clusteringReason}</span>
          </div>
          {selectedFuncId === func.id && (
            <div className="mt-3 pt-3 border-t border-border">
              <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); onSwitchToFindings(); }} className="text-xs gap-1.5">
                <ChevronRight className="size-3" /> View Findings for this Functionality
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Mappings Tab ──────────────────────────────────────────────

function MappingsTab({ mappings }: { mappings: Array<{ id: string; functionalityId: string; mappingType: string; legacyComponentIds: string[]; modComponentIds: string[]; reason: string; confidence: string }> }) {
  return (
    <div className="space-y-3">
      {mappings.map((mapping) => (
        <div key={mapping.id} className="rounded-md border border-border bg-card p-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <StatusBadge label={mapping.mappingType.replace(/_/g, " ")} variant="info" />
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${mapping.confidence === "HIGH" ? "text-emerald-400 bg-emerald-500/10" : mapping.confidence === "MEDIUM" ? "text-amber-400 bg-amber-500/10" : "text-red-400 bg-red-500/10"}`}>
                  {mapping.confidence}
                </span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{mapping.reason}</p>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>Legacy: {mapping.legacyComponentIds.length} components</span>
            <ArrowRight className="size-3" />
            <span>MOD: {mapping.modComponentIds.length} components</span>
          </div>
        </div>
      ))}
      {mappings.length === 0 && (
        <div className="rounded-md border border-border bg-card p-8 text-center text-xs text-muted-foreground">No component mappings were discovered.</div>
      )}
    </div>
  );
}

// ── Info Requests Tab ─────────────────────────────────────────

function InfoRequestsTab({ requests, onAnswer, onDismiss }: {
  requests: InformationRequest[];
  onAnswer: (reqId: string, answer: string) => Promise<void>;
  onDismiss: (reqId: string) => Promise<void>;
}) {
  const [answerText, setAnswerText] = useState<Record<string, string>>({});

  return (
    <div className="space-y-3">
      {requests.map((req) => (
        <div
          key={req.id}
          className={`rounded-md border bg-card p-4 ${
            req.status === "PENDING" ? "border-amber-500/30" : req.status === "PROVIDED" ? "border-emerald-500/30" : "border-border"
          }`}
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <StatusBadge label={req.type.replace(/_/g, " ")} variant="warning" />
                <StatusBadge label={req.status} variant={req.status === "PENDING" ? "warning" : "info"} />
              </div>
              <h3 className="mt-2 text-sm font-medium">{req.title}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">{req.description}</p>
            </div>
          </div>
          <div className="mt-3 rounded-md bg-muted/30 border border-border p-3 text-xs">
            <span className="text-muted-foreground">What is needed:</span> {req.whatIsNeeded}
          </div>
          <div className="mt-2 rounded-md bg-muted/30 border border-border p-3 text-xs">
            <span className="text-muted-foreground">Why:</span> {req.reason}
          </div>
          {req.suggestedQuery && (
            <div className="mt-2 rounded-md bg-muted/30 border border-border p-3 text-xs">
              <span className="text-muted-foreground block mb-1">Suggested query:</span>
              <pre className="whitespace-pre-wrap font-mono text-[10px]">{req.suggestedQuery}</pre>
            </div>
          )}
          {req.status === "PENDING" && (
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                placeholder="Enter your answer..."
                value={answerText[req.id] || ""}
                onChange={(e) => setAnswerText((prev) => ({ ...prev, [req.id]: e.target.value }))}
                className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <Button size="sm" disabled={!answerText[req.id]} onClick={async () => {
                if (answerText[req.id]) {
                  await onAnswer(req.id, answerText[req.id]);
                  setAnswerText((prev) => { const next = { ...prev }; delete next[req.id]; return next; });
                }
              }}>Submit</Button>
              <Button size="sm" variant="outline" onClick={() => onDismiss(req.id)}>Dismiss</Button>
            </div>
          )}
          {req.status === "PROVIDED" && req.answer && (
            <div className="mt-3 rounded-md bg-emerald-500/5 border border-emerald-500/20 p-3 text-xs">
              <span className="text-emerald-400 font-medium">Answer:</span> {req.answer}
            </div>
          )}
        </div>
      ))}
      {requests.length === 0 && (
        <div className="rounded-md border border-border bg-card p-8 text-center text-xs text-muted-foreground">No information requests were generated.</div>
      )}
    </div>
  );
}
