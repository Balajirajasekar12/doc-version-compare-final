import { useState } from "react";
import { useParams } from "react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { AppLayout, PageHeader } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge, getStatusVariant } from "@/components/ui/status-badge";
import {
  Loader2,
  Upload,
  FileUp,
  CheckCircle2,
  XCircle,
  AlertCircle,
  SkipForward,
} from "lucide-react";
import type { Id } from "../convex/_generated/dataModel";

interface ParsedResult {
  testcaseId: string;
  className: string;
  methodName?: string;
  result: "PASSED" | "FAILED" | "SKIPPED" | "ERROR";
  duration?: number;
  errorMessage?: string;
}

function parseJUnitXML(xmlText: string): ParsedResult[] {
  const results: ParsedResult[] = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "text/xml");
  const testcases = doc.querySelectorAll("testcase");

  testcases.forEach((tc) => {
    const name = tc.getAttribute("name") || "unknown";
    const classname = tc.getAttribute("classname") || "unknown";
    const time = parseFloat(tc.getAttribute("time") || "0");
    const failure = tc.querySelector("failure");
    const error = tc.querySelector("error");
    const skipped = tc.querySelector("skipped");

    let result: "PASSED" | "FAILED" | "SKIPPED" | "ERROR" = "PASSED";
    let errorMessage: string | undefined;
    if (failure) {
      result = "FAILED";
      errorMessage = failure.getAttribute("message") || undefined;
    } else if (error) {
      result = "ERROR";
      errorMessage = error.getAttribute("message") || undefined;
    } else if (skipped) {
      result = "SKIPPED";
    }

    // Try to extract testcase ID from name (e.g., "testTC001_PayrollValidation" -> "TC-001")
    const tcMatch = name.match(/TC[-_]?(\d+)/i);
    const testcaseId = tcMatch ? `TC-${tcMatch[1].padStart(3, "0")}` : name;

    results.push({
      testcaseId,
      className: classname,
      methodName: name,
      result,
      duration: Math.round(time * 1000),
      errorMessage,
    });
  });

  return results;
}

function parseSimpleResults(text: string): ParsedResult[] {
  const results: ParsedResult[] = [];
  const lines = text.split("\n").filter((l) => l.trim());

  for (const line of lines) {
    // Format: TC-001 PASS or TC-001,Passed or TC-001: FAILED
    const match = line.match(
      /(TC[-_]?\d+)[\s,:\t]+(PASS(?:ED)?|FAIL(?:ED)?|SKIP(?:PED)?|ERROR)/i,
    );
    if (match) {
      const id = match[1].toUpperCase().replace(/[-_]/g, "-");
      const status = match[2].toUpperCase();
      results.push({
        testcaseId: id.includes("-") ? id : `TC-${id.replace("TC", "")}`,
        className: id,
        result:
          status.startsWith("PASS")
            ? "PASSED"
            : status.startsWith("FAIL")
              ? "FAILED"
              : status.startsWith("SKIP")
                ? "SKIPPED"
                : "ERROR",
      });
    }
  }

  return results;
}

