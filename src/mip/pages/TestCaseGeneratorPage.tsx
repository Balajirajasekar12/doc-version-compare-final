// ============================================================
// Requirement → Test Case Generator — Main Page (Redesigned)
// Business-flow-first, risk-based, E2E test design engine.
// ============================================================

import React, { useState, useCallback, useRef } from "react";
import {
  Upload,
  FileText,
  FileImage,
  Database,
  Layers,
  Loader2,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Pencil,
  RotateCcw,
  Download,
  FileSpreadsheet,
  FileDown,
  ChevronDown,
  ChevronUp,
  Search,
  CheckSquare,
  Square,
  ArrowRight,
  Sparkles,
  BarChart3,
  Shield,
  Target,
  GitBranch,
} from "lucide-react";
import type {
  TcgDocument,
  DocumentCategory,
  ExtractedKnowledge,
  GeneratedTestCase,
  TcgProgress,
  TcgPhase,
  TestCaseGenType,
  TestPriority,
  TcgGenerationSummary,
  BusinessFlow,
  MissingInformation,
  SourceConflict,
  TechnicalEntity,
} from "../tcg/types";
import { parseDocument } from "../tcg/parsers";
import { analyzeAll, buildSources } from "../tcg/analyzer";
import { generateTestCases } from "../tcg/generator";
import { exportToXlsx, exportToPdf, exportToCsv } from "../tcg/exporter";
import {
  copyPromptToClipboard,
  parseSidekickResponse,
  mergeAiEnhancedCases,
  callSidekickDirectApi,
  isDirectApiAvailable,
  setSidekickApiConfig,
  getSidekickApiConfig,
  type SidekickApiConfig,
} from "../tcg/genai-provider";

// ============================================================
// Helpers
// ============================================================
let docIdCounter = 0;
function genDocId(): string {
  return `tcgdoc_${Date.now()}_${++docIdCounter}`;
}

const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  requirement: "Requirement",
  design: "Design",
  database: "Database / SQL",
  architecture_image: "Architecture / Diagram",
  source_code: "Source Code",
  other: "Other Reference",
};

const CATEGORY_ICONS: Record<DocumentCategory, React.FC<{ size?: number; className?: string }>> = {
  requirement: FileText,
  design: Layers,
  database: Database,
  architecture_image: FileImage,
  source_code: FileText,
  other: FileText,
};

const ACCEPTED_EXTENSIONS = ".docx,.pdf,.md,.txt,.sql,.jpg,.jpeg,.png,.java,.xml,.sh,.json,.yaml,.yml,.plsql";

function detectCategory(file: File): DocumentCategory {
  const name = file.name.toLowerCase();
  const ext = name.split(".").pop() || "";
  if (ext === "sql" || ext === "plsql") return "database";
  if (["jpg", "jpeg", "png"].includes(ext)) return "architecture_image";
  if (["java", "xml", "sh", "json", "yaml", "yml"].includes(ext)) return "source_code";
  if (/req|requirement|spec|user.?story|brd|prd|functional/i.test(name)) return "requirement";
  if (/design|arch|diagram|flow|wireframe|ui|ux/i.test(name)) return "design";
  if (["docx", "pdf", "md", "txt"].includes(ext)) return "requirement";
  return "other";
}

const PRIORITY_COLORS: Record<TestPriority, string> = {
  P0: "bg-red-500/10 text-red-400 border-red-500/30",
  P1: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  P2: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  P3: "bg-slate-500/10 text-slate-400 border-slate-500/30",
};

