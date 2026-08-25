// ============================================================
// Requirement → Test Case Generator — Main Page
// Full client-side workflow: Upload → Parse → Analyze → Generate → Review → Export
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
  Eye,
  EyeOff,
  Pencil,
  RotateCcw,
  Trash2,
  Download,
  FileSpreadsheet,
  FileDown,
  ChevronDown,
  ChevronUp,
  Search,
  Filter,
  CheckSquare,
  Square,
  Info,
  ArrowRight,
  ArrowLeft,
  Sparkles,
} from "lucide-react";
import type {
  TcgDocument,
  DocumentCategory,
  ExtractedKnowledge,
  GeneratedTestCase,
  TcgProgress,
  TcgPhase,
  TestCaseGenType,
} from "../tcg/types";
import { parseDocument } from "../tcg/parsers";
import { extractKnowledge, buildSources } from "../tcg/analyzer";
import { generateTestCases } from "../tcg/generator";
import { exportToXlsx, exportToPdf, exportToCsv } from "../tcg/exporter";

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
  other: "Other Reference",
};

const CATEGORY_ICONS: Record<DocumentCategory, React.FC<{ size?: number; className?: string }>> = {
  requirement: FileText,
  design: Layers,
  database: Database,
  architecture_image: FileImage,
  other: FileText,
};

const ACCEPTED_EXTENSIONS = ".docx,.pdf,.md,.txt,.sql,.jpg,.jpeg,.png";

function detectCategory(file: File): DocumentCategory {
  const name = file.name.toLowerCase();
  const ext = name.split(".").pop() || "";

  if (ext === "sql") return "database";
  if (["jpg", "jpeg", "png"].includes(ext)) return "architecture_image";

  // Filename heuristics
  if (/req|requirement|spec|specification|user.?story|brd|prd|functional/i.test(name)) return "requirement";
  if (/design|arch|diagram|flow|wireframe|mockup|ui|ux/i.test(name)) return "design";

  // Default for text docs
  if (["docx", "pdf", "md", "txt"].includes(ext)) return "requirement";

  return "other";
}

