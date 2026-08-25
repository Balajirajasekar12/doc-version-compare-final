// ============================================================
// MIP Upload Page - File upload with drag-drop, ZIP extraction
// ============================================================

import React, { useCallback, useState, useRef } from "react";
import { useMip } from "../context";
import { Upload as UploadIcon, FileText, Archive, Trash2, CheckCircle2, AlertCircle, Loader2, Zap, FolderArchive } from "lucide-react";
import { toast } from "sonner";

export default function MipUploadPage() {
  const { state, currentProject, uploadFiles, analyzeProject } = useMip();
  const [dragOver, setDragOver] = useState<"legacy" | "modern" | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const legacyRef = useRef<HTMLInputElement>(null);
  const modernRef = useRef<HTMLInputElement>(null);

  const legacyFiles = state.sourceFiles.filter(f => f.side === "legacy");
  const modernFiles = state.sourceFiles.filter(f => f.side === "modern");

  const handleDrop = useCallback(async (e: React.DragEvent, side: "legacy" | "modern") => {
    e.preventDefault();
    setDragOver(null);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) await uploadFiles(files, side);
  }, [uploadFiles]);

  const handleFileInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>, side: "legacy" | "modern") => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) await uploadFiles(files, side);
    e.target.value = "";
  }, [uploadFiles]);

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      await analyzeProject();
      toast.success("Analysis complete", { description: `Analyzed ${state.sourceFiles.length} source files.` });
    } catch (err) {
      toast.error("Analysis failed", { description: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setAnalyzing(false);
    }
  };

  if (!currentProject) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center">
          <FolderArchive size={40} className="mx-auto text-slate-600" />
          <h2 className="mt-3 text-sm font-medium text-slate-400">No project selected</h2>
          <p className="mt-1 text-xs text-slate-600">Create or select a project first.</p>
        </div>
      </div>
    );
  }

  const FileZone = ({ side, files, ref }: { side: "legacy" | "modern"; files: typeof legacyFiles; ref: React.RefObject<HTMLInputElement | null> }) => {
    const label = side === "legacy" ? currentProject.legacyLabel : currentProject.modernLabel;
    const isOver = dragOver === side;

    return (
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(side); }}
        onDragLeave={() => setDragOver(null)}
        onDrop={(e) => handleDrop(e, side)}
        className={`rounded-xl border-2 border-dashed p-6 transition-all ${
          isOver ? "border-cyan-500 bg-cyan-500/5" : "border-white/10 bg-white/[0.01]"
        }`}
      >
        <input ref={ref} type="file" multiple className="hidden" onChange={(e) => handleFileInput(e, side)} />

        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white">{label} Artifacts</h3>
            <p className="mt-0.5 text-xs text-slate-500">{files.length} files uploaded</p>
          </div>
          <button onClick={() => ref.current?.click()} className="flex items-center gap-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 px-3 py-1.5 text-xs text-cyan-300 hover:bg-cyan-500/20">
            <UploadIcon size={12} /> Upload Files
          </button>
        </div>

        {files.length === 0 ? (
          <div className="mt-6 flex flex-col items-center py-8">
            <Archive size={28} className="text-slate-600" />
            <p className="mt-2 text-xs text-slate-500">Drag & drop files or ZIP archives here</p>
            <p className="mt-0.5 text-[10px] text-slate-600">All file types accepted — PDF, DOCX, XLSX, RTF, ZIP, COBOL, and more</p>
          </div>
        ) : (
          <div className="mt-4 max-h-60 space-y-1 overflow-y-auto">
            {files.map((f) => (
              <div key={f.id} className="flex items-center gap-2 rounded-lg bg-white/[0.02] px-3 py-1.5">
                <FileText size={12} className="shrink-0 text-slate-500" />
                <span className="min-w-0 flex-1 truncate text-xs text-slate-300">{f.name}</span>
                <span className="shrink-0 text-[10px] text-slate-600">{f.language}</span>
                <span className={`shrink-0 text-[10px] ${f.status === "analyzed" ? "text-emerald-400" : f.status === "error" ? "text-red-400" : "text-slate-500"}`}>
                  {f.status === "analyzed" ? <CheckCircle2 size={10} /> : f.status === "error" ? <AlertCircle size={10} /> : f.status === "analyzing" ? <Loader2 size={10} className="animate-spin" /> : "Ready"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold text-white">
            <UploadIcon size={18} className="text-cyan-400" />
            Upload Source Artifacts
          </h1>
          <p className="mt-1 text-sm text-slate-400">Upload legacy and modernized source files. ZIP archives are extracted automatically.</p>
        </div>
        <button
          onClick={handleAnalyze}
          disabled={state.sourceFiles.length === 0 || analyzing}
          className="flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-[#07090d] hover:bg-cyan-400 disabled:opacity-50"
        >
          {analyzing ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
          {analyzing ? "Analyzing..." : "Analyze All Files"}
        </button>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <FileZone side="legacy" files={legacyFiles} ref={legacyRef} />
        <FileZone side="modern" files={modernFiles} ref={modernRef} />
      </div>

      {/* Summary */}
      {state.sourceFiles.length > 0 && (
        <div className="mt-6 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <h3 className="text-xs font-semibold text-slate-300">Upload Summary</h3>
          <div className="mt-2 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
            <div><span className="text-slate-500">Total files:</span> <span className="font-medium text-white">{state.sourceFiles.length}</span></div>
            <div><span className="text-slate-500">Legacy:</span> <span className="font-medium text-amber-300">{legacyFiles.length}</span></div>
            <div><span className="text-slate-500">Modern:</span> <span className="font-medium text-cyan-300">{modernFiles.length}</span></div>
            <div><span className="text-slate-500">Analyzed:</span> <span className="font-medium text-emerald-300">{state.sourceFiles.filter(f => f.status === "analyzed").length}</span></div>
          </div>
        </div>
      )}
    </div>
  );
}
