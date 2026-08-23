/**
 * Source Inventory — browse and manage all uploaded source files.
 */

import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { useModStore } from "../context";
import { FolderOpen, Search, Trash2, Eye, X } from "lucide-react";

export default function ModInventory() {
  const { projectId } = useParams<{ projectId: string }>();
  const { state, dispatch, getProjectFiles } = useModStore();
  const [filter, setFilter] = useState<"ALL" | "LEGACY" | "MOD">("ALL");
  const [search, setSearch] = useState("");
  const [viewingFile, setViewingFile] = useState<string | null>(null);

  useEffect(() => {
    if (projectId) dispatch({ type: "SET_CURRENT_PROJECT", projectId });
  }, [projectId, dispatch]);

  const project = state.projects.find((p) => p.id === projectId);

  const allFiles = useMemo(
    () => (project ? getProjectFiles(project.id) : []),
    [project, getProjectFiles],
  );

  const filteredFiles = useMemo(() => {
    return allFiles.filter((f) => {
      if (filter !== "ALL" && f.sourceType !== filter) return false;
      if (search) {
        const q = search.toLowerCase();
        return f.fileName.toLowerCase().includes(q) || f.filePath.toLowerCase().includes(q) || f.language.toLowerCase().includes(q);
      }
      return true;
    });
  }, [allFiles, filter, search]);

  const langCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    allFiles.forEach((f) => {
      counts[f.language] = (counts[f.language] || 0) + 1;
    });
    return counts;
  }, [allFiles]);

  const viewingFileData = viewingFile ? allFiles.find((f) => f.id === viewingFile) : null;

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }

  if (!project) return <div className="flex items-center justify-center h-64 text-xs text-muted-foreground">Project not found.</div>;

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Source Inventory</h1>
        <p className="mt-1 text-xs text-muted-foreground">{allFiles.length} files across all uploads</p>
      </div>

      {/* Language Breakdown */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(langCounts).map(([lang, count]) => (
          <span key={lang} className="inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
            {lang}: {count}
          </span>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="flex gap-1">
          {(["ALL", "LEGACY", "MOD"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2.5 py-1 rounded text-[10px] font-medium transition-colors ${
                filter === f ? "bg-foreground text-background" : "border border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {f === "ALL" ? "All" : f === "LEGACY" ? "Legacy" : "MOD"}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search files..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-border bg-background pl-7 pr-3 py-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <span className="text-[10px] text-muted-foreground">{filteredFiles.length} shown</span>
      </div>

      {/* File Table */}
      {filteredFiles.length === 0 ? (
        <div className="rounded-lg border border-border border-dashed bg-card p-10 text-center">
          <FolderOpen className="mx-auto size-6 text-muted-foreground/40" />
          <p className="mt-2 text-xs text-muted-foreground">No files found.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-card border-b border-border">
                <tr className="text-[10px] font-medium text-muted-foreground">
                  <th className="px-3 py-2">File</th>
                  <th className="px-3 py-2">Path</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2">Lines</th>
                  <th className="px-3 py-2">Size</th>
                  <th className="px-3 py-2 w-20">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredFiles.map((file) => (
                  <tr key={file.id} className="border-b border-border/50 hover:bg-muted/30 text-[11px]">
                    <td className="px-3 py-1.5 font-medium truncate max-w-[200px]">{file.fileName}</td>
                    <td className="px-3 py-1.5 text-muted-foreground truncate max-w-[250px]">{file.filePath}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{file.language}</td>
                    <td className="px-3 py-1.5">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                        file.sourceType === "LEGACY" ? "bg-blue-500/10 text-blue-400" : "bg-green-500/10 text-green-400"
                      }`}>
                        {file.sourceType}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground">{file.lineCount}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{formatSize(file.size)}</td>
                    <td className="px-3 py-1.5">
                      <div className="flex gap-1">
                        <button
                          onClick={() => setViewingFile(file.id)}
                          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          title="View file"
                        >
                          <Eye className="size-3" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Remove ${file.fileName}?`)) {
                              dispatch({ type: "REMOVE_SOURCE_FILE", fileId: file.id });
                            }
                          }}
                          className="p-1 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Remove file"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* File Viewer Modal */}
      {viewingFileData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setViewingFile(null)}>
          <div
            className="w-full max-w-3xl max-h-[80vh] bg-card rounded-lg border border-border shadow-xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <div>
                <p className="text-xs font-medium">{viewingFileData.fileName}</p>
                <p className="text-[10px] text-muted-foreground">{viewingFileData.filePath}</p>
              </div>
              <button onClick={() => setViewingFile(null)} className="p-1 rounded hover:bg-muted">
                <X className="size-3.5" />
              </button>
            </div>
            <pre className="flex-1 overflow-auto p-4 text-[11px] leading-5 font-mono whitespace-pre-wrap">
              {viewingFileData.content || "(no content)"}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
