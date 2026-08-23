/**
 * Import Automation Results — parse JUnit XML / simple text and store in state.
 * All data in React Context (browser memory).
 */

import { useRef, useState } from "react";
import { useParams, useNavigate } from "react-router";
import { useModStore, genId } from "../context";
import type { AutomationResult, AutomationResultStatus } from "../lib/types";
import { CheckCircle2, FileUp, Upload, XCircle, AlertCircle, SkipForward, ArrowLeft } from "lucide-react";

interface ParsedResult {
  testcaseId: string;
  className: string;
  methodName?: string;
  result: AutomationResultStatus;
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

    let result: AutomationResultStatus = "PASSED";
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
    const match = line.match(
      /(TC[-_]?\d+)[\s,:\t]+(PASS(?:ED)?|FAIL(?:ED)?|SKIP(?:PED)?|ERROR)/i,
    );
    if (match) {
      const id = match[1].toUpperCase().replace(/[-_]/g, "-");
      const status = match[2].toUpperCase();
      results.push({
        testcaseId: id.includes("-") ? id : `TC-${id.replace("TC", "")}`,
        className: id,
        result: status.startsWith("PASS") ? "PASSED" : status.startsWith("FAIL") ? "FAILED" : status.startsWith("SKIP") ? "SKIPPED" : "ERROR",
      });
    }
  }

  return results;
}

function resultIcon(result: string) {
  switch (result) {
    case "PASSED": return <CheckCircle2 className="size-3.5 text-emerald-600" />;
    case "FAILED": return <XCircle className="size-3.5 text-red-600" />;
    case "SKIPPED": return <SkipForward className="size-3.5 text-amber-600" />;
    case "ERROR": return <AlertCircle className="size-3.5 text-red-600" />;
    default: return null;
  }
}

function resultBadge(result: string): string {
  switch (result) {
    case "PASSED": return "bg-green-500/10 text-green-400";
    case "FAILED": return "bg-red-500/10 text-red-400";
    case "SKIPPED": return "bg-amber-500/10 text-amber-400";
    case "ERROR": return "bg-red-500/10 text-red-400";
    default: return "bg-muted text-muted-foreground";
  }
}

