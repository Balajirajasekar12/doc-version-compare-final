/**
 * Source Viewer — view uploaded source files with syntax-aware tabs.
 * All data from React Context (browser memory).
 */

import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router";
import { useModStore } from "../context";
import {
  ArrowLeft,
  Copy,
  Download,
  FileText,
  Code2,
  Table2,
  GitBranch,
} from "lucide-react";

export default function ModSourceViewer() {
  const { projectId, fileId } = useParams<{ projectId: string; fileId: string }>();
  const navigate = useNavigate();
  const { state } = useModStore();

  const file = fileId ? state.sourceFiles[fileId] : undefined;
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"source" | "entities" | "tables" | "dependencies">("source");

  const analysisResult = useMemo(() => {
    if (!file?.analysisResult) return null;
    try {
      return JSON.parse(file.analysisResult) as {
        language: string;
        entities: Array<{
          type: string;
          name: string;
          subType?: string;
          lineStart: number;
          lineEnd: number;
          signature?: string;
          annotations?: string[];
        }>;
        tablesReferenced: Array<{
          name: string;
          operation: string;
          lineStart: number;
          lineEnd: number;
          isView: boolean;
        }>;
        dependencies: Array<{
          type: string;
          source: string;
          target: string;
          lineStart: number;
          evidence?: string;
        }>;
        summary: {
          totalEntities: number;
          totalTables: number;
          totalDependencies: number;
          byEntityType: Record<string, number>;
        };
      };
    } catch {
      return null;
    }
  }, [file?.analysisResult]);

  function handleCopy() {
    if (file?.content) {
      navigator.clipboard.writeText(file.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function handleDownload() {
    if (!file) return;
    const blob = new Blob([file.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!file) {
    return (
      <div className="flex items-center justify-center h-64 text-xs text-muted-foreground">
        File not found
      </div>
    );
  }

  const lines = file.content.split("\n");

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/modernization/project/${projectId}/inventory`)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-4" />
          </button>
          <div>
            <h1 className="text-sm font-medium">{file.fileName}</h1>
            <p className="text-[10px] text-muted-foreground">
              {file.language || file.fileType} · {file.sourceType} · {file.lineCount} lines
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[9px] px-1.5 py-0.5 rounded ${
            file.status === "PARSED" ? "bg-green-500/10 text-green-400" :
            file.status === "ANALYZED" ? "bg-blue-500/10 text-blue-400" :
            "bg-muted text-muted-foreground"
          }`}>{file.status}</span>
          <button onClick={handleCopy} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] font-medium hover:bg-muted transition-colors">
            <Copy className="size-3" /> {copied ? "Copied!" : "Copy"}
          </button>
          <button onClick={handleDownload} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] font-medium hover:bg-muted transition-colors">
            <Download className="size-3" /> Download
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Sidebar tabs */}
        <div className="w-44 shrink-0 border-r border-border bg-card p-2 space-y-0.5">
          <button
            onClick={() => setActiveTab("source")}
            className={`flex items-center gap-2 w-full rounded px-2 py-1.5 text-[11px] transition-colors ${
              activeTab === "source" ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60"
            }`}
          >
            <FileText className="size-3.5" /> Source Code
          </button>
          {analysisResult && (
            <>
              <button onClick={() => setActiveTab("entities")} className={`flex items-center gap-2 w-full rounded px-2 py-1.5 text-[11px] transition-colors ${activeTab === "entities" ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60"}`}>
                <Code2 className="size-3.5" /> Entities ({analysisResult.summary.totalEntities})
              </button>
              <button onClick={() => setActiveTab("tables")} className={`flex items-center gap-2 w-full rounded px-2 py-1.5 text-[11px] transition-colors ${activeTab === "tables" ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60"}`}>
                <Table2 className="size-3.5" /> Tables ({analysisResult.summary.totalTables})
              </button>
              <button onClick={() => setActiveTab("dependencies")} className={`flex items-center gap-2 w-full rounded px-2 py-1.5 text-[11px] transition-colors ${activeTab === "dependencies" ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60"}`}>
                <GitBranch className="size-3.5" /> Deps ({analysisResult.summary.totalDependencies})
              </button>
            </>
          )}
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-auto">
          {activeTab === "source" && (
            <div className="p-4">
              <pre className="text-[11px] leading-5 font-mono">
                {lines.map((line, i) => (
                  <div key={i} className="flex">
                    <span className="w-12 shrink-0 text-right pr-4 text-muted-foreground/50 select-none">{i + 1}</span>
                    <span className="whitespace-pre">{line}</span>
                  </div>
                ))}
              </pre>
            </div>
          )}

          {activeTab === "entities" && analysisResult && (
            <div className="p-4 space-y-1.5">
              {analysisResult.entities.map((entity, i) => (
                <div key={i} className="rounded border border-border bg-card px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">{entity.type}</span>
                    {entity.subType && <span className="text-[10px] text-muted-foreground">{entity.subType}</span>}
                    <span className="text-xs font-medium">{entity.name}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground">L{entity.lineStart}–{entity.lineEnd}</span>
                  </div>
                  {entity.signature && <pre className="mt-1 text-[10px] text-muted-foreground/70 whitespace-pre-wrap">{entity.signature}</pre>}
                </div>
              ))}
            </div>
          )}

          {activeTab === "tables" && analysisResult && (
            <div className="p-4 space-y-1.5">
              {analysisResult.tablesReferenced.map((table, i) => (
                <div key={i} className="flex items-center gap-3 rounded border border-border bg-card px-3 py-2">
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">{table.operation}</span>
                  <span className="text-xs font-mono font-medium">{table.name}</span>
                  {table.isView && <span className="text-[10px] text-muted-foreground">VIEW</span>}
                  <span className="ml-auto text-[10px] text-muted-foreground">L{table.lineStart}</span>
                </div>
              ))}
              {analysisResult.tablesReferenced.length === 0 && (
                <p className="text-xs text-muted-foreground py-8 text-center">No table references found</p>
              )}
            </div>
          )}

          {activeTab === "dependencies" && analysisResult && (
            <div className="p-4 space-y-1.5">
              {analysisResult.dependencies.map((dep, i) => (
                <div key={i} className="rounded border border-border bg-card px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">{dep.type}</span>
                    <span className="text-xs">{dep.source}<span className="text-muted-foreground"> → </span>{dep.target}</span>
                  </div>
                  {dep.evidence && <pre className="mt-1 text-[10px] text-muted-foreground/70 whitespace-pre-wrap max-h-16 overflow-auto">{dep.evidence}</pre>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
