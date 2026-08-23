import { useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { AppLayout, PageHeader } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge, getStatusVariant } from "@/components/ui/status-badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import {
  Upload, Loader2, Trash2, CheckCircle2, Clock, Info,
} from "lucide-react";
import type { Id } from "../convex/_generated/dataModel";
import { analyzeFile } from "@/lib/analyzers";

function detectLanguage(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    java: "Java", sql: "SQL", pls: "PL/SQL", pks: "PL/SQL Package Spec",
    pkb: "PL/SQL Package Body", sh: "Shell", xml: "XML", properties: "Properties",
    json: "JSON", txt: "Text",
  };
  return map[ext] || ext.toUpperCase() || "Unknown";
}
function getFileType(fileName: string): string { return fileName.split(".").pop()?.toLowerCase() || "unknown"; }
async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function runAnalysis(content: string, fileName: string): string | undefined {
  const result = analyzeFile(content, fileName);
  return result ? JSON.stringify(result) : undefined;
}
async function extractZip(file: File) {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(file);
  const files: Array<{ name: string; path: string; content: string; size: number }> = [];
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir || path.includes("..") || path.startsWith("/")) continue;
    const content = await entry.async("string");
    files.push({ name: path.split("/").pop() || path, path, content, size: content.length });
  }
  return files;
}
type UploadResult = { result: "new" | "new_version" | "duplicate"; fileName: string };