// ============================================================
// Main Component
// ============================================================
export default function TestCaseGeneratorPage() {
  const [phase, setPhase] = useState<TcgPhase>("upload");
  const [documents, setDocuments] = useState<TcgDocument[]>([]);
  const [knowledge, setKnowledge] = useState<ExtractedKnowledge[]>([]);
  const [testCases, setTestCases] = useState<GeneratedTestCase[]>([]);
  const [summary, setSummary] = useState<TcgGenerationSummary | null>(null);
  const [flows, setFlows] = useState<BusinessFlow[]>([]);
  const [missingInfo, setMissingInfo] = useState<MissingInformation[]>([]);
  const [sourceConflicts, setSourceConflicts] = useState<SourceConflict[]>([]);
  const [techEntities, setTechEntities] = useState<TechnicalEntity[]>([]);
  const [progress, setProgress] = useState<TcgProgress>({
    phase: "upload", currentStep: "", progress: 0, totalFiles: 0, processedFiles: 0,
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterFlow, setFilterFlow] = useState<string>("all");
  const [expandedCase, setExpandedCase] = useState<string | null>(null);
  const [editingCase, setEditingCase] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<GeneratedTestCase>>({});
  const [selectedCases, setSelectedCases] = useState<Set<string>>(new Set());
  const [showFinalized, setShowFinalized] = useState(false);
  const [showSidekickSettings, setShowSidekickSettings] = useState(false);
  const [showImportPanel, setShowImportPanel] = useState(false);
  const [sidekickEndpoint, setSidekickEndpoint] = useState(() => getSidekickApiConfig()?.endpoint || "");
  const [sidekickApiKey, setSidekickApiKey] = useState(() => getSidekickApiConfig()?.apiKey || "");
  const [sidekickModel, setSidekickModel] = useState(() => getSidekickApiConfig()?.model || "");
  const [sidekickApiStatus, setSidekickApiStatus] = useState<"idle" | "calling" | "success" | "error">("idle");
  const [sidekickApiError, setSidekickApiError] = useState("");
  const [clipboardStatus, setClipboardStatus] = useState<"idle" | "copied" | "error">("idle");
  const [importText, setImportText] = useState("");
  const [importResult, setImportResult] = useState<"" | "success" | "partial" | "error">("");
  const [importMessage, setImportMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importTextRef = useRef<HTMLTextAreaElement>(null);

  // --- File Upload ---
  const handleFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    const newDocs: TcgDocument[] = Array.from(files).map(file => {
      const ext = "." + (file.name.split(".").pop()?.toLowerCase() || "");
      return {
        id: genDocId(), name: file.name, size: file.size, extension: ext,
        category: detectCategory(file), rawFile: file, parsedContent: null, status: "pending",
      };
    });
    setDocuments(prev => [...prev, ...newDocs]);
  }, []);

  const updateDocCategory = useCallback((docId: string, category: DocumentCategory) => {
    setDocuments(prev => prev.map(d => d.id === docId ? { ...d, category } : d));
  }, []);

  const removeDocument = useCallback((docId: string) => {
    setDocuments(prev => prev.filter(d => d.id !== docId));
  }, []);

  // --- Parse & Analyze (full pipeline) ---
  const handleStartAnalysis = useCallback(async () => {
    if (documents.length === 0) return;
    setPhase("parsing");
    setProgress({ phase: "parsing", currentStep: "Reading files...", progress: 0, totalFiles: documents.length, processedFiles: 0 });

    const updatedDocs = [...documents];

    // Phase 1: Parse all files
    for (let i = 0; i < updatedDocs.length; i++) {
      const doc = updatedDocs[i];
      setProgress(prev => ({ ...prev, currentStep: `Parsing ${doc.name}...`, progress: Math.round(((i + 0.5) / updatedDocs.length) * 40), processedFiles: i }));
      try {
        doc.status = "parsing";
        doc.parsedContent = await parseDocument(doc);
        doc.status = "parsed";
      } catch (err) {
        doc.status = "error";
        doc.parseError = err instanceof Error ? err.message : "Failed to parse";
      }
      updatedDocs[i] = { ...doc };
      setDocuments([...updatedDocs]);
    }

    // Phase 2: Full source-aware analysis
    setPhase("analyzing");
    setProgress(prev => ({ ...prev, phase: "analyzing", currentStep: "Extracting technical entities and knowledge...", progress: 35 }));
    await new Promise(r => setTimeout(r, 200));

    setProgress(prev => ({ ...prev, currentStep: "Reconciling sources and detecting conflicts...", progress: 45 }));
    await new Promise(r => setTimeout(r, 200));

    setProgress(prev => ({ ...prev, currentStep: "Analyzing missing information...", progress: 55 }));
    await new Promise(r => setTimeout(r, 200));

    const analysisResult = analyzeAll(updatedDocs);
    setKnowledge(analysisResult.knowledge);
    setMissingInfo(analysisResult.missingInformation);
    setSourceConflicts(analysisResult.sourceConflicts);
    setTechEntities(analysisResult.technicalEntities);

    // Phase 3: Generate (full pipeline with source traceability)
    setProgress(prev => ({ ...prev, phase: "generating", currentStep: "Identifying business flows and designing E2E test cases...", progress: 70 }));
    await new Promise(r => setTimeout(r, 300));

    setProgress(prev => ({ ...prev, currentStep: "Building test cases from source evidence...", progress: 80 }));
    await new Promise(r => setTimeout(r, 200));

    setProgress(prev => ({ ...prev, currentStep: "Validating completeness and coverage...", progress: 90 }));
    await new Promise(r => setTimeout(r, 200));

    const result = generateTestCases(analysisResult.knowledge, updatedDocs, {
      requirements: analysisResult.requirements,
      flows: analysisResult.flows,
      missingInformation: analysisResult.missingInformation,
      technicalEntities: analysisResult.technicalEntities,
      knownTables: analysisResult.knownTables,
    });
    setTestCases(result.cases);
    setSummary(result.summary);
    setFlows(result.flows);

    setProgress(prev => ({ ...prev, progress: 100, currentStep: "Complete!", processedFiles: updatedDocs.length }));
    await new Promise(r => setTimeout(r, 500));
    setPhase("review");
  }, [documents]);

  // --- Review Actions ---
  const toggleCaseStatus = useCallback((caseId: string, status: "kept" | "ignored") => {
    setTestCases(prev => prev.map(tc => tc.id === caseId ? { ...tc, status } : tc));
  }, []);

  const restoreCase = useCallback((caseId: string) => {
    setTestCases(prev => prev.map(tc => tc.id === caseId ? { ...tc, status: "kept", editedFields: undefined } : tc));
  }, []);

  const startEditing = useCallback((caseId: string) => {
    const tc = testCases.find(t => t.id === caseId);
    if (!tc) return;
    setEditingCase(caseId);
    setEditData({
      description: tc.description, steps: tc.steps, precondition: tc.precondition,
      query: tc.query, expectedResults: tc.expectedResults, types: [...tc.types],
      priority: tc.priority, businessFlow: tc.businessFlow,
    });
  }, [testCases]);

  const saveEdit = useCallback(() => {
    if (!editingCase) return;
    setTestCases(prev => prev.map(tc => {
      if (tc.id !== editingCase) return tc;
      return {
        ...tc, status: "edited",
        editedFields: {
          description: editData.description, steps: editData.steps, precondition: editData.precondition,
          query: editData.query, expectedResults: editData.expectedResults, types: editData.types,
          priority: editData.priority, businessFlow: editData.businessFlow,
        },
      };
    }));
    setEditingCase(null);
    setEditData({});
  }, [editingCase, editData]);

  const cancelEdit = useCallback(() => { setEditingCase(null); setEditData({}); }, []);

  // --- Selection ---
  const toggleSelect = useCallback((caseId: string) => {
    setSelectedCases(prev => { const next = new Set(prev); if (next.has(caseId)) next.delete(caseId); else next.add(caseId); return next; });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedCases(new Set(filteredCases.filter(tc => tc.status !== "ignored").map(tc => tc.id)));
  }, [testCases, searchQuery, filterType, filterPriority, filterFlow]);

  const deselectAll = useCallback(() => setSelectedCases(new Set()), []);

  // --- Export (exclude ignored) ---
  const handleExportXlsx = useCallback(async () => {
    const casesToExport = selectedCases.size > 0 ? testCases.filter(tc => selectedCases.has(tc.id)) : testCases;
    await exportToXlsx(casesToExport);
  }, [testCases, selectedCases]);

  const handleExportPdf = useCallback(async () => {
    const casesToExport = selectedCases.size > 0 ? testCases.filter(tc => selectedCases.has(tc.id)) : testCases;
    await exportToPdf(casesToExport);
  }, [testCases, selectedCases]);

  const handleExportCsv = useCallback(() => {
    const casesToExport = selectedCases.size > 0 ? testCases.filter(tc => selectedCases.has(tc.id)) : testCases;
    exportToCsv(casesToExport);
  }, [testCases, selectedCases]);

  // --- Sidekick Integration: Copy Prompt ---
  const handleCopySidekickPrompt = useCallback(async () => {
    const result = await copyPromptToClipboard(testCases, knowledge, summary!);
    if (result.success) {
      setClipboardStatus("copied");
      setTimeout(() => setClipboardStatus("idle"), 3000);
    } else {
      setClipboardStatus("error");
      setTimeout(() => setClipboardStatus("idle"), 3000);
    }
  }, [testCases, knowledge, summary]);

  // --- Sidekick Integration: Direct API Call ---
  const handleDirectApiCall = useCallback(async () => {
    if (!sidekickEndpoint || !sidekickApiKey) return;
    setSidekickApiStatus("calling");
    setSidekickApiError("");

    // Save config to memory
    setSidekickApiConfig({ endpoint: sidekickEndpoint, apiKey: sidekickApiKey, model: sidekickModel || undefined });

    const result = await callSidekickDirectApi(testCases, knowledge, summary!);
    if (result.success) {
      // Parse the response
      const parsed = parseSidekickResponse(result.response);
      const mergeResult = mergeAiEnhancedCases(testCases, parsed.enhancedCases);
      if (mergeResult.added.length > 0) {
        setTestCases((prev) => [...prev, ...mergeResult.added]);
        setSidekickApiStatus("success");
        setImportMessage(`Added ${mergeResult.added.length} AI-enhanced test cases. ${mergeResult.duplicatesSkipped} duplicates skipped.`);
        setImportResult("success");
        // Update summary counts
        setSummary((prev) => prev ? { ...prev, finalTestCases: prev.finalTestCases + mergeResult.added.length } : prev);
      } else {
        setSidekickApiStatus("error");
        setSidekickApiError("No new test cases extracted from AI response. Try the manual copy-paste approach.");
      }
    } else {
      setSidekickApiStatus("error");
      setSidekickApiError(result.error || "API call failed");
    }
  }, [sidekickEndpoint, sidekickApiKey, sidekickModel, testCases, knowledge, summary]);

  // --- Sidekick Integration: Save API Settings ---
  const handleSaveApiSettings = useCallback(() => {
    if (sidekickEndpoint && sidekickApiKey) {
      setSidekickApiConfig({ endpoint: sidekickEndpoint, apiKey: sidekickApiKey, model: sidekickModel || undefined });
    } else {
      setSidekickApiConfig(null);
    }
  }, [sidekickEndpoint, sidekickApiKey, sidekickModel]);

  // --- Sidekick Integration: Import Pasted Response ---
  const handleImportResponse = useCallback(() => {
    if (!importText.trim()) return;
    const parsed = parseSidekickResponse(importText);
    if (parsed.enhancedCases.length === 0) {
      setImportResult("error");
      setImportMessage("Could not parse any test cases from the pasted response. Make sure you pasted the full Sidekick output.");
      return;
    }
    const mergeResult = mergeAiEnhancedCases(testCases, parsed.enhancedCases);
    if (mergeResult.added.length > 0) {
      setTestCases((prev) => [...prev, ...mergeResult.added]);
      setImportResult("success");
      setImportMessage(`Added ${mergeResult.added.length} AI-enhanced test cases. ${mergeResult.duplicatesSkipped} duplicates skipped.${parsed.newEdgeCases.length > 0 ? ` ${parsed.newEdgeCases.length} new edge cases suggested.` : ""}`);
      setSummary((prev) => prev ? { ...prev, finalTestCases: prev.finalTestCases + mergeResult.added.length } : prev);
    } else {
      setImportResult("partial");
      setImportMessage(`Parsed ${parsed.enhancedCases.length} test case(s), but all matched existing cases (${mergeResult.duplicatesSkipped} duplicates). No new cases added.`);
    }
  }, [importText, testCases]);

  const handleFinalize = useCallback(() => setShowFinalized(true), []);

  const handleReset = useCallback(() => {
    setDocuments([]); setKnowledge([]); setTestCases([]); setSummary(null); setFlows([]); setMissingInfo([]); setSourceConflicts([]); setTechEntities([]);
    setPhase("upload"); setSelectedCases(new Set()); setShowFinalized(false);
    setExpandedCase(null); setEditingCase(null);
  }, []);

  // --- Filtered Cases ---
  const filteredCases = testCases.filter(tc => {
    if (filterPriority !== "all" && tc.priority !== filterPriority) return false;
    if (filterFlow !== "all" && tc.businessFlow !== filterFlow) return false;
    if (filterType !== "all") {
      if (filterType === "ignored" && tc.status !== "ignored") return false;
      if (filterType === "kept" && tc.status === "ignored") return false;
      if (filterType === "edited" && tc.status !== "edited") return false;
      if (["Functional", "Regression", "Negative", "Positive"].includes(filterType)) {
        if (!tc.types.includes(filterType as TestCaseGenType)) return false;
      }
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const effective = tc.status === "edited" && tc.editedFields ? { ...tc, ...tc.editedFields } : tc;
      const searchable = `${tc.caseNumber} ${effective.description} ${effective.steps} ${effective.expectedResults} ${effective.query} ${tc.businessFlow} ${tc.requirementIds.join(" ")}`.toLowerCase();
      if (!searchable.includes(q)) return false;
    }
    return true;
  });

  const stats = {
    total: testCases.length,
    kept: testCases.filter(tc => tc.status === "kept").length,
    edited: testCases.filter(tc => tc.status === "edited").length,
    ignored: testCases.filter(tc => tc.status === "ignored").length,
  };

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Requirement → Test Case Generator</h1>
          <p className="text-sm text-slate-400 mt-1">
            Business-flow-first, risk-based E2E test design engine. All processing stays in your browser.
          </p>
        </div>
        {phase !== "upload" && (
          <button onClick={handleReset} className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-slate-300 hover:bg-white/[0.07]">
            <XCircle size={13} /> Start Over
          </button>
        )}
      </div>

      {/* Progress Bar */}
      {(phase === "parsing" || phase === "analyzing" || phase === "generating") && (
        <div className="rounded-xl border border-white/[0.06] bg-[#0c1118] p-4">
          <div className="flex items-center gap-3 mb-3">
            <Loader2 size={16} className="animate-spin text-cyan-400" />
            <span className="text-sm text-slate-300">{progress.currentStep}</span>
            <span className="ml-auto text-xs text-slate-500">{progress.processedFiles}/{progress.totalFiles} files</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-500" style={{ width: `${progress.progress}%` }} />
          </div>
        </div>
      )}

      {/* ====================== UPLOAD PHASE ====================== */}
      {phase === "upload" && (
        <div className="flex flex-col gap-6">
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleFiles(e.dataTransfer.files); }}
            className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-white/10 bg-[#0a0e14]/50 p-12 cursor-pointer hover:border-cyan-500/30 hover:bg-cyan-500/[0.02] transition-colors"
          >
            <Upload size={32} className="text-slate-500 mb-3" />
            <p className="text-sm font-medium text-slate-300">Drop requirement, design, SQL, or architecture files here</p>
            <p className="text-xs text-slate-500 mt-1">Supports: .docx, .pdf, .md, .txt, .sql, .jpg, .jpeg, .png</p>
            <p className="text-[10px] text-slate-600 mt-3">Files never leave your browser. All processing is local.</p>
          </div>
          <input ref={fileInputRef} type="file" multiple accept={ACCEPTED_EXTENSIONS} className="hidden" onChange={(e) => handleFiles(e.target.files)} />

          {documents.length > 0 && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-300">Uploaded Documents ({documents.length})</h3>
                <button onClick={handleStartAnalysis} disabled={documents.length === 0}
                  className="flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-50">
                  <Sparkles size={14} /> Analyze & Generate Test Cases <ArrowRight size={14} />
                </button>
              </div>
              {documents.map(doc => {
                const Icon = CATEGORY_ICONS[doc.category];
                return (
                  <div key={doc.id} className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-[#0c1118] p-3">
                    <Icon size={16} className="text-slate-400 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-slate-200 truncate">{doc.name}</div>
                      <div className="text-[10px] text-slate-500">{(doc.size / 1024).toFixed(1)} KB · {doc.extension}</div>
                    </div>
                    <select value={doc.category} onChange={(e) => updateDocCategory(doc.id, e.target.value as DocumentCategory)}
                      className="rounded border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] text-slate-300 outline-none">
                      {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                    <button onClick={() => removeDocument(doc.id)} className="text-slate-500 hover:text-red-400 transition-colors"><XCircle size={14} /></button>
                  </div>
                );
              })}
            </div>
          )}

          {documents.length === 0 && (
            <div className="rounded-xl border border-white/[0.06] bg-[#0c1118] p-5">
              <h3 className="text-sm font-semibold text-slate-300 mb-3">How it works</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[
                  { icon: Upload, title: "Upload", desc: "Add requirement docs, design docs, SQL files, or architecture diagrams" },
                  { icon: Database, title: "Analyze", desc: "Engine extracts requirements, business rules, flows, and database schema" },
                  { icon: Target, title: "Design", desc: "Identifies business flows, optimizes scenarios, assigns P0–P3 priority" },
                  { icon: Download, title: "Export", desc: "Review, edit, finalize, and export to Excel or PDF" },
                ].map(item => (
                  <div key={item.title} className="flex flex-col gap-2">
                    <item.icon size={18} className="text-cyan-400" />
                    <div className="text-xs font-medium text-slate-300">{item.title}</div>
                    <div className="text-[11px] text-slate-500 leading-relaxed">{item.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ====================== REVIEW PHASE ====================== */}
      {(phase === "review" || showFinalized) && (
        <div className="flex flex-col gap-4">
          {/* === GENERATION SUMMARY === */}
          {summary && (
            <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.03] p-5">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 size={16} className="text-cyan-400" />
                <h3 className="text-sm font-semibold text-white">Test Case Generation Summary</h3>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                <SummaryStat label="Business Flows" value={summary.businessFlows} icon={GitBranch} />
                <SummaryStat label="Requirements" value={`${summary.coveredRequirements}/${summary.totalRequirements}`} icon={Target} sub={`${summary.requirementCoverage}% coverage`} />
                <SummaryStat label="Final Test Cases" value={summary.finalTestCases} icon={CheckCircle2} />
                <SummaryStat label="P0 Critical" value={summary.p0Count} icon={Shield} color="text-red-400" />
                <SummaryStat label="P1 High" value={summary.p1Count} icon={Shield} color="text-amber-400" />
                <SummaryStat label="P2 Medium" value={summary.p2Count} icon={Shield} color="text-blue-400" />
                <SummaryStat label="P3 Low" value={summary.p3Count} icon={Shield} color="text-slate-400" />
                <SummaryStat label="DB Validation" value={summary.dbValidationCases} icon={Database} />
                <SummaryStat label="Optimized From" value={summary.candidateScenarios} sub={`${summary.duplicatesRemoved} removed`} />
                <SummaryStat label="Complete" value={summary.completeTestCases} icon={CheckCircle2} color="text-emerald-400" />
                <SummaryStat label="Incomplete" value={summary.incompleteTestCases} icon={AlertCircle} color="text-amber-400" />
                <SummaryStat label="Missing Info" value={summary.technicalEntitiesMissing} icon={AlertCircle} color="text-amber-400" />
              </div>
              {summary.flowNames.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span className="text-[10px] text-slate-500">Flows:</span>
                  {summary.flowNames.map(name => (
                    <span key={name} className="rounded bg-white/[0.04] border border-white/[0.06] px-2 py-0.5 text-[10px] text-slate-400">{name}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* === MISSING INFORMATION === */}
          {missingInfo.length > 0 && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.03] p-5">
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle size={16} className="text-amber-400" />
                <h3 className="text-sm font-semibold text-white">⚠️ Additional Information Required ({missingInfo.length} items)</h3>
              </div>
              <p className="text-[11px] text-slate-400 mb-3">
                Some technical entities are referenced in source material but detailed definitions were not found. Test cases are marked INCOMPLETE where affected.
              </p>
              <div className="flex flex-col gap-2">
                {missingInfo.map(mi => (
                  <div key={mi.id} className="flex items-start gap-3 rounded-lg border border-white/[0.04] bg-black/10 p-3">
                    <span className="text-amber-400 mt-0.5">🟡</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-white">{mi.entityName}</span>
                        <span className="rounded bg-white/[0.04] px-1.5 py-0.5 text-[9px] text-slate-400">{mi.entityKind}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1">{mi.reason}</div>
                      <div className="text-[10px] text-slate-500 mt-1">Required for: {mi.requiredFor}</div>
                      <div className="text-[10px] text-slate-500">Source: {mi.sourceRef}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* === SOURCE CONFLICTS === */}
          {sourceConflicts.length > 0 && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/[0.03] p-5">
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle size={16} className="text-red-400" />
                <h3 className="text-sm font-semibold text-white">⚠️ Source Conflicts Detected ({sourceConflicts.length})</h3>
              </div>
              <div className="flex flex-col gap-2">
                {sourceConflicts.map(conflict => (
                  <div key={conflict.id} className="rounded-lg border border-white/[0.04] bg-black/10 p-3">
                    <div className="text-xs font-medium text-white">{conflict.entityName}</div>
                    <div className="text-[11px] text-slate-400 mt-1">{conflict.description}</div>
                    <div className="text-[10px] text-slate-500 mt-1">Conflicting values: {conflict.conflictingValues.join(", ")}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* === SIDEKICK INTEGRATION === */}
          <div className="rounded-xl border border-purple-500/20 bg-purple-500/[0.03] p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-purple-400" />
                <h3 className="text-sm font-semibold text-white">Sidekick AI Integration</h3>
                {isDirectApiAvailable() && <span className="rounded bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.5 text-[9px] text-emerald-400">API Connected</span>}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowSidekickSettings(!showSidekickSettings)}
                  className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] text-slate-300 hover:bg-white/[0.07]">
                  ⚙️ API Settings
                </button>
                <button onClick={() => setShowImportPanel(!showImportPanel)}
                  className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] text-slate-300 hover:bg-white/[0.07]">
                  📋 Import Response
                </button>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 mb-4 leading-relaxed">
              Enhance your test cases with Sidekick AI. Choose one of two approaches:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Approach 1: Copy Prompt → Sidekick → Paste Response */}
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="rounded bg-purple-500/10 px-2 py-0.5 text-[10px] font-medium text-purple-300">Approach 1</span>
                  <span className="text-[10px] text-slate-400">Manual Copy-Paste</span>
                </div>
                <p className="text-[11px] text-slate-400 mb-3 leading-relaxed">
                  Copy a structured prompt with all test cases → paste into Sidekick → paste Sidekick's response back.
                  Works even when Sidekick has CORS restrictions.
                </p>
                <div className="flex items-center gap-2">
                  <button onClick={handleCopySidekickPrompt} disabled={testCases.length === 0}
                    className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-2 text-xs font-medium text-white hover:bg-purple-500 disabled:opacity-50">
                    {clipboardStatus === "copied" ? "✅ Copied!" : "📋 Copy Prompt to Clipboard"}
                  </button>
                  {clipboardStatus === "copied" && <span className="text-[10px] text-emerald-400">Now paste into Sidekick chat</span>}
                  {clipboardStatus === "error" && <span className="text-[10px] text-red-400">Copy failed — try again</span>}
                </div>
                <div className="mt-2 text-[10px] text-slate-500">
                  Steps: 1) Click Copy → 2) Open Sidekick → 3) Paste & Send → 4) Copy Sidekick response → 5) Click "Import Response" above
                </div>
              </div>

              {/* Approach 2: Direct API Call */}
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="rounded bg-cyan-500/10 px-2 py-0.5 text-[10px] font-medium text-cyan-300">Approach 2</span>
                  <span className="text-[10px] text-slate-400">Direct API Call</span>
                </div>
                <p className="text-[11px] text-slate-400 mb-3 leading-relaxed">
                  Automatically sends test cases to Sidekick API and merges the response. Requires API endpoint + key from DevTools network inspection.
                </p>
                {isDirectApiAvailable() ? (
                  <div className="flex items-center gap-2">
                    <button onClick={handleDirectApiCall} disabled={sidekickApiStatus === "calling"}
                      className="flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-2 text-xs font-medium text-white hover:bg-cyan-500 disabled:opacity-50">
                      {sidekickApiStatus === "calling" ? "⏳ Calling Sidekick..." : "🚀 Call Sidekick API"}
                    </button>
                    {sidekickApiStatus === "success" && <span className="text-[10px] text-emerald-400">✅ {importMessage}</span>}
                  </div>
                ) : (
                  <div>
                    <p className="text-[10px] text-amber-400 mb-2">
                      ⚠️ Not configured. Click "⚙️ API Settings" to add your Sidekick endpoint and API key.
                    </p>
                    <p className="text-[10px] text-slate-500">
                      To find these: Open Sidekick in browser → F12 → Network tab → send a message → inspect the XHR request URL and Authorization header.
                    </p>
                  </div>
                )}
                {sidekickApiError && (
                  <div className="mt-2 rounded-lg border border-red-500/20 bg-red-500/5 p-2">
                    <p className="text-[10px] text-red-300">{sidekickApiError}</p>
                    <p className="text-[10px] text-slate-500 mt-1">Try Approach 1 (manual copy-paste) instead.</p>
                  </div>
                )}
              </div>
            </div>

            {/* API Settings Panel (collapsible) */}
            {showSidekickSettings && (
              <div className="mt-4 rounded-lg border border-white/[0.06] bg-black/20 p-4">
                <h4 className="text-xs font-semibold text-white mb-3">Sidekick API Settings</h4>
                <p className="text-[10px] text-slate-500 mb-3">
                  To find these values: Open Sidekick → F12 DevTools → Network tab → send a chat message → inspect the XHR request.
                  Copy the request URL as the Endpoint and the Authorization header value as the API Key.
                </p>
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">API Endpoint URL</label>
                    <input type="text" value={sidekickEndpoint} onChange={(e) => setSidekickEndpoint(e.target.value)}
                      placeholder="https://genai.highmark.cloud/sidekick/api/v1/chat/completions"
                      className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-200 font-mono outline-none focus:border-cyan-500/30 placeholder:text-slate-600" />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">API Key / Bearer Token</label>
                    <input type="password" value={sidekickApiKey} onChange={(e) => setSidekickApiKey(e.target.value)}
                      placeholder="sk-... or Bearer token from Network tab"
                      className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-200 font-mono outline-none focus:border-cyan-500/30 placeholder:text-slate-600" />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Model (optional)</label>
                    <input type="text" value={sidekickModel} onChange={(e) => setSidekickModel(e.target.value)}
                      placeholder="e.g. gpt-4, claude-3-sonnet"
                      className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-200 outline-none focus:border-cyan-500/30 placeholder:text-slate-600" />
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <button onClick={handleSaveApiSettings}
                    className="flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-1.5 text-xs text-white hover:bg-cyan-500">
                    Save Settings (Memory Only)
                  </button>
                  <span className="text-[10px] text-slate-500">Stored in browser memory only. Not saved to disk.</span>
                </div>
              </div>
            )}

            {/* Import Response Panel (collapsible) */}
            {showImportPanel && (
              <div className="mt-4 rounded-lg border border-white/[0.06] bg-black/20 p-4">
                <h4 className="text-xs font-semibold text-white mb-2">Import Sidekick Response</h4>
                <p className="text-[10px] text-slate-500 mb-3">
                  Paste the Sidekick AI response here. The parser will extract enhanced test cases and merge them with your existing set.
                </p>
                <textarea ref={importTextRef} value={importText} onChange={(e) => setImportText(e.target.value)}
                  placeholder="Paste Sidekick's response here..."
                  rows={10}
                  className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-200 font-mono outline-none focus:border-cyan-500/30 placeholder:text-slate-600 resize-y" />
                <div className="flex items-center gap-2 mt-3">
                  <button onClick={handleImportResponse} disabled={!importText.trim()}
                    className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-2 text-xs font-medium text-white hover:bg-purple-500 disabled:opacity-50">
                    📥 Parse & Import Test Cases
                  </button>
                  {importResult === "success" && <span className="text-[10px] text-emerald-400">✅ {importMessage}</span>}
                  {importResult === "partial" && <span className="text-[10px] text-amber-400">⚠️ {importMessage}</span>}
                  {importResult === "error" && <span className="text-[10px] text-red-400">❌ {importMessage}</span>}
                </div>
              </div>
            )}
          </div>

          {/* Stats Bar */}
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.06] bg-[#0c1118] p-4">
            <div className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-1.5">
              <span className="text-lg font-bold text-white">{stats.total}</span>
              <span className="text-xs text-slate-400">Total</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-1.5">
              <CheckCircle2 size={13} className="text-emerald-400" />
              <span className="text-sm font-medium text-emerald-300">{stats.kept + stats.edited}</span>
              <span className="text-xs text-slate-400">Active</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-1.5">
              <Pencil size={13} className="text-amber-400" />
              <span className="text-sm font-medium text-amber-300">{stats.edited}</span>
              <span className="text-xs text-slate-400">Edited</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-1.5">
              <XCircle size={13} className="text-red-400" />
              <span className="text-sm font-medium text-red-300">{stats.ignored}</span>
              <span className="text-xs text-slate-400">Ignored</span>
            </div>
          </div>

          {/* Search + Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search test cases, flows, requirements..."
                className="w-full rounded-lg border border-white/10 bg-white/[0.03] pl-9 pr-3 py-2 text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-cyan-500/30" />
            </div>
            <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-300 outline-none">
              <option value="all">All Priorities</option>
              <option value="P0">P0 Critical</option>
              <option value="P1">P1 High</option>
              <option value="P2">P2 Medium</option>
              <option value="P3">P3 Low</option>
            </select>
            <select value={filterFlow} onChange={(e) => setFilterFlow(e.target.value)}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-300 outline-none">
              <option value="all">All Flows</option>
              {flows.map(f => <option key={f.id} value={f.name}>{f.name}</option>)}
            </select>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-300 outline-none">
              <option value="all">All Types</option>
              <option value="kept">Active Only</option>
              <option value="edited">Edited Only</option>
              <option value="ignored">Ignored Only</option>
              <option value="Functional">Functional</option>
              <option value="Positive">Positive</option>
              <option value="Negative">Negative</option>
            </select>
            <button onClick={selectAll} className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] text-slate-300 hover:bg-white/[0.07]">
              <CheckSquare size={12} /> Select All
            </button>
            <button onClick={deselectAll} className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] text-slate-300 hover:bg-white/[0.07]">
              <Square size={12} /> Deselect
            </button>
          </div>

          {/* Test Cases */}
          <div className="flex flex-col gap-2">
            {filteredCases.length === 0 && (
              <div className="rounded-xl border border-white/[0.06] bg-[#0c1118] p-8 text-center">
                <p className="text-sm text-slate-400">No test cases match your filters.</p>
              </div>
            )}
            {filteredCases.map(tc => (
              <TestCaseRow key={tc.id} tc={tc} isExpanded={expandedCase === tc.id} isEditing={editingCase === tc.id}
                editData={editData} isSelected={selectedCases.has(tc.id)}
                onToggleExpand={() => setExpandedCase(expandedCase === tc.id ? null : tc.id)}
                onToggleSelect={() => toggleSelect(tc.id)}
                onToggleStatus={(s) => toggleCaseStatus(tc.id, s)}
                onRestore={() => restoreCase(tc.id)}
                onStartEdit={() => startEditing(tc.id)}
                onSaveEdit={saveEdit} onCancelEdit={cancelEdit} onEditChange={setEditData} />
            ))}
          </div>

          {/* Actions Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-[#0c1118] p-4">
            <div className="flex items-center gap-2">
              {!showFinalized ? (
                <button onClick={handleFinalize} disabled={testCases.length === 0}
                  className="flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-50">
                  <CheckCircle2 size={14} /> Finalize Test Cases
                </button>
              ) : (
                <div className="flex items-center gap-2 text-sm text-emerald-400">
                  <CheckCircle2 size={16} />
                  <span className="font-medium">Finalized</span>
                  <span className="text-xs text-slate-400">({stats.kept + stats.edited} test cases ready for export)</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleExportXlsx} disabled={testCases.filter(tc => tc.status !== "ignored").length === 0}
                className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50">
                <FileSpreadsheet size={13} /> Export Excel
              </button>
              <button onClick={handleExportPdf} disabled={testCases.filter(tc => tc.status !== "ignored").length === 0}
                className="flex items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs text-blue-300 hover:bg-blue-500/20 disabled:opacity-50">
                <FileDown size={13} /> Export PDF
              </button>
              <button onClick={handleExportCsv} disabled={testCases.filter(tc => tc.status !== "ignored").length === 0}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-300 hover:bg-white/[0.07] disabled:opacity-50">
                <Download size={13} /> Export CSV
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function SummaryStat({ label, value, icon: Icon, color, sub }: {
  label: string; value: number | string; icon?: React.FC<{ size?: number; className?: string }>;
  color?: string; sub?: string;
}) {
  return (
    <div className="rounded-lg bg-white/[0.03] border border-white/[0.04] p-3">
      <div className="flex items-center gap-1.5 mb-1">
        {Icon && <Icon size={12} className={color || "text-cyan-400"} />}
        <span className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</span>
      </div>
      <div className={`text-lg font-bold ${color || "text-white"}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-500">{sub}</div>}
    </div>
  );
}

interface TestCaseRowProps {
  tc: GeneratedTestCase; isExpanded: boolean; isEditing: boolean;
  editData: Partial<GeneratedTestCase>; isSelected: boolean;
  onToggleExpand: () => void; onToggleSelect: () => void;
  onToggleStatus: (s: "kept" | "ignored") => void; onRestore: () => void;
  onStartEdit: () => void; onSaveEdit: () => void; onCancelEdit: () => void;
  onEditChange: (data: Partial<GeneratedTestCase>) => void;
}

function TestCaseRow({ tc, isExpanded, isEditing, editData, isSelected,
  onToggleExpand, onToggleSelect, onToggleStatus, onRestore,
  onStartEdit, onSaveEdit, onCancelEdit, onEditChange }: TestCaseRowProps) {
  const effective = isEditing ? { ...tc, ...editData } : tc.status === "edited" && tc.editedFields ? { ...tc, ...tc.editedFields } : tc;
  const statusColor = tc.status === "ignored" ? "border-white/[0.03] opacity-50"
    : tc.status === "edited" ? "border-amber-500/20 bg-amber-500/[0.02]"
    : "border-white/[0.06] bg-[#0c1118]";

  return (
    <div className={`rounded-xl border ${statusColor} transition-all`}>
      <div className="flex items-center gap-3 p-3">
        <input type="checkbox" checked={isSelected} onChange={onToggleSelect} disabled={tc.status === "ignored"} className="accent-cyan-500" />
        <button onClick={onToggleExpand} className="flex items-center gap-2 min-w-0 flex-1 text-left">
          {isExpanded ? <ChevronUp size={14} className="text-slate-500 shrink-0" /> : <ChevronDown size={14} className="text-slate-500 shrink-0" />}
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${PRIORITY_COLORS[tc.priority]}`}>{tc.priority}</span>
          <span className="text-xs font-mono text-cyan-400 shrink-0">{tc.caseNumber}</span>
          <span className="text-xs text-slate-200 truncate">{effective.description}</span>
        </button>
        <div className="flex items-center gap-1 shrink-0">
          {effective.types.map(t => (
            <span key={t} className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${
              t === "Functional" ? "bg-blue-500/10 text-blue-400" :
              t === "Positive" ? "bg-emerald-500/10 text-emerald-400" :
              t === "Negative" ? "bg-red-500/10 text-red-400" :
              "bg-purple-500/10 text-purple-400"
            }`}>{t}</span>
          ))}
        </div>
        <span className="text-[10px] text-slate-500 shrink-0 max-w-[120px] truncate">{tc.businessFlow}</span>
        {tc.completeness === "INCOMPLETE" && <span className="rounded bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 text-[9px] text-amber-400 shrink-0">🟡 INCOMPLETE</span>}
        {tc.completeness === "COMPLETE" && <span className="rounded bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.5 text-[9px] text-emerald-400 shrink-0">✓ COMPLETE</span>}
        {tc.status === "ignored" && <span className="text-[10px] text-slate-500 shrink-0">Ignored</span>}
        {tc.status === "edited" && <span className="text-[10px] text-amber-400 shrink-0">Edited</span>}
      </div>

      {isExpanded && (
        <div className="border-t border-white/[0.04] p-4 flex flex-col gap-3">
          {isEditing ? (
            <div className="flex flex-col gap-3">
              <EditField label="Description" value={editData.description || ""} onChange={v => onEditChange({ ...editData, description: v })} />
              <EditField label="Steps" value={editData.steps || ""} onChange={v => onEditChange({ ...editData, steps: v })} textarea />
              <EditField label="Precondition" value={editData.precondition || ""} onChange={v => onEditChange({ ...editData, precondition: v })} />
              <EditField label="Query (SQL)" value={editData.query || ""} onChange={v => onEditChange({ ...editData, query: v })} textarea mono />
              <EditField label="Expected Results" value={editData.expectedResults || ""} onChange={v => onEditChange({ ...editData, expectedResults: v })} textarea />
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400">Priority:</span>
                  <select value={editData.priority || "P1"} onChange={e => onEditChange({ ...editData, priority: e.target.value as TestPriority })}
                    className="rounded border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] text-slate-300">
                    <option value="P0">P0 Critical</option><option value="P1">P1 High</option>
                    <option value="P2">P2 Medium</option><option value="P3">P3 Low</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400">Type:</span>
                  {(["Functional", "Positive", "Negative"] as TestCaseGenType[]).map(t => (
                    <label key={t} className="flex items-center gap-1 text-[11px] text-slate-300">
                      <input type="checkbox" checked={editData.types?.includes(t) || false}
                        onChange={(e) => {
                          const types = editData.types || [];
                          if (e.target.checked) onEditChange({ ...editData, types: [...types, t] });
                          else onEditChange({ ...editData, types: types.filter(x => x !== t) });
                        }} className="accent-cyan-500" />{t}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <button onClick={onSaveEdit} className="flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-1.5 text-xs text-white hover:bg-cyan-500">
                  <CheckCircle2 size={12} /> Save Changes
                </button>
                <button onClick={onCancelEdit} className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/[0.05]">Cancel</button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {/* Metadata row */}
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${PRIORITY_COLORS[tc.priority]}`}>{tc.priority}</span>
                <span className="rounded bg-white/[0.04] px-2 py-0.5 text-[10px] text-slate-400">{tc.businessFlow}</span>
                {tc.requirementIds.length > 0 && (
                  <span className="rounded bg-white/[0.04] px-2 py-0.5 text-[10px] text-slate-400">
                    Covers {tc.requirementIds.length} requirement(s): {tc.requirementIds.slice(0, 5).join(", ")}{tc.requirementIds.length > 5 ? "..." : ""}
                  </span>
                )}
              </div>

              <DetailSection title="Description" content={effective.description} />
              <DetailSection title="Test Steps" content={effective.steps} />
              <DetailSection title="Precondition" content={effective.precondition} />

              {effective.query && effective.query !== "N/A" && (
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">SQL Query</span>
                  <pre className="whitespace-pre-wrap break-all rounded-lg bg-black/30 border border-white/[0.04] p-3 text-[11px] font-mono text-cyan-300 leading-relaxed">{effective.query}</pre>
                </div>
              )}

              <DetailSection title="Expected Results" content={effective.expectedResults} />
              {tc.riskRationale && <DetailSection title="Risk Rationale" content={tc.riskRationale} />}
              {tc.incompleteReasons.length > 0 && (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.03] p-3">
                  <span className="text-[11px] font-medium text-amber-400">⚠️ Incomplete — Missing Information</span>
                  <div className="flex flex-col gap-1 mt-2">
                    {tc.incompleteReasons.map((reason, i) => (
                      <div key={i} className="text-[11px] text-slate-400">• {reason}</div>
                    ))}
                  </div>
                  {tc.missingEntities.length > 0 && (
                    <div className="text-[10px] text-slate-500 mt-2">
                      Missing entities: {tc.missingEntities.join(", ")}
                    </div>
                  )}
                </div>
              )}
              {tc.queryStatus === "INCOMPLETE" && (
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-amber-400">🟡 Query Pending</span>
                  <p className="text-[11px] text-slate-400">{tc.query}</p>
                  {tc.queryIncompleteReason && <p className="text-[10px] text-slate-500">{tc.queryIncompleteReason}</p>}
                </div>
              )}

              {tc.sources.length > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">Source / Traceability</span>
                  <div className="flex flex-wrap gap-1.5">
                    {tc.sources.map((s, i) => (
                      <span key={i} className="rounded bg-white/[0.04] border border-white/[0.06] px-2 py-0.5 text-[10px] text-slate-400">
                        {s.documentName} → {s.sectionRef}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 mt-2 pt-2 border-t border-white/[0.04]">
                {tc.status !== "ignored" ? (
                  <>
                    <button onClick={onStartEdit} className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] text-slate-300 hover:bg-white/[0.07]">
                      <Pencil size={11} /> Edit
                    </button>
                    <button onClick={() => onToggleStatus("ignored")} className="flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-1.5 text-[11px] text-red-300 hover:bg-red-500/10">
                      <XCircle size={11} /> Ignore
                    </button>
                  </>
                ) : (
                  <button onClick={onRestore} className="flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-1.5 text-[11px] text-emerald-300 hover:bg-emerald-500/10">
                    <RotateCcw size={11} /> Restore
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DetailSection({ title, content }: { title: string; content: string }) {
  if (!content) return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">{title}</span>
      <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">{content}</p>
    </div>
  );
}

function EditField({ label, value, onChange, textarea, mono }: {
  label: string; value: string; onChange: (v: string) => void; textarea?: boolean; mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">{label}</label>
      {textarea ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={4}
          className={`rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-200 outline-none focus:border-cyan-500/30 resize-y ${mono ? "font-mono" : ""}`} />
      ) : (
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
          className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-200 outline-none focus:border-cyan-500/30" />
      )}
    </div>
  );
}
