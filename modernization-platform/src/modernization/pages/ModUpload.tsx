/**
 * Upload Source — additive multi-batch file upload.
 * Files are never deleted when new ones are added.
 * ZIP extraction happens entirely in the browser.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router";
import { useModStore, genId } from "../context";
import { processZipFile, processMultipleFiles } from "../lib/fileProcessor";
import type { UploadProgress } from "../lib/fileProcessor";
import { AlertTriangle, Check, Info, Upload } from "lucide-react";

export default function ModUpload() {
  const { projectId } = useParams<{ projectId: string }>();
  const { state, dispatch, getProjectFiles } = useModStore();
  const [sourceType, setSourceType] = useState<"LEGACY" | "MOD">("LEGACY");
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [result, setResult] = useState<{ newFiles: number; dupes: number; modified: number; errors: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const legacyInputRef = useRef<HTMLInputElement>(null);
  const modInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (projectId) dispatch({ type: "SET_CURRENT_PROJECT", projectId });
  }, [projectId, dispatch]);

  const project = state.projects.find((p) => p.id === projectId);

  const existingFiles = useMemo(
    () => (project ? getProjectFiles(project.id) : []),
    [project, getProjectFiles],
  );

  const legacyCount = useMemo(
    () => (project ? getProjectFiles(project.id, "LEGACY").length : 0),
    [project, getProjectFiles],
  );
  const modCount = useMemo(
    () => (project ? getProjectFiles(project.id, "MOD").length : 0),
    [project, getProjectFiles],
  );
  const batchCount = useMemo(
    () => (project ? Object.values(state.uploadBatches).filter((b) => b.projectId === project.id).length : 0),
    [project, state.uploadBatches],
  );

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputFiles = e.target.files;
    if (!inputFiles || inputFiles.length === 0 || !project) return;
    setError(null);
    setResult(null);

    // Create batch
    const batchId = genId();
    const batch = {
      id: batchId,
      projectId: project.id,
      sourceType,
      batchNumber: batchCount + 1,
      originName: inputFiles.length === 1 ? inputFiles[0].name : `${inputFiles.length} files`,
      originType: "FILES" as const, fileCount: inputFiles.length,
      newFiles: 0,
      duplicateSkipped: 0,
      modifiedVersions: 0,
      errors: 0,
      status: "UPLOADING" as const,
      createdAt: Date.now(),
    };
    dispatch({ type: "ADD_UPLOAD_BATCH", batch });

    try {
      const isZip = inputFiles.length === 1 && inputFiles[0].name.toLowerCase().endsWith(".zip");

      let processedFiles;
      if (isZip) {
        const zipResult = await processZipFile(
          inputFiles[0],
          project.id,
          sourceType,
          batchId,
          existingFiles,
          setProgress,
        );
        processedFiles = zipResult.files;
      } else {
        processedFiles = await processMultipleFiles(
          Array.from(inputFiles),
          project.id,
          sourceType,
          batchId,
          existingFiles,
          setProgress,
        );
      }

      let newCount = 0;
      let dupeCount = 0;
      let modCount2 = 0;
      let errCount = 0;

      for (const pf of processedFiles) {
        if (pf.isNew) {
          dispatch({ type: "ADD_SOURCE_FILES", files: [pf.sourceFile] });
          if (pf.isModified) modCount2++;
          else newCount++;
        } else if (pf.isDuplicate) {
          dupeCount++;
        } else {
          errCount++;
        }
      }

      dispatch({
        type: "UPDATE_UPLOAD_BATCH",
        batchId,
        updates: {
          newFiles: newCount,
          duplicateSkipped: dupeCount,
          modifiedVersions: modCount2,
          errors: errCount,
          status: "COMPLETED",
        },
      });

      setResult({ newFiles: newCount, dupes: dupeCount, modified: modCount2, errors: errCount });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      dispatch({ type: "UPDATE_UPLOAD_BATCH", batchId, updates: { status: "ERROR" } });
    }

    setProgress(null);
    // Reset the input
    if (legacyInputRef.current) legacyInputRef.current.value = "";
    if (modInputRef.current) modInputRef.current.value = "";
  }, [project, sourceType, batchCount, existingFiles, dispatch]);

  if (!project) return <div className="flex items-center justify-center h-64 text-xs text-muted-foreground">Project not found.</div>;

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-8">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Upload Source</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Add source files incrementally. Existing files are never removed.
        </p>
      </div>

      {/* Additive Notice */}
      <div className="flex items-center gap-2 rounded-lg border border-green-500/20 bg-green-500/5 px-3 py-2 text-[11px] text-green-400">
        <Info className="size-3.5 shrink-0" />
        Files are added incrementally. Previously uploaded files will not be deleted.
      </div>

      {/* Source Type Toggle */}
      <div>
        <p className="text-xs font-medium mb-2">Uploading as:</p>
        <div className="flex gap-1">
          {(["LEGACY", "MOD"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setSourceType(t)}
              className={`px-3 py-1.5 rounded text-[10px] font-medium transition-colors ${
                sourceType === t ? "bg-foreground text-background" : "border border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {t === "LEGACY" ? "Legacy" : "Modernized"}
            </button>
          ))}
        </div>
      </div>

      {/* Upload Area */}
      <div className="rounded-lg border border-border bg-card p-6 space-y-4">
        <p className="text-xs font-medium">Add More Source Files</p>
        <div className="flex gap-3">
          <label className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[11px] font-medium text-foreground hover:bg-muted cursor-pointer transition-colors">
            <Upload className="size-3" />
            Upload Individual Files
            <input
              ref={sourceType === "LEGACY" ? legacyInputRef : modInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleUpload}
            />
          </label>
        </div>
      </div>

      {/* Progress */}
      {progress && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">{progress.message}</span>
            {progress.total > 0 && (
              <span className="text-muted-foreground">{progress.processed}/{progress.total}</span>
            )}
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-foreground transition-all"
              style={{ width: progress.total > 0 ? `${(progress.processed / progress.total) * 100}%` : "50%" }}
            />
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-green-400">
            <Check className="size-3.5" />
            Upload Complete
          </div>
          <div className="flex gap-4 text-[11px] text-muted-foreground">
            <span>New: {result.newFiles}</span>
            <span>Duplicates skipped: {result.dupes}</span>
            {result.modified > 0 && <span>Modified versions: {result.modified}</span>}
            {result.errors > 0 && <span className="text-red-400">Errors: {result.errors}</span>}
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2.5 text-[11px] text-red-400">
          <AlertTriangle className="size-3.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Source Inventory Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-[10px] text-muted-foreground">Legacy Source</p>
          <p className="text-lg font-semibold">{legacyCount}</p>
          <p className="text-[10px] text-muted-foreground">files</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-[10px] text-muted-foreground">Modernized Source</p>
          <p className="text-lg font-semibold">{modCount}</p>
          <p className="text-[10px] text-muted-foreground">files</p>
        </div>
      </div>

      {/* Upload History */}
      {batchCount > 0 && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <p className="text-xs font-medium">Upload History</p>
          {Object.values(state.uploadBatches)
            .filter((b) => b.projectId === project.id)
            .sort((a, b) => b.createdAt - a.createdAt)
            .map((batch) => (
              <div key={batch.id} className="flex items-center justify-between text-[11px] border-b border-border/50 pb-2 last:border-0 last:pb-0">
                <div>
                  <span className="font-medium">{batch.originName}</span>
                  <span className="text-muted-foreground ml-2">
                    Batch #{batch.batchNumber} · {batch.fileCount} files
                  </span>
                </div>
                <span className={`px-1.5 py-0.5 rounded text-[9px] ${
                  batch.status === "COMPLETED" ? "bg-green-500/10 text-green-400" :
                  batch.status === "ERROR" ? "bg-red-500/10 text-red-400" :
                  "bg-muted text-muted-foreground"
                }`}>
                  {batch.status}
                </span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