export default function UploadSource() {
  const { projectId } = useParams<{ projectId: string }>();
  const pid = projectId as Id<"projects">;
  const navigate = useNavigate();
  const projectFiles = useQuery(api.sourceFiles.listByProject, { projectId: pid });
  const stats = useQuery(api.sourceFiles.getStats, { projectId: pid });
  const batches = useQuery(api.sourceFiles.listBatches, { projectId: pid });
  const createBatch = useMutation(api.sourceFiles.createBatch);
  const updateBatch = useMutation(api.sourceFiles.updateBatchStatus);
  const addFileMut = useMutation(api.sourceFiles.addFile);
  const removeFile = useMutation(api.sourceFiles.remove);
  const [sourceType, setSourceType] = useState<"LEGACY" | "MOD">("LEGACY");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [uploadResults, setUploadResults] = useState<UploadResult[] | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [filter, setFilter] = useState<"ALL" | "LEGACY" | "MOD">("ALL");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(async (fileList: FileList) => {
    setUploading(true); setUploadResults(null); setUploadProgress("Creating upload batch...");
    try {
      const batchId = await createBatch({
        projectId: pid, sourceType,
        originName: fileList.length === 1 ? fileList[0].name : `${fileList.length} files`,
        originType: Array.from(fileList).some((f) => f.name.toLowerCase().endsWith(".zip")) ? "ZIP" : "FILES",
        uploadedBy: "current-user",
      });
      setUploadProgress("Processing files...");
      const results: UploadResult[] = [];
      for (const file of Array.from(fileList)) {
        if (file.name.toLowerCase().endsWith(".zip")) {
          setUploadProgress(`Extracting ${file.name}...`);
          try {
            const zipFiles = await extractZip(file);
            setUploadProgress(`Processing ${zipFiles.length} files...`);
            for (const zf of zipFiles) {
              try {
                const hash = await sha256(zf.content);
                const r = await addFileMut({ projectId: pid, uploadBatchId: batchId, fileName: zf.name, filePath: zf.path, fileType: getFileType(zf.name), sourceType, size: zf.size, sha256: hash, language: detectLanguage(zf.name), content: zf.content, lineCount: zf.content.split("\n").length, analysisResult: runAnalysis(zf.content, zf.name) });
                results.push({ result: r.result, fileName: zf.name });
              } catch { results.push({ result: "new", fileName: zf.name }); }
            }
          } catch { results.push({ result: "new", fileName: file.name }); }
        } else {
          try {
            const content = await file.text();
            const hash = await sha256(content);
            const r = await addFileMut({ projectId: pid, uploadBatchId: batchId, fileName: file.name, filePath: file.name, fileType: getFileType(file.name), sourceType, size: file.size, sha256: hash, language: detectLanguage(file.name), content, lineCount: content.split("\n").length, analysisResult: runAnalysis(content, file.name) });
            results.push({ result: r.result, fileName: file.name });
          } catch { results.push({ result: "new", fileName: file.name }); }
        }
      }
      const nc = results.filter((r) => r.result === "new").length;
      const dc = results.filter((r) => r.result === "duplicate").length;
      const vc = results.filter((r) => r.result === "new_version").length;
      await updateBatch({ batchId, status: "COMPLETED", fileCount: results.length, newFiles: nc, duplicateSkipped: dc, modifiedVersions: vc, errors: 0 });
      setUploadResults(results);
    } finally {
      setUploading(false); setUploadProgress("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (zipInputRef.current) zipInputRef.current.value = "";
    }
  }, [createBatch, addFileMut, updateBatch, pid, sourceType]);

  const allFiles = projectFiles || [];
  const activeFiles = allFiles.filter((f) => !f.superseded);
  const displayFiles = filter === "ALL" ? activeFiles : activeFiles.filter((f) => f.sourceType === filter);
  const legacyFiles = activeFiles.filter((f) => f.sourceType === "LEGACY");
  const modFiles = activeFiles.filter((f) => f.sourceType === "MOD");
  const fmtSize = (s: number) => s < 1024 ? `${s} B` : s < 1048576 ? `${(s / 1024).toFixed(1)} KB` : `${(s / 1048576).toFixed(1)} MB`;

  const columns: Column<Record<string, unknown>>[] = [
    { key: "fileName", label: "File", sortable: true },
    { key: "filePath", label: "Path", sortable: true, render: (row) => <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[200px] block">{row.filePath as string}</span> },
    { key: "language", label: "Type", sortable: true },
    { key: "sourceType", label: "Source", sortable: true },
    { key: "version", label: "Ver", sortable: true, width: "50px", align: "right", render: (row) => <span className="font-mono text-[10px]">v{row.version as number}</span> },
    { key: "size", label: "Size", sortable: true, align: "right", render: (row) => fmtSize(row.size as number) },
    { key: "status", label: "Status", render: (row) => <StatusBadge label={row.status as string} variant={getStatusVariant(row.status as string)} /> },
    { key: "_id", label: "", width: "40px", render: (row) => (
      <button onClick={(e) => { e.stopPropagation(); if (confirm(`Remove ${row.fileName}?`)) removeFile({ id: row._id as Id<"sourceFiles"> }); }}
        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"><Trash2 className="size-3" /></button>
    )},
  ];

  return (
    <AppLayout>
      <PageHeader title="Upload Source" description="Upload legacy or modernized source files. Existing files will NOT be deleted when adding new files."
        breadcrumbs={[{ label: "Dashboard", path: "/app" }, { label: "Projects", path: "/app" }, { label: "Upload Source" }]} />
      <div className="p-8">
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Uploading as:</span>
            <div className="flex rounded-md border border-border overflow-hidden">
              {([{ value: "LEGACY" as const, label: "Legacy" }, { value: "MOD" as const, label: "Modernized" }]).map(({ value, label }) => (
                <button key={value} onClick={() => setSourceType(value)}
                  className={`px-3 py-1 text-xs font-medium transition-colors ${sourceType === value ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground"}`}
                >{label}</button>
              ))}
            </div>
          </div>
          <div className="flex items-start gap-2 rounded-md border border-emerald-600/30 bg-emerald-600/5 px-4 py-3">
            <Info className="size-4 text-emerald-600 mt-0.5 shrink-0" />
            <div className="text-xs text-emerald-700">
              <p className="font-medium">Additive Upload</p>
              <p className="text-emerald-600/80 mt-0.5">Uploading additional files adds them to your existing source inventory. Previously uploaded files are never deleted. Duplicates are detected and skipped. Modified files create new versions.</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border p-8 text-center cursor-pointer hover:border-muted-foreground/30 transition-colors">
              <Upload className="mb-2 size-6 text-muted-foreground" strokeWidth={1.5} />
              <p className="text-xs font-medium">Upload Individual Files</p>
              <p className="mt-1 text-[11px] text-muted-foreground">Multiple files supported</p>
              <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => e.target.files && handleFiles(e.target.files)} />
            </div>
            <div onClick={() => zipInputRef.current?.click()} className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border p-8 text-center cursor-pointer hover:border-muted-foreground/30 transition-colors">
              <Upload className="mb-2 size-6 text-muted-foreground" strokeWidth={1.5} />
              <p className="text-xs font-medium">Upload ZIP Archive</p>
              <p className="mt-1 text-[11px] text-muted-foreground">Supports .zip with source files</p>
              <input ref={zipInputRef} type="file" accept=".zip" className="hidden" onChange={(e) => e.target.files && handleFiles(e.target.files)} />
            </div>
          </div>
          {uploading && <div className="flex items-center gap-2 rounded-md border border-border bg-card px-4 py-3"><Loader2 className="size-4 animate-spin text-muted-foreground" /><span className="text-xs">{uploadProgress || "Uploading..."}</span></div>}
          {uploadResults && uploadResults.length > 0 && (
            <Card className="border-emerald-600/30"><CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2"><CheckCircle2 className="size-4 text-emerald-600" /><span className="text-xs font-medium">Upload Complete</span></div>
              <div className="flex items-center gap-4 text-xs">
                <span>{uploadResults.length} files discovered</span>
                <span className="text-emerald-600">{uploadResults.filter((r) => r.result === "new").length} new</span>
                <span className="text-muted-foreground">{uploadResults.filter((r) => r.result === "duplicate").length} duplicate{uploadResults.filter((r) => r.result === "duplicate").length !== 1 ? "s" : ""} (skipped)</span>
                <span className="text-amber-600">{uploadResults.filter((r) => r.result === "new_version").length} modified version{uploadResults.filter((r) => r.result === "new_version").length !== 1 ? "s" : ""}</span>
              </div>
            </CardContent></Card>
          )}
          {stats && stats.total > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Card className="border-border"><CardContent className="p-4">
                <div className="flex items-center justify-between mb-2"><h3 className="text-xs font-medium">Legacy Source</h3><span className="text-lg font-semibold">{stats.legacy}</span></div>
                <p className="text-[10px] text-muted-foreground">{stats.legacyBatches} upload batch{stats.legacyBatches !== 1 ? "es" : ""}</p>
                <div className="mt-2 flex flex-wrap gap-1">{Object.entries(stats.legacyLanguages).map(([l, c]) => <span key={l} className="rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">{l}: {c}</span>)}</div>
              </CardContent></Card>
              <Card className="border-border"><CardContent className="p-4">
                <div className="flex items-center justify-between mb-2"><h3 className="text-xs font-medium">Modernized Source</h3><span className="text-lg font-semibold">{stats.mod}</span></div>
                <p className="text-[10px] text-muted-foreground">{stats.modBatches} upload batch{stats.modBatches !== 1 ? "es" : ""}</p>
                <div className="mt-2 flex flex-wrap gap-1">{Object.entries(stats.modLanguages).map(([l, c]) => <span key={l} className="rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">{l}: {c}</span>)}</div>
              </CardContent></Card>
            </div>
          )}
          {activeFiles.length > 0 && (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-medium">Source Inventory ({activeFiles.length} files)</h2>
                <div className="flex rounded-md border border-border overflow-hidden">
                  {(["ALL", "LEGACY", "MOD"] as const).map((f) => (
                    <button key={f} onClick={() => setFilter(f)} className={`px-2.5 py-1 text-[10px] font-medium transition-colors ${filter === f ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground"}`}>
                      {f === "ALL" ? `All (${activeFiles.length})` : f === "LEGACY" ? `Legacy (${legacyFiles.length})` : `MOD (${modFiles.length})`}
                    </button>
                  ))}
                </div>
              </div>
              <DataTable columns={columns} data={displayFiles as Record<string, unknown>[]} pageSize={20} searchable searchPlaceholder="Search files..." keyExtractor={(row) => String(row._id)} onRowClick={(row) => navigate(`/app/projects/${projectId}/files/${row._id}`)} />
            </div>
          )}
          {batches && batches.length > 0 && (
            <div className="border-t border-border pt-6">
              <button onClick={() => setShowHistory(!showHistory)} className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                <Clock className="size-4" />Upload History ({batches.length} batches)<span className="text-[10px]">{showHistory ? "▲" : "▼"}</span>
              </button>
              {showHistory && <div className="mt-3 space-y-2">
                {batches.map((b) => (
                  <div key={b._id} className="rounded-md border border-border bg-card px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-medium">Batch #{b.batchNumber}</span>
                        <StatusBadge label={b.status} variant={getStatusVariant(b.status)} />
                        <span className="text-[10px] text-muted-foreground">{b.sourceType} · {b.originType}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">{new Date(b.createdAt).toLocaleString()}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-4 text-[10px] text-muted-foreground">
                      <span>Source: {b.originName}</span><span>{b.fileCount} files</span>
                      <span className="text-emerald-600">{b.newFiles} new</span>
                      {b.duplicateSkipped > 0 && <span>{b.duplicateSkipped} duplicate</span>}
                      {b.modifiedVersions > 0 && <span className="text-amber-600">{b.modifiedVersions} modified</span>}
                    </div>
                  </div>
                ))}
              </div>}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