// ============================================================
// Main Component
// ============================================================
export default function TestCaseGeneratorPage() {
  // --- State ---
  const [phase, setPhase] = useState<TcgPhase>("upload");
  const [documents, setDocuments] = useState<TcgDocument[]>([]);
  const [knowledge, setKnowledge] = useState<ExtractedKnowledge[]>([]);
  const [testCases, setTestCases] = useState<GeneratedTestCase[]>([]);
  const [progress, setProgress] = useState<TcgProgress>({
    phase: "upload",
    currentStep: "",
    progress: 0,
    totalFiles: 0,
    processedFiles: 0,
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [expandedCase, setExpandedCase] = useState<string | null>(null);
  const [editingCase, setEditingCase] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<GeneratedTestCase>>({});
  const [selectedCases, setSelectedCases] = useState<Set<string>>(new Set());
  const [showFinalized, setShowFinalized] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- File Upload ---
  const handleFiles = useCallback((files: FileList | null) => {
    if (!files) return;

    const newDocs: TcgDocument[] = Array.from(files).map(file => {
      const ext = "." + (file.name.split(".").pop()?.toLowerCase() || "");
      return {
        id: genDocId(),
        name: file.name,
        size: file.size,
        extension: ext,
        category: detectCategory(file),
        rawFile: file,
        parsedContent: null,
        status: "pending",
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

  // --- Parse & Analyze ---
  const handleStartAnalysis = useCallback(async () => {
    if (documents.length === 0) return;

    setPhase("parsing");
    setProgress({
      phase: "parsing",
      currentStep: "Reading files...",
      progress: 0,
      totalFiles: documents.length,
      processedFiles: 0,
    });

    const updatedDocs = [...documents];

    // Phase 1: Parse all files
    for (let i = 0; i < updatedDocs.length; i++) {
      const doc = updatedDocs[i];
      setProgress(prev => ({
        ...prev,
        currentStep: `Parsing ${doc.name}...`,
        progress: Math.round(((i + 0.5) / updatedDocs.length) * 40),
        processedFiles: i,
      }));

      try {
        doc.status = "parsing";
        doc.parsedContent = await parseDocument(doc);
        doc.status = "parsed";
      } catch (err) {
        doc.status = "error";
        doc.parseError = err instanceof Error ? err.message : "Failed to parse file";
        console.error(`[TCG] Parse error for ${doc.name}:`, err);
      }

      updatedDocs[i] = { ...doc };
      setDocuments([...updatedDocs]);
    }

    // Phase 2: Extract knowledge
    setPhase("analyzing");
    setProgress(prev => ({
      ...prev,
      phase: "analyzing",
      currentStep: "Analyzing requirements and extracting knowledge...",
      progress: 45,
    }));

    const extractedKnowledge = extractKnowledge(updatedDocs);
    setKnowledge(extractedKnowledge);

    // Phase 3: Generate test cases
    setProgress(prev => ({
      ...prev,
      phase: "generating",
      currentStep: "Generating test cases...",
      progress: 70,
    }));

    // Small delay for UI feedback
    await new Promise(r => setTimeout(r, 300));

    const generated = generateTestCases(extractedKnowledge, updatedDocs);
    setTestCases(generated);

    setProgress(prev => ({
      ...prev,
      progress: 100,
      currentStep: "Complete!",
      processedFiles: updatedDocs.length,
    }));

    await new Promise(r => setTimeout(r, 500));
    setPhase("review");
  }, [documents]);

  // --- Review Actions ---
  const toggleCaseStatus = useCallback((caseId: string, status: "kept" | "ignored") => {
    setTestCases(prev => prev.map(tc =>
      tc.id === caseId ? { ...tc, status } : tc
    ));
  }, []);

  const restoreCase = useCallback((caseId: string) => {
    setTestCases(prev => prev.map(tc =>
      tc.id === caseId ? { ...tc, status: "kept", editedFields: undefined } : tc
    ));
  }, []);

  const startEditing = useCallback((caseId: string) => {
    const tc = testCases.find(t => t.id === caseId);
    if (!tc) return;
    setEditingCase(caseId);
    setEditData({
      description: tc.description,
      steps: tc.steps,
      precondition: tc.precondition,
      query: tc.query,
      expectedResults: tc.expectedResults,
      types: [...tc.types],
    });
  }, [testCases]);

  const saveEdit = useCallback(() => {
    if (!editingCase) return;
    setTestCases(prev => prev.map(tc => {
      if (tc.id !== editingCase) return tc;
      return {
        ...tc,
        status: "edited",
        editedFields: {
          description: editData.description,
          steps: editData.steps,
          precondition: editData.precondition,
          query: editData.query,
          expectedResults: editData.expectedResults,
          types: editData.types,
        },
      };
    }));
    setEditingCase(null);
    setEditData({});
  }, [editingCase, editData]);

  const cancelEdit = useCallback(() => {
    setEditingCase(null);
    setEditData({});
  }, []);

  // --- Selection ---
  const toggleSelect = useCallback((caseId: string) => {
    setSelectedCases(prev => {
      const next = new Set(prev);
      if (next.has(caseId)) next.delete(caseId);
      else next.add(caseId);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    const kept = filteredCases.filter(tc => tc.status !== "ignored");
    setSelectedCases(new Set(kept.map(tc => tc.id)));
  }, [testCases, searchQuery, filterType]);

  const deselectAll = useCallback(() => {
    setSelectedCases(new Set());
  }, []);

  // --- Export ---
  const handleExportXlsx = useCallback(async () => {
    const casesToExport = selectedCases.size > 0
      ? testCases.filter(tc => selectedCases.has(tc.id))
      : testCases;
    await exportToXlsx(casesToExport);
  }, [testCases, selectedCases]);

  const handleExportPdf = useCallback(async () => {
    const casesToExport = selectedCases.size > 0
      ? testCases.filter(tc => selectedCases.has(tc.id))
      : testCases;
    await exportToPdf(casesToExport);
  }, [testCases, selectedCases]);

  const handleExportCsv = useCallback(() => {
    const casesToExport = selectedCases.size > 0
      ? testCases.filter(tc => selectedCases.has(tc.id))
      : testCases;
    exportToCsv(casesToExport);
  }, [testCases, selectedCases]);

  // --- Finalize ---
  const handleFinalize = useCallback(() => {
    setShowFinalized(true);
  }, []);

  // --- Reset ---
  const handleReset = useCallback(() => {
    setDocuments([]);
    setKnowledge([]);
    setTestCases([]);
    setPhase("upload");
    setSelectedCases(new Set());
    setShowFinalized(false);
    setExpandedCase(null);
    setEditingCase(null);
  }, []);

  // --- Filtered Cases ---
  const filteredCases = testCases.filter(tc => {
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
      const searchable = `${tc.caseNumber} ${effective.description} ${effective.steps} ${effective.expectedResults} ${effective.query}`.toLowerCase();
      if (!searchable.includes(q)) return false;
    }
    return true;
  });

  // --- Stats ---
  const stats = {
    total: testCases.length,
    kept: testCases.filter(tc => tc.status === "kept").length,
    edited: testCases.filter(tc => tc.status === "edited").length,
    ignored: testCases.filter(tc => tc.status === "ignored").length,
    functional: testCases.filter(tc => tc.types.includes("Functional")).length,
    positive: testCases.filter(tc => tc.types.includes("Positive")).length,
    negative: testCases.filter(tc => tc.types.includes("Negative")).length,
    regression: testCases.filter(tc => tc.types.includes("Regression")).length,
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
            Upload requirement and design documents to generate traceable manual test cases.
            All processing stays in your browser — nothing is uploaded.
          </p>
        </div>
        {phase !== "upload" && (
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-slate-300 hover:bg-white/[0.07]"
          >
            <XCircle size={13} /> Start Over
          </button>
        )}
      </div>

      {/* Progress Bar (during processing) */}
      {(phase === "parsing" || phase === "analyzing" || phase === "generating") && (
        <div className="rounded-xl border border-white/[0.06] bg-[#0c1118] p-4">
          <div className="flex items-center gap-3 mb-3">
            <Loader2 size={16} className="animate-spin text-cyan-400" />
            <span className="text-sm text-slate-300">{progress.currentStep}</span>
            <span className="ml-auto text-xs text-slate-500">
              {progress.processedFiles}/{progress.totalFiles} files
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-500"
              style={{ width: `${progress.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* ====================== UPLOAD PHASE ====================== */}
      {phase === "upload" && (
        <div className="flex flex-col gap-6">
          {/* Upload Zone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleFiles(e.dataTransfer.files);
            }}
            className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-white/10 bg-[#0a0e14]/50 p-12 cursor-pointer hover:border-cyan-500/30 hover:bg-cyan-500/[0.02] transition-colors"
          >
            <Upload size={32} className="text-slate-500 mb-3" />
            <p className="text-sm font-medium text-slate-300">
              Drop requirement, design, SQL, or architecture files here
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Supports: .docx, .pdf, .md, .txt, .sql, .jpg, .jpeg, .png
            </p>
            <p className="text-[10px] text-slate-600 mt-3">
              Files never leave your browser. All processing is local.
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED_EXTENSIONS}
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />

          {/* Uploaded Documents List */}
          {documents.length > 0 && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-300">
                  Uploaded Documents ({documents.length})
                </h3>
                <button
                  onClick={handleStartAnalysis}
                  disabled={documents.length === 0}
                  className="flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-50"
                >
                  <Sparkles size={14} />
                  Analyze & Generate Test Cases
                  <ArrowRight size={14} />
                </button>
              </div>

              {documents.map(doc => {
                const Icon = CATEGORY_ICONS[doc.category];
                return (
                  <div
                    key={doc.id}
                    className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-[#0c1118] p-3"
                  >
                    <Icon size={16} className="text-slate-400 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-slate-200 truncate">{doc.name}</div>
                      <div className="text-[10px] text-slate-500">
                        {(doc.size / 1024).toFixed(1)} KB · {doc.extension}
                      </div>
                    </div>

                    {/* Category Selector */}
                    <select
                      value={doc.category}
                      onChange={(e) => updateDocCategory(doc.id, e.target.value as DocumentCategory)}
                      className="rounded border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] text-slate-300 outline-none"
                    >
                      {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>

                    <button
                      onClick={() => removeDocument(doc.id)}
                      className="text-slate-500 hover:text-red-400 transition-colors"
                    >
                      <XCircle size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Info Panel */}
          {documents.length === 0 && (
            <div className="rounded-xl border border-white/[0.06] bg-[#0c1118] p-5">
              <h3 className="text-sm font-semibold text-slate-300 mb-3">How it works</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[
                  { icon: Upload, title: "Upload", desc: "Add requirement docs, design docs, SQL files, or architecture diagrams" },
                  { icon: Database, title: "Analyze", desc: "System extracts requirements, rules, validations, and database schema" },
                  { icon: FileText, title: "Generate", desc: "Deterministic engine creates traceable test cases from extracted knowledge" },
                  { icon: Download, title: "Export", desc: "Review, edit, and export finalized test cases to Excel or PDF" },
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

            <div className="ml-auto flex items-center gap-2">
              <span className="rounded bg-blue-500/10 px-2 py-0.5 text-[10px] text-blue-400">
                F:{stats.functional} +
                {stats.positive} −
                {stats.negative} ↻
                {stats.regression}
              </span>
            </div>
          </div>

          {/* Search + Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search test cases..."
                className="w-full rounded-lg border border-white/10 bg-white/[0.03] pl-9 pr-3 py-2 text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-cyan-500/30"
              />
            </div>

            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-300 outline-none"
            >
              <option value="all">All Types</option>
              <option value="kept">Active Only</option>
              <option value="edited">Edited Only</option>
              <option value="ignored">Ignored Only</option>
              <option value="Functional">Functional</option>
              <option value="Positive">Positive</option>
              <option value="Negative">Negative</option>
              <option value="Regression">Regression</option>
            </select>

            <button
              onClick={selectAll}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] text-slate-300 hover:bg-white/[0.07]"
            >
              <CheckSquare size={12} /> Select All
            </button>
            <button
              onClick={deselectAll}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] text-slate-300 hover:bg-white/[0.07]"
            >
              <Square size={12} /> Deselect
            </button>
          </div>

          {/* Test Cases Table */}
          <div className="flex flex-col gap-2">
            {filteredCases.length === 0 && (
              <div className="rounded-xl border border-white/[0.06] bg-[#0c1118] p-8 text-center">
                <p className="text-sm text-slate-400">No test cases match your filters.</p>
              </div>
            )}

            {filteredCases.map(tc => (
              <TestCaseRow
                key={tc.id}
                tc={tc}
                isExpanded={expandedCase === tc.id}
                isEditing={editingCase === tc.id}
                editData={editData}
                isSelected={selectedCases.has(tc.id)}
                onToggleExpand={() => setExpandedCase(expandedCase === tc.id ? null : tc.id)}
                onToggleSelect={() => toggleSelect(tc.id)}
                onToggleStatus={(s) => toggleCaseStatus(tc.id, s)}
                onRestore={() => restoreCase(tc.id)}
                onStartEdit={() => startEditing(tc.id)}
                onSaveEdit={saveEdit}
                onCancelEdit={cancelEdit}
                onEditChange={setEditData}
              />
            ))}
          </div>

          {/* Actions Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-[#0c1118] p-4">
            <div className="flex items-center gap-2">
              {!showFinalized ? (
                <button
                  onClick={handleFinalize}
                  disabled={testCases.length === 0}
                  className="flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-50"
                >
                  <CheckCircle2 size={14} />
                  Finalize Test Cases
                </button>
              ) : (
                <div className="flex items-center gap-2 text-sm text-emerald-400">
                  <CheckCircle2 size={16} />
                  <span className="font-medium">Finalized</span>
                  <span className="text-xs text-slate-400">
                    ({stats.kept + stats.edited} test cases ready for export)
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleExportXlsx}
                disabled={testCases.filter(tc => tc.status !== "ignored").length === 0}
                className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
              >
                <FileSpreadsheet size={13} /> Export Excel
              </button>
              <button
                onClick={handleExportPdf}
                disabled={testCases.filter(tc => tc.status !== "ignored").length === 0}
                className="flex items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs text-blue-300 hover:bg-blue-500/20 disabled:opacity-50"
              >
                <FileDown size={13} /> Export PDF
              </button>
              <button
                onClick={handleExportCsv}
                disabled={testCases.filter(tc => tc.status !== "ignored").length === 0}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-300 hover:bg-white/[0.07] disabled:opacity-50"
              >
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
// Test Case Row Component
// ============================================================
interface TestCaseRowProps {
  tc: GeneratedTestCase;
  isExpanded: boolean;
  isEditing: boolean;
  editData: Partial<GeneratedTestCase>;
  isSelected: boolean;
  onToggleExpand: () => void;
  onToggleSelect: () => void;
  onToggleStatus: (s: "kept" | "ignored") => void;
  onRestore: () => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onEditChange: (data: Partial<GeneratedTestCase>) => void;
}

function TestCaseRow({
  tc, isExpanded, isEditing, editData, isSelected,
  onToggleExpand, onToggleSelect, onToggleStatus, onRestore,
  onStartEdit, onSaveEdit, onCancelEdit, onEditChange,
}: TestCaseRowProps) {
  const effective = isEditing ? { ...tc, ...editData } : tc.status === "edited" && tc.editedFields ? { ...tc, ...tc.editedFields } : tc;

  const statusColor = tc.status === "ignored"
    ? "border-white/[0.03] opacity-50"
    : tc.status === "edited"
      ? "border-amber-500/20 bg-amber-500/[0.02]"
      : "border-white/[0.06] bg-[#0c1118]";

  return (
    <div className={`rounded-xl border ${statusColor} transition-all`}>
      {/* Summary Row */}
      <div className="flex items-center gap-3 p-3">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          disabled={tc.status === "ignored"}
          className="accent-cyan-500"
        />

        <button onClick={onToggleExpand} className="flex items-center gap-2 min-w-0 flex-1 text-left">
          {isExpanded ? <ChevronUp size={14} className="text-slate-500 shrink-0" /> : <ChevronDown size={14} className="text-slate-500 shrink-0" />}
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
            }`}>
              {t}
            </span>
          ))}
        </div>

        {tc.status === "ignored" && (
          <span className="text-[10px] text-slate-500 shrink-0">Ignored</span>
        )}
        {tc.status === "edited" && (
          <span className="text-[10px] text-amber-400 shrink-0">Edited</span>
        )}
      </div>

      {/* Expanded Detail */}
      {isExpanded && (
        <div className="border-t border-white/[0.04] p-4 flex flex-col gap-3">
          {isEditing ? (
            /* Edit Mode */
            <div className="flex flex-col gap-3">
              <EditField label="Description" value={editData.description || ""} onChange={v => onEditChange({ ...editData, description: v })} />
              <EditField label="Steps" value={editData.steps || ""} onChange={v => onEditChange({ ...editData, steps: v })} textarea />
              <EditField label="Precondition" value={editData.precondition || ""} onChange={v => onEditChange({ ...editData, precondition: v })} />
              <EditField label="Query (SQL)" value={editData.query || ""} onChange={v => onEditChange({ ...editData, query: v })} textarea mono />
              <EditField label="Expected Results" value={editData.expectedResults || ""} onChange={v => onEditChange({ ...editData, expectedResults: v })} textarea />

              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-400">Types:</span>
                {(["Functional", "Positive", "Negative", "Regression"] as TestCaseGenType[]).map(t => (
                  <label key={t} className="flex items-center gap-1 text-[11px] text-slate-300">
                    <input
                      type="checkbox"
                      checked={editData.types?.includes(t) || false}
                      onChange={(e) => {
                        const types = editData.types || [];
                        if (e.target.checked) onEditChange({ ...editData, types: [...types, t] });
                        else onEditChange({ ...editData, types: types.filter(x => x !== t) });
                      }}
                      className="accent-cyan-500"
                    />
                    {t}
                  </label>
                ))}
              </div>

              <div className="flex items-center gap-2 mt-2">
                <button onClick={onSaveEdit} className="flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-1.5 text-xs text-white hover:bg-cyan-500">
                  <CheckCircle2 size={12} /> Save Changes
                </button>
                <button onClick={onCancelEdit} className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/[0.05]">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            /* View Mode */
            <div className="flex flex-col gap-3">
              <DetailSection title="Description" content={effective.description} />
              <DetailSection title="Test Steps" content={effective.steps} />
              <DetailSection title="Precondition" content={effective.precondition} />

              {effective.query && (
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">SQL Query</span>
                  <pre className="whitespace-pre-wrap break-all rounded-lg bg-black/30 border border-white/[0.04] p-3 text-[11px] font-mono text-cyan-300 leading-relaxed">
                    {effective.query}
                  </pre>
                </div>
              )}

              <DetailSection title="Expected Results" content={effective.expectedResults} />

              {/* Traceability */}
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

              {/* Actions */}
              <div className="flex items-center gap-2 mt-2 pt-2 border-t border-white/[0.04]">
                {tc.status !== "ignored" ? (
                  <>
                    <button onClick={onStartEdit} className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] text-slate-300 hover:bg-white/[0.07]">
                      <Pencil size={11} /> Edit
                    </button>
                    <button onClick={() => onToggleStatus("ignored")} className="flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-1.5 text-[11px] text-red-300 hover:bg-red-500/10">
                      <EyeOff size={11} /> Ignore
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

// ============================================================
// Sub-components
// ============================================================
function DetailSection({ title, content }: { title: string; content: string }) {
  if (!content) return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">{title}</span>
      <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">{content}</p>
    </div>
  );
}

function EditField({
  label, value, onChange, textarea, mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  textarea?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">{label}</label>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          className={`rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-200 outline-none focus:border-cyan-500/30 resize-y ${mono ? "font-mono" : ""}`}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-200 outline-none focus:border-cyan-500/30"
        />
      )}
    </div>
  );
}