export default function AutomationResults() {
  const { projectId, cycleId } = useParams<{ projectId: string; cycleId: string }>();
  const pid = projectId as Id<"projects">;
  const cid = cycleId as Id<"testCycles">;

  const stats = useQuery(api.testExecution.getCycleStats, { cycleId: cid });
  const existingResults = useQuery(api.testExecution.listAutomationResults, {
    projectId: pid,
    testCycleId: cid,
  });
  const importResults = useMutation(api.testExecution.importAutomationResults);

  const [parsing, setParsing] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedResult[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [importDone, setImportDone] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setParsing(true);
    try {
      const text = await file.text();
      let results: ParsedResult[];

      if (file.name.endsWith(".xml")) {
        results = parseJUnitXML(text);
      } else {
        results = parseSimpleResults(text);
      }

      setParsedData(results);
    } finally {
      setParsing(false);
    }
  };

  const handleImport = async () => {
    if (!parsedData || parsedData.length === 0) return;
    setImporting(true);
    try {
      await importResults({
        projectId: pid,
        testCycleId: cid,
        results: parsedData.map((r) => ({
          testcaseId: r.testcaseId,
          className: r.className,
          methodName: r.methodName,
          result: r.result,
          duration: r.duration,
          errorMessage: r.errorMessage,
        })),
      });
      setImportDone(true);
      setParsedData(null);
    } finally {
      setImporting(false);
    }
  };

  const resultIcon = (result: string) => {
    switch (result) {
      case "PASSED": return <CheckCircle2 className="size-3.5 text-emerald-600" />;
      case "FAILED": return <XCircle className="size-3.5 text-red-600" />;
      case "SKIPPED": return <SkipForward className="size-3.5 text-amber-600" />;
      case "ERROR": return <AlertCircle className="size-3.5 text-red-600" />;
      default: return null;
    }
  };

  return (
    <AppLayout>
      <PageHeader
        title="Import Automation Results"
        description={stats ? `Test Cycle: ${stats.cycle?.name}` : "Import Playwright/JUnit results"}
        breadcrumbs={[
          { label: "Dashboard", path: "/app" },
          { label: "Test Cycles", path: `/app/projects/${projectId}/test-cycles` },
          { label: cycleId ?? "", path: `/app/projects/${projectId}/test-cycles/${cycleId}` },
          { label: "Automation Results" },
        ]}
      />
      <div className="p-8">
        <div className="mx-auto max-w-4xl space-y-6">
          {/* Upload */}
          <Card className="border-border">
            <CardContent className="p-5">
              <h3 className="text-sm font-medium mb-3">Upload Results File</h3>
              <p className="text-xs text-muted-foreground mb-4">
                Supports JUnit XML format (Playwright, TestNG) or simple text format (TC-001 PASS).
              </p>
              <label className="flex items-center justify-center gap-3 rounded-md border-2 border-dashed border-border p-6 cursor-pointer hover:bg-muted/40 transition-colors">
                <FileUp className="size-5 text-muted-foreground" />
                <div className="text-center">
                  <p className="text-xs font-medium">
                    {parsing ? "Parsing..." : "Click to upload results file"}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    JUnit XML (.xml) or text (.txt, .csv)
                  </p>
                </div>
                <input
                  type="file"
                  accept=".xml,.txt,.csv"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={parsing}
                />
              </label>
            </CardContent>
          </Card>

          {/* Parsed Results Preview */}
          {parsedData && parsedData.length > 0 && (
            <Card className="border-border">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium">
                    Parsed Results ({parsedData.length} test cases)
                  </h3>
                  <Button
                    size="sm"
                    onClick={handleImport}
                    disabled={importing}
                    className="gap-1.5"
                  >
                    {importing ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Upload className="size-3.5" />
                    )}
                    Import All
                  </Button>
                </div>
                <div className="space-y-1 max-h-96 overflow-auto">
                  {parsedData.map((r, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded border border-border px-3 py-1.5"
                    >
                      <div className="flex items-center gap-3">
                        {resultIcon(r.result)}
                        <span className="font-mono text-[11px]">{r.testcaseId}</span>
                        <span className="text-[10px] text-muted-foreground">{r.className}</span>
                        {r.methodName && r.methodName !== r.className && (
                          <span className="text-[10px] text-muted-foreground">.{r.methodName}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {r.duration && (
                          <span className="text-[10px] text-muted-foreground">{r.duration}ms</span>
                        )}
                        <StatusBadge
                          label={r.result}
                          variant={getStatusVariant(r.result)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                {parsedData.some((r) => r.errorMessage) && (
                  <div className="mt-3 space-y-1">
                    <p className="text-[10px] text-muted-foreground uppercase">Error Messages</p>
                    {parsedData
                      .filter((r) => r.errorMessage)
                      .map((r, i) => (
                        <div key={i} className="rounded bg-red-600/5 border border-red-600/20 px-3 py-1.5 text-[10px]">
                          <span className="font-mono font-medium">{r.testcaseId}:</span>{" "}
                          <span className="text-red-600/80">{r.errorMessage}</span>
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {parsedData && parsedData.length === 0 && (
            <Card className="border-border">
              <CardContent className="p-5 text-center">
                <p className="text-xs text-muted-foreground">
                  No test results found in the uploaded file. Check the format.
                </p>
              </CardContent>
            </Card>
          )}

          {importDone && (
            <Card className="border-emerald-600/30 bg-emerald-600/5">
              <CardContent className="p-4 flex items-center gap-3">
                <CheckCircle2 className="size-4 text-emerald-600" />
                <p className="text-xs">Automation results imported successfully.</p>
              </CardContent>
            </Card>
          )}

          {/* Existing Results */}
          {existingResults && existingResults.length > 0 && (
            <Card className="border-border">
              <CardContent className="p-5">
                <h3 className="text-sm font-medium mb-3">
                  Imported Results ({existingResults.length})
                </h3>
                <div className="space-y-1 max-h-64 overflow-auto">
                  {existingResults.map((r) => (
                    <div
                      key={r._id}
                      className="flex items-center justify-between rounded border border-border px-3 py-1.5"
                    >
                      <div className="flex items-center gap-3">
                        {resultIcon(r.result)}
                        <span className="font-mono text-[11px]">{r.testcaseId}</span>
                        <span className="text-[10px] text-muted-foreground">{r.className}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        {r.duration && <span>{r.duration}ms</span>}
                        <StatusBadge
                          label={r.result}
                          variant={getStatusVariant(r.result)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
