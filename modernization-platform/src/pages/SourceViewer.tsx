import { useParams, useNavigate } from "react-router";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { AppLayout, PageHeader } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { StatusBadge, getStatusVariant } from "@/components/ui/status-badge";
import {
  ArrowLeft,
  Copy,
  Download,
  FileText,
  Loader2,
  Code2,
  Table2,
  GitBranch,
} from "lucide-react";
import { useState, useMemo } from "react";
import type { Id } from "../convex/_generated/dataModel";

export default function SourceViewer() {
  const { projectId, fileId } = useParams<{
    projectId: string;
    fileId: string;
  }>();
  const navigate = useNavigate();
  const file = useQuery(
    api.sourceFiles.get,
    fileId ? { id: fileId as Id<"sourceFiles"> } : "skip",
  );

  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "source" | "entities" | "tables" | "dependencies"
  >("source");

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

  const handleCopy = () => {
    if (file?.content) {
      navigator.clipboard.writeText(file.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    if (!file) return;
    const blob = new Blob([file.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (file === undefined) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!file) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
          File not found
        </div>
      </AppLayout>
    );
  }

  const lines = file.content.split("\n");

  return (
    <AppLayout>
      <PageHeader
        title={file.fileName}
        description={`${file.language || file.fileType} · ${file.sourceType} · ${file.lineCount} lines`}
        breadcrumbs={[
          { label: "Dashboard", path: "/app" },
          { label: "Projects", path: "/app" },
          {
            label: file.fileName,
          },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge
              label={file.status}
              variant={getStatusVariant(file.status)}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={handleCopy}
              className="gap-1.5"
            >
              <Copy className="size-3.5" />
              {copied ? "Copied!" : "Copy"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleDownload}
              className="gap-1.5"
            >
              <Download className="size-3.5" />
              Download
            </Button>
          </div>
        }
      />
      <div className="flex h-[calc(100vh-140px)]">
        {/* Sidebar tabs */}
        <div className="w-48 shrink-0 border-r border-border bg-card p-3 space-y-1">
          <button
            onClick={() => setActiveTab("source")}
            className={`flex items-center gap-2 w-full rounded px-2.5 py-1.5 text-xs transition-colors ${
              activeTab === "source"
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:bg-muted/60"
            }`}
          >
            <FileText className="size-3.5" />
            Source Code
          </button>
          {analysisResult && (
            <>
              <button
                onClick={() => setActiveTab("entities")}
                className={`flex items-center gap-2 w-full rounded px-2.5 py-1.5 text-xs transition-colors ${
                  activeTab === "entities"
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted/60"
                }`}
              >
                <Code2 className="size-3.5" />
                Entities ({analysisResult.summary.totalEntities})
              </button>
              <button
                onClick={() => setActiveTab("tables")}
                className={`flex items-center gap-2 w-full rounded px-2.5 py-1.5 text-xs transition-colors ${
                  activeTab === "tables"
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted/60"
                }`}
              >
                <Table2 className="size-3.5" />
                Tables ({analysisResult.summary.totalTables})
              </button>
              <button
                onClick={() => setActiveTab("dependencies")}
                className={`flex items-center gap-2 w-full rounded px-2.5 py-1.5 text-xs transition-colors ${
                  activeTab === "dependencies"
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted/60"
                }`}
              >
                <GitBranch className="size-3.5" />
                Dependencies ({analysisResult.summary.totalDependencies})
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
                    <span className="w-12 shrink-0 text-right pr-4 text-muted-foreground/50 select-none">
                      {i + 1}
                    </span>
                    <span className="whitespace-pre">{line}</span>
                  </div>
                ))}
              </pre>
            </div>
          )}

          {activeTab === "entities" && analysisResult && (
            <div className="p-4 space-y-1.5">
              {analysisResult.entities.map((entity, i) => (
                <div
                  key={i}
                  className="rounded border border-border bg-card px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <StatusBadge label={entity.type} variant="info" />
                    {entity.subType && (
                      <span className="text-[10px] text-muted-foreground">
                        {entity.subType}
                      </span>
                    )}
                    <span className="text-xs font-medium">{entity.name}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      L{entity.lineStart}–{entity.lineEnd}
                    </span>
                  </div>
                  {entity.signature && (
                    <pre className="mt-1 text-[10px] text-muted-foreground/70 whitespace-pre-wrap">
                      {entity.signature}
                    </pre>
                  )}
                  {entity.annotations && entity.annotations.length > 0 && (
                    <div className="mt-1 flex gap-1 flex-wrap">
                      {entity.annotations.map((ann, j) => (
                        <span
                          key={j}
                          className="rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground"
                        >
                          @{ann}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {activeTab === "tables" && analysisResult && (
            <div className="p-4 space-y-1.5">
              {analysisResult.tablesReferenced.map((table, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded border border-border bg-card px-3 py-2"
                >
                  <StatusBadge label={table.operation} variant="info" />
                  <span className="text-xs font-mono font-medium">
                    {table.name}
                  </span>
                  {table.isView && (
                    <span className="text-[10px] text-muted-foreground">
                      VIEW
                    </span>
                  )}
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    L{table.lineStart}
                  </span>
                </div>
              ))}
              {analysisResult.tablesReferenced.length === 0 && (
                <p className="text-xs text-muted-foreground py-8 text-center">
                  No table references found
                </p>
              )}
            </div>
          )}

          {activeTab === "dependencies" && analysisResult && (
            <div className="p-4 space-y-1.5">
              {analysisResult.dependencies.map((dep, i) => (
                <div
                  key={i}
                  className="rounded border border-border bg-card px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <StatusBadge label={dep.type} variant="info" />
                    <span className="text-xs">
                      {dep.source}
                      <span className="text-muted-foreground"> → </span>
                      {dep.target}
                    </span>
                  </div>
                  {dep.evidence && (
                    <pre className="mt-1 text-[10px] text-muted-foreground/70 whitespace-pre-wrap max-h-16 overflow-auto">
                      {dep.evidence}
                    </pre>
                  )}
                </div>
              ))}
              {analysisResult.dependencies.length === 0 && (
                <p className="text-xs text-muted-foreground py-8 text-center">
                  No dependencies found
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
