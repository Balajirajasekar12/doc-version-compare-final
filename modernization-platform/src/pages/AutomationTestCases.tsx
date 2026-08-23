import { useState } from "react";
import { useParams } from "react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { AppLayout, PageHeader } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { StatusBadge, getStatusVariant } from "@/components/ui/status-badge";
import {
  Code2,
  Loader2,
  Download,
  Copy,
  Lock,
  Play,
} from "lucide-react";
import type { Id } from "../convex/_generated/dataModel";

interface GeneratedTest {
  testcaseId: string;
  className: string;
  javaCode: string;
}

export default function AutomationTestCases() {
  const { projectId } = useParams<{ projectId: string }>();
  const pid = projectId as Id<"projects">;

  const project = useQuery(api.projects.get, { projectId: pid });
  const generated = useQuery(api.automation.listGenerated, { projectId: pid });
  const generateAll = useMutation(api.automation.generateForProject);

  const [generating, setGenerating] = useState(false);
  const [selectedTest, setSelectedTest] = useState<GeneratedTest | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [generatedResult, setGeneratedResult] = useState<{
    testClasses: GeneratedTest[];
    fullSuite: string;
  } | null>(null);

  const isFrozen = project?.status === "FROZEN";
  const tests = generatedResult?.testClasses ?? [];

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const result = await generateAll({ projectId: pid });
      setGeneratedResult(result);
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDownloadAll = () => {
    if (!generatedResult) return;
    // Download the full suite
    const suiteBlob = new Blob([generatedResult.fullSuite], {
      type: "text/plain",
    });
    const suiteUrl = URL.createObjectURL(suiteBlob);
    const a = document.createElement("a");
    a.href = suiteUrl;
    a.download = `${project?.name?.replace(/[^a-zA-Z0-9]/g, "") || "Test"}TestSuite.java`;
    a.click();
    URL.revokeObjectURL(suiteUrl);

    // Download individual test files
    for (const tc of generatedResult.testClasses) {
      const blob = new Blob([tc.javaCode], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${tc.className}.java`;
      link.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <AppLayout>
      <PageHeader
        title="Automation Test Cases"
        description="Generate Java/Selenium test code from test cases with full traceability"
        breadcrumbs={[
          { label: "Dashboard", path: "/app" },
          { label: "Automation Tests" },
        ]}
        actions={
          <div className="flex items-center gap-2">
            {isFrozen ? (
              <Button
                size="sm"
                onClick={handleGenerate}
                disabled={generating}
                className="gap-1.5"
              >
                {generating ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Play className="size-3.5" />
                )}
                Generate Automation
              </Button>
            ) : (
              <div className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-[11px] text-muted-foreground">
                <Lock className="size-3" />
                Freeze MOD first
              </div>
            )}
            {tests.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleDownloadAll}
                className="gap-1.5"
              >
                <Download className="size-3.5" />
                Download All (.java)
              </Button>
            )}
          </div>
        }
      />
      <div className="flex h-[calc(100vh-140px)]">
        {/* Test file list */}
        <div className="w-72 shrink-0 border-r border-border bg-card overflow-auto">
          <div className="p-3 border-b border-border">
            <h3 className="text-xs font-medium text-muted-foreground">
              Generated Tests ({tests.length})
            </h3>
          </div>
          {tests.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">
              {isFrozen
                ? "Click Generate Automation to create Java/Selenium test code."
                : "Freeze the MOD version and generate manual test cases first."}
            </div>
          ) : (
            <div className="space-y-0.5 p-2">
              {tests.map((tc) => (
                <button
                  key={tc.testcaseId}
                  onClick={() => setSelectedTest(tc)}
                  className={`w-full text-left rounded px-2.5 py-2 text-xs transition-colors ${
                    selectedTest?.testcaseId === tc.testcaseId
                      ? "bg-muted font-medium text-foreground"
                      : "text-muted-foreground hover:bg-muted/60"
                  }`}
                >
                  <div className="font-mono text-[10px] text-muted-foreground/70">
                    {tc.testcaseId}
                  </div>
                  <div className="truncate mt-0.5">{tc.className}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Code viewer */}
        <div className="flex-1 overflow-auto">
          {selectedTest ? (
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-xs font-medium">{selectedTest.className}</h3>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {selectedTest.testcaseId}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      handleCopyCode(
                        selectedTest.javaCode,
                        selectedTest.testcaseId,
                      )
                    }
                    className="gap-1.5"
                  >
                    <Copy className="size-3.5" />
                    {copiedId === selectedTest.testcaseId
                      ? "Copied!"
                      : "Copy"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const blob = new Blob([selectedTest.javaCode], {
                        type: "text/plain",
                      });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `${selectedTest.className}.java`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="gap-1.5"
                  >
                    <Download className="size-3.5" />
                    Download
                  </Button>
                </div>
              </div>
              <pre className="rounded-md border border-border bg-card p-4 text-[11px] leading-5 font-mono overflow-auto whitespace-pre">
                {selectedTest.javaCode}
              </pre>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Code2
                className="mb-3 size-5 text-muted-foreground"
                strokeWidth={1.5}
              />
              <p className="text-xs text-muted-foreground">
                {tests.length > 0
                  ? "Select a test file to view the generated Java/Selenium code."
                  : "Generate automation to see the Java/Selenium test code here."}
              </p>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