export default function ModAutomationResults() {
  const { projectId, cycleId } = useParams<{ projectId: string; cycleId?: string }>();
  const navigate = useNavigate();
  const { state, dispatch, genId: genM } = useModStore();
  const fileRef = useRef<HTMLInputElement>(null);

  const [parsing, setParsing] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedResult[] | null>(null);
  const [importDone, setImportDone] = useState(false);

  if (!projectId) return <div className="flex items-center justify-center h-64 text-xs text-muted-foreground">Project not found.</div>;

  const project = state.projects.find((p) => p.id === projectId);
  if (!project) return <div className="flex items-center justify-center h-64 text-xs text-muted-foreground">Project not found.</div>;

  const currentCycle = cycleId ? state.testCycles[cycleId] : null;
  const existingResults = cycleId
    ? Object.values(state.automationResults).filter((r) => r.projectId === projectId && r.testCycleId === cycleId)
    : Object.values(state.automationResults).filter((r) => r.projectId === projectId);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
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
  }

  function handleImport() {
    if (!parsedData || parsedData.length === 0 || !projectId) return;
    const results: AutomationResult[] = parsedData.map((r) => ({
      id: genM(),
      projectId,
      testCycleId: cycleId || "default",
      testcaseId: r.testcaseId,
      className: r.className,
      methodName: r.methodName,
      result: r.result,
      duration: r.duration,
      errorMessage: r.errorMessage,
      importedAt: Date.now(),
    }));
    dispatch({ type: "ADD_AUTOMATION_RESULTS", results });
    setImportDone(true);
    setParsedData(null);
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-6">
      <div>
        {cycleId && (
          <button
            onClick={() => navigate(`/modernization/project/${projectId}/test-cycles${cycleId ? `/${cycleId}` : ""}`)}
            className="text-[10px] text-muted-foreground hover:text-foreground mb-2 block"
          >
            ← Back to {currentCycle?.name ?? "Test Cycles"}
          </button>
        )}
        <h1 className="text-lg font-semibold tracking-tight">Import Automation Results</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          {currentCycle ? `Test Cycle: ${currentCycle.name}` : "Import Playwright/JUnit results"}
        </p>
      </div>

      {/* Upload */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h3 className="text-sm font-medium mb-3">Upload Results File</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Supports JUnit XML format (Playwright, TestNG) or simple text format (TC-001 PASS).
        </p>
        <label className="flex items-center justify-center gap-3 rounded-md border-2 border-dashed border-border p-6 cursor-pointer hover:bg-muted/40 transition-colors">
          <FileUp className="size-5 text-muted-foreground" />
          <div className="text-center">
            <p className="text-xs font-medium">{parsing ? "Parsing..." : "Click to upload results file"}</p>
            <p className="text-[10px] text-muted-foreground mt-1">JUnit XML (.xml) or text (.txt, .csv)</p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".xml,.txt,.csv"
            onChange={handleFileUpload}
            className="hidden"
            disabled={parsing}
          />
        </label>
      </div>

      {/* Parsed Results Preview */}
      {parsedData && parsedData.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium">Parsed Results ({parsedData.length} test cases)</h3>
            <button
              onClick={handleImport}
              className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-[11px] font-medium text-background hover:opacity-90 transition-opacity"
            >
              <Upload className="size-3" /> Import All
            </button>
          </div>
          <div className="space-y-1 max-h-96 overflow-auto">
            {parsedData.map((r, i) => (
              <div key={i} className="flex items-center justify-between rounded border border-border px-3 py-1.5">
                <div className="flex items-center gap-3">
                  {resultIcon(r.result)}
                  <span className="font-mono text-[11px]">{r.testcaseId}</span>
                  <span className="text-[10px] text-muted-foreground">{r.className}</span>
                  {r.methodName && r.methodName !== r.className && (
                    <span className="text-[10px] text-muted-foreground">.{r.methodName}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {r.duration && <span className="text-[10px] text-muted-foreground">{r.duration}ms</span>}
                  <span className={`text-[9px] px-1.5 py-0.5 rounded ${resultBadge(r.result)}`}>
                    {r.result}
                  </span>
                </div>
              </div>
            ))}
          </div>
          {parsedData.some((r) => r.errorMessage) && (
            <div className="mt-3 space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase">Error Messages</p>
              {parsedData.filter((r) => r.errorMessage).map((r, i) => (
                <div key={i} className="rounded bg-red-600/5 border border-red-600/20 px-3 py-1.5 text-[10px]">
                  <span className="font-mono font-medium">{r.testcaseId}:</span>{" "}
                  <span className="text-red-600/80">{r.errorMessage}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {parsedData && parsedData.length === 0 && (
        <div className="rounded-lg border border-border bg-card p-5 text-center">
          <p className="text-xs text-muted-foreground">
            No test results found in the uploaded file. Check the format.
          </p>
        </div>
      )}

      {importDone && (
        <div className="rounded-lg border border-emerald-600/30 bg-emerald-600/5 p-4 flex items-center gap-3">
          <CheckCircle2 className="size-4 text-emerald-600" />
          <p className="text-xs">Automation results imported successfully.</p>
        </div>
      )}

      {/* Existing Results */}
      {existingResults.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="text-sm font-medium mb-3">Imported Results ({existingResults.length})</h3>
          <div className="space-y-1 max-h-64 overflow-auto">
            {existingResults.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded border border-border px-3 py-1.5">
                <div className="flex items-center gap-3">
                  {resultIcon(r.result)}
                  <span className="font-mono text-[11px]">{r.testcaseId}</span>
                  <span className="text-[10px] text-muted-foreground">{r.className}</span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  {r.duration && <span>{r.duration}ms</span>}
                  <span className={`text-[9px] px-1.5 py-0.5 rounded ${resultBadge(r.result)}`}>
                    {r.result}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
