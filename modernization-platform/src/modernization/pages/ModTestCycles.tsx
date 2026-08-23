/* eslint-disable react-hooks/purity */
/**
 * Test Cycles — Phase 8: Test Execution, Screen Capture & Test Result Documentation
 */

import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router";
import { useModStore } from "../context";
import type { TestCycle, TestExecution, StepExecution, TestEvidence, Defect, TestCase } from "../lib/types";
import { AlertTriangle, Camera, Check, FileText, Image, MessageSquare, Play, Plus, TestTube, Video, X } from "lucide-react";

function statusColor(status: string): string {
  switch (status) {
    case "PASS": return "bg-green-500/10 text-green-400";
    case "FAIL": return "bg-red-500/10 text-red-400";
    case "BLOCKED": return "bg-amber-500/10 text-amber-400";
    case "SKIPPED": return "bg-blue-500/10 text-blue-400";
    default: return "bg-muted text-muted-foreground";
  }
}

function statusBg(status: string): string {
  switch (status) {
    case "PASS": return "bg-green-500 text-white";
    case "FAIL": return "bg-red-500 text-white";
    case "BLOCKED": return "bg-amber-500 text-white";
    default: return "bg-muted text-muted-foreground";
  }
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/* ── Capture Provider Picker ─────────────────────────────────── */

function CaptureProviderPicker({ onCapture }: { onCapture: (type: "SNAGIT" | "PLAYWRIGHT" | "BROWSER_CAPTURE" | "UPLOAD") => void }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative inline-flex">
      <button onClick={() => setShow(!show)} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted transition-colors">
        <Camera className="size-3" /> Capture
      </button>
      {show && (
        <div className="absolute top-full left-0 mt-1 z-20 bg-card border border-border rounded-lg shadow-xl w-52 py-1">
          <button onClick={() => { onCapture("UPLOAD"); setShow(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-[11px] hover:bg-muted transition-colors">
            <Image className="size-3.5 text-muted-foreground" />
            <div className="text-left"><p className="font-medium">Upload Screenshot</p><p className="text-[9px] text-muted-foreground">Browse an image file</p></div>
          </button>
          <button onClick={() => { onCapture("BROWSER_CAPTURE"); setShow(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-[11px] hover:bg-muted transition-colors">
            <Camera className="size-3.5 text-muted-foreground" />
            <div className="text-left"><p className="font-medium">Browser Screenshot</p><p className="text-[9px] text-muted-foreground">Capture screen area</p></div>
          </button>
          <button onClick={() => { onCapture("SNAGIT"); setShow(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-[11px] hover:bg-muted transition-colors">
            <Video className="size-3.5 text-muted-foreground" />
            <div className="text-left"><p className="font-medium">Snagit Capture</p><p className="text-[9px] text-muted-foreground">Paste from Snagit (Ctrl+V)</p></div>
          </button>
          <button onClick={() => { onCapture("PLAYWRIGHT"); setShow(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-[11px] hover:bg-muted transition-colors">
            <FileText className="size-3.5 text-muted-foreground" />
            <div className="text-left"><p className="font-medium">Playwright Script</p><p className="text-[9px] text-muted-foreground">Attach capture output</p></div>
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Evidence Viewer ─────────────────────────────────────────── */

function EvidenceViewer({ evidence, onRemove }: { evidence: TestEvidence[]; onRemove?: (id: string) => void }) {
  const [viewing, setViewing] = useState<TestEvidence | null>(null);
  if (evidence.length === 0) return null;
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {evidence.map((ev) => (
          <div key={ev.id} className="group relative rounded border border-border overflow-hidden cursor-pointer hover:border-foreground/30 transition-colors" onClick={() => setViewing(ev)}>
            {ev.dataUrl ? <img src={ev.dataUrl} alt={ev.fileName} className="h-16 w-24 object-cover" /> : <div className="h-16 w-24 flex items-center justify-center bg-muted text-[9px] text-muted-foreground">{ev.captureType}</div>}
            <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-1.5 py-0.5"><p className="text-[8px] text-white/80 truncate">{ev.originalName}</p></div>
            <span className="absolute top-0.5 left-0.5 text-[7px] px-1 py-0.5 rounded bg-black/60 text-white/80">{ev.captureType}</span>
            {onRemove && <button onClick={(e) => { e.stopPropagation(); onRemove(ev.id); }} className="absolute top-0.5 right-0.5 p-0.5 rounded bg-black/60 text-white/80 hover:bg-red-500/80 opacity-0 group-hover:opacity-100 transition-opacity"><X className="size-2.5" /></button>}
          </div>
        ))}
      </div>
      {viewing?.dataUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-8" onClick={() => setViewing(null)}>
          <div className="relative max-w-4xl max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <img src={viewing.dataUrl} alt={viewing.fileName} className="max-h-[80vh] max-w-full rounded-lg border border-border" />
            <div className="absolute bottom-0 left-0 right-0 bg-black/70 rounded-b-lg px-4 py-2">
              <p className="text-xs text-white">{viewing.originalName}</p>
              <p className="text-[10px] text-white/60">{viewing.captureType} · {formatTime(viewing.capturedAt)} · by {viewing.capturedBy}</p>
            </div>
            <button onClick={() => setViewing(null)} className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80"><X className="size-4" /></button>
          </div>
        </div>
      )}
    </>
  );
}

/* ── Defect Modal ────────────────────────────────────────────── */

function DefectModal({ execution, step, onClose }: { execution: TestExecution; step: StepExecution; onClose: () => void }) {
  const { dispatch, genId: gen } = useModStore();
  const [title, setTitle] = useState(`Defect in Step ${step.stepNumber}: ${step.description.slice(0, 60)}`);
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<Defect["severity"]>("HIGH");

  function createDefect() {
    if (!title.trim()) return;
    const defect: Defect = {
      id: gen(), projectId: execution.projectId, defectId: `DEF-${Date.now().toString(36).toUpperCase().slice(-4)}`,
      testCycleId: execution.testCycleId, executionId: execution.id, testcaseId: execution.testcaseId,
      stepNumber: step.stepNumber, title: title.trim(), description: description.trim() || step.description,
      expectedResult: step.expectedResult, actualResult: step.actualResult ?? "Not captured",
      build: execution.build, environment: execution.environment, severity, status: "OPEN",
      createdBy: execution.executedBy, createdAt: Date.now(), updatedAt: Date.now(),
    };
    dispatch({ type: "ADD_DEFECT", defect });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="w-full max-w-lg bg-card rounded-lg border border-border shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-xs font-medium">Create Defect</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div><label className="text-[10px] text-muted-foreground mb-1 block">Title</label><input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring" /></div>
          <div><label className="text-[10px] text-muted-foreground mb-1 block">Description</label><textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the defect..." className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring min-h-[80px]" /></div>
          <div><label className="text-[10px] text-muted-foreground mb-1 block">Severity</label><select value={severity} onChange={(e) => setSeverity(e.target.value as Defect["severity"])} className="rounded-md border border-border bg-background px-2 py-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring">{["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
          <div className="rounded-md bg-muted/30 p-3 space-y-1 text-[10px] text-muted-foreground">
            <p><strong>Test Case:</strong> {execution.testcaseId}</p>
            <p><strong>Step:</strong> {step.stepNumber}</p>
            <p><strong>Expected:</strong> {step.expectedResult}</p>
            <p><strong>Actual:</strong> {step.actualResult ?? "Not captured"}</p>
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={createDefect} disabled={!title.trim()} className="inline-flex items-center gap-1.5 rounded-md bg-red-500 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-red-600 disabled:opacity-50 transition-colors">Create Defect</button>
            <button onClick={onClose} className="text-[11px] text-muted-foreground hover:text-foreground">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Step Execution Card ─────────────────────────────────────── */

function StepCard({ step, execution, cycle }: { step: StepExecution; execution: TestExecution; cycle: TestCycle }) {
  const { state, dispatch, genId: genS } = useModStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [showDefect, setShowDefect] = useState(false);
  const [comments, setComments] = useState(step.comments ?? "");

  const evidence = Object.values(state.testEvidence).filter((ev) => ev.executionId === execution.id && ev.stepNumber === step.stepNumber);

  function updateStatus(status: StepExecution["status"]) {
    dispatch({ type: "UPSERT_STEP_EXECUTION", step: { ...step, status, updatedAt: Date.now(), executedAt: Date.now(), comments: comments || undefined } });
  }
  function updateActual(actual: string) {
    dispatch({ type: "UPSERT_STEP_EXECUTION", step: { ...step, actualResult: actual, updatedAt: Date.now() } });
  }
  function saveComments() {
    dispatch({ type: "UPSERT_STEP_EXECUTION", step: { ...step, comments: comments || undefined, updatedAt: Date.now() } });
  }
  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      dispatch({ type: "ADD_TEST_EVIDENCE", evidence: { id: genS(), projectId: execution.projectId, testCycleId: cycle.id, executionId: execution.id, testcaseId: execution.testcaseId, stepNumber: step.stepNumber, captureType: "UPLOAD", fileName: file.name, originalName: file.name, mimeType: file.type, size: file.size, dataUrl: reader.result as string, isRedacted: false, capturedBy: cycle.tester, capturedAt: Date.now(), createdAt: Date.now() } });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }
  async function handleCapture(type: "SNAGIT" | "PLAYWRIGHT" | "BROWSER_CAPTURE" | "UPLOAD") {
    if (type === "UPLOAD") { fileRef.current?.click(); return; }
    if (type === "BROWSER_CAPTURE") {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const track = stream.getVideoTracks()[0];
        const ic = new ImageCapture(track);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const bm = await (ic as any).grabFrame();
        track.stop();
        const c = document.createElement("canvas"); c.width = bm.width; c.height = bm.height;
        c.getContext("2d")!.drawImage(bm, 0, 0);
        const du = c.toDataURL("image/png");
        dispatch({ type: "ADD_TEST_EVIDENCE", evidence: { id: genS(), projectId: execution.projectId, testCycleId: cycle.id, executionId: execution.id, testcaseId: execution.testcaseId, stepNumber: step.stepNumber, captureType: "BROWSER_CAPTURE", fileName: `browser-${step.stepNumber}-${Date.now()}.png`, originalName: `browser-capture-${step.stepNumber}.png`, mimeType: "image/png", size: du.length, dataUrl: du, isRedacted: false, capturedBy: cycle.tester, capturedAt: Date.now(), createdAt: Date.now() } });
      } catch { fileRef.current?.click(); }
      return;
    }
    if (type === "SNAGIT") {
      const handler = (ev: ClipboardEvent) => {
        const items = ev.clipboardData?.items; if (!items) return;
        for (const item of items) {
          if (item.type.startsWith("image/")) {
            const blob = item.getAsFile(); if (!blob) continue;
            const r = new FileReader(); r.onload = () => {
              dispatch({ type: "ADD_TEST_EVIDENCE", evidence: { id: genS(), projectId: execution.projectId, testCycleId: cycle.id, executionId: execution.id, testcaseId: execution.testcaseId, stepNumber: step.stepNumber, captureType: "SNAGIT", fileName: `snagit-${step.stepNumber}-${Date.now()}.png`, originalName: "snagit-capture.png", mimeType: blob.type, size: blob.size, dataUrl: r.result as string, isRedacted: false, capturedBy: cycle.tester, capturedAt: Date.now(), createdAt: Date.now() } });
            }; r.readAsDataURL(blob); break;
          }
        }
      };
      document.addEventListener("paste", handler, { once: true });
      alert("Paste your Snagit screenshot now (Ctrl+V). It will be attached automatically.");
      return;
    }
    if (type === "PLAYWRIGHT") { fileRef.current?.click(); }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">STEP {step.stepNumber}</span>
            <span className={`text-[9px] px-1.5 py-0.5 rounded ${statusColor(step.status)}`}>{step.status.replace(/_/g, " ")}</span>
          </div>
          <p className="text-[11px] mt-1.5 leading-relaxed">{step.description}</p>
        </div>
      </div>
      <div className="rounded-md bg-muted/30 px-3 py-2">
        <p className="text-[10px] font-medium text-muted-foreground mb-0.5">Expected Result</p>
        <p className="text-[11px] leading-relaxed">{step.expectedResult}</p>
      </div>
      <div>
        <label className="text-[10px] font-medium text-muted-foreground mb-1 block">Actual Result</label>
        <textarea placeholder="Enter actual result observed..." value={step.actualResult ?? ""} onChange={(e) => updateActual(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring min-h-[60px]" />
      </div>
      <div>
        <label className="text-[10px] font-medium text-muted-foreground mb-1.5 block">Step Status</label>
        <div className="flex gap-1.5 flex-wrap">
          {(["NOT_EXECUTED", "PASS", "FAIL", "BLOCKED", "NOT_APPLICABLE"] as const).map((s) => (
            <button key={s} onClick={() => updateStatus(s)} className={`text-[10px] px-2.5 py-1 rounded-md font-medium transition-colors ${step.status === s ? statusBg(s) : "border border-border text-muted-foreground hover:bg-muted"}`}>{s === "NOT_EXECUTED" ? "Not Executed" : s === "NOT_APPLICABLE" ? "N/A" : s}</button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-[10px] font-medium text-muted-foreground block">Evidence</label>
        <div className="flex items-center gap-2">
          <CaptureProviderPicker onCapture={handleCapture} />
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
        </div>
        <EvidenceViewer evidence={evidence} onRemove={(id) => dispatch({ type: "REMOVE_TEST_EVIDENCE", id })} />
      </div>
      <div>
        <label className="text-[10px] font-medium text-muted-foreground mb-1 block"><MessageSquare className="inline size-3 mr-1" />Comments</label>
        <input value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Add comments..." className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring" onBlur={saveComments} />
      </div>
      {step.status === "FAIL" && (
        <button onClick={() => setShowDefect(true)} className="inline-flex items-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/5 px-3 py-1.5 text-[10px] font-medium text-red-400 hover:bg-red-500/10 transition-colors">
          <AlertTriangle className="size-3" /> Log Defect
        </button>
      )}
      {showDefect && <DefectModal execution={execution} step={step} onClose={() => setShowDefect(false)} />}
    </div>
  );
}

/* ── Execution Panel ─────────────────────────────────────────── */

function ExecutionPanel({ testcase, execution, cycle, onBack }: { testcase: TestCase; execution: TestExecution; cycle: TestCycle; onBack: () => void }) {
  const { state, dispatch } = useModStore();
  const steps = Object.values(state.stepExecutions).filter((s) => s.executionId === execution.id).sort((a, b) => a.stepNumber - b.stepNumber);

  function completeExecution() {
    let overall: TestExecution["overallStatus"] = "PASS";
    if (steps.some((s) => s.status === "FAIL")) overall = "FAIL";
    else if (steps.some((s) => s.status === "BLOCKED")) overall = "BLOCKED";
    else if (steps.every((s) => s.status === "NOT_EXECUTED" || s.status === "NOT_APPLICABLE")) overall = "NOT_EXECUTED";
    dispatch({ type: "UPDATE_TEST_EXECUTION", id: execution.id, updates: { overallStatus: overall, completedAt: Date.now(), duration: Date.now() - execution.startedAt } });
    onBack();
  }

  const passed = steps.filter((s) => s.status === "PASS").length;
  const failed = steps.filter((s) => s.status === "FAIL").length;
  const blocked = steps.filter((s) => s.status === "BLOCKED").length;

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-6">
      <div>
        <button onClick={onBack} className="text-[10px] text-muted-foreground hover:text-foreground mb-2 block">← Back to {cycle.name}</button>
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold tracking-tight">{testcase.testcaseId}</h1>
          <span className={`text-[9px] px-1.5 py-0.5 rounded ${statusColor(execution.overallStatus)}`}>{execution.overallStatus.replace(/_/g, " ")}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">{testcase.description}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-lg border border-border bg-card p-3"><p className="text-[10px] text-muted-foreground mb-1">Requirement</p><p className="text-[11px] leading-relaxed">{testcase.requirement}</p></div>
        <div className="rounded-lg border border-border bg-card p-3"><p className="text-[10px] text-muted-foreground mb-1">Precondition</p><p className="text-[11px] leading-relaxed">{testcase.precondition}</p></div>
        <div className="rounded-lg border border-border bg-card p-3"><p className="text-[10px] text-muted-foreground mb-1">Test Data</p><p className="text-[11px] leading-relaxed font-mono">{testcase.testData}</p></div>
      </div>
      <div className="flex items-center gap-4 text-[10px]">
        <span className="text-muted-foreground">Progress: {steps.length} steps</span>
        {passed > 0 && <span className="text-green-400">{passed} passed</span>}
        {failed > 0 && <span className="text-red-400">{failed} failed</span>}
        {blocked > 0 && <span className="text-amber-400">{blocked} blocked</span>}
      </div>
      <div className="space-y-4">{steps.map((s) => <StepCard key={s.id} step={s} execution={execution} cycle={cycle} />)}</div>
      <div className="flex items-center gap-3 pt-4 border-t border-border">
        <button onClick={completeExecution} className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-4 py-2 text-[11px] font-medium text-background hover:opacity-90 transition-opacity"><Check className="size-3.5" /> Complete Execution</button>
        <span className="text-[10px] text-muted-foreground">Overall status will be calculated from step results.</span>
      </div>
    </div>
  );
}

/* ── Main ────────────────────────────────────────────────────── */

export default function ModTestCycles() {
  const { projectId, cycleId } = useParams<{ projectId: string; cycleId?: string }>();
  const { state, dispatch, genId: genM } = useModStore();
  const navigate = useNavigate();
  const [showNew, setShowNew] = useState(false);
  const [cycleName, setCycleName] = useState("");
  const [release, setRelease] = useState("");
  const [build, setBuild] = useState("");
  const [environment, setEnvironment] = useState("QA");
  const [tester, setTester] = useState("");
  const [cycleNotes, setCycleNotes] = useState("");
  const [execTestcaseId, setExecTestcaseId] = useState<string | null>(null);

  useEffect(() => { if (projectId) dispatch({ type: "SET_CURRENT_PROJECT", projectId }); }, [projectId, dispatch]);

  const project = state.projects.find((p) => p.id === projectId);
  if (!project) return <div className="flex items-center justify-center h-64 text-xs text-muted-foreground">Project not found.</div>;

  const cycles = Object.values(state.testCycles).filter((c) => c.projectId === project!.id);
  const currentCycle = cycleId ? state.testCycles[cycleId] : null;
  const testCases = Object.values(state.testCases).filter((tc) => tc.projectId === project!.id);
  const automationCases = Object.values(state.automationTestCases).filter((c) => c.projectId === project!.id);
  const allDefects = Object.values(state.defects).filter((d) => d.projectId === project!.id);

  function createCycle() {
    if (!cycleName.trim()) return;
    dispatch({ type: "ADD_TEST_CYCLE", cycle: { id: genM(), projectId: project!.id, name: cycleName.trim(), release: release.trim() || undefined, build: build.trim() || undefined, environment: environment.trim() || undefined, tester: tester.trim() || "Tester", notes: cycleNotes.trim() || undefined, status: "PLANNED", createdAt: Date.now(), updatedAt: Date.now() } });
    setCycleName(""); setRelease(""); setBuild(""); setTester(""); setCycleNotes(""); setShowNew(false);
  }

  function startExecution(testcaseId: string) {
    if (!currentCycle) return;
    const existing = Object.values(state.testExecutions).find((e) => e.testCycleId === currentCycle.id && e.testcaseId === testcaseId);
    if (existing) { setExecTestcaseId(testcaseId); return; }
    const tc = testCases.find((t) => t.testcaseId === testcaseId);
    if (!tc) return;
    const execution: TestExecution = { id: genM(), projectId: project!.id, testCycleId: currentCycle.id, testcaseId, executionType: "MANUAL", executedBy: currentCycle.tester, executedAt: Date.now(), environment: currentCycle.environment, build: currentCycle.build, overallStatus: "NOT_EXECUTED", executionNumber: 1, startedAt: Date.now(), createdAt: Date.now() };
    dispatch({ type: "ADD_TEST_EXECUTION", execution });
    tc.steps.split("\n").filter((s) => s.trim()).forEach((stepText, i) => {
      dispatch({ type: "UPSERT_STEP_EXECUTION", step: { id: genM(), projectId: project!.id, executionId: execution.id, testCycleId: currentCycle.id, testcaseId, stepNumber: i + 1, description: stepText.replace(/^\d+[.)]\s*/, "").trim(), expectedResult: tc.expectedResult, status: "NOT_EXECUTED", createdAt: Date.now(), updatedAt: Date.now() } });
    });
    setExecTestcaseId(testcaseId);
    dispatch({ type: "UPDATE_TEST_CYCLE", id: currentCycle.id, updates: { status: "IN_PROGRESS" } });
  }

  // Execution view
  if (cycleId && currentCycle && execTestcaseId) {
    const ex = Object.values(state.testExecutions).find((e) => e.testCycleId === currentCycle.id && e.testcaseId === execTestcaseId);
    const tc = testCases.find((t) => t.testcaseId === execTestcaseId);
    if (ex && tc) return <ExecutionPanel testcase={tc} execution={ex} cycle={currentCycle} onBack={() => setExecTestcaseId(null)} />;
  }

  // Cycle detail
  if (cycleId && currentCycle) {
    const execs = Object.values(state.testExecutions).filter((e) => e.testCycleId === currentCycle.id);
    const mExecs = execs.filter((e) => e.executionType === "MANUAL");
    const p = mExecs.filter((e) => e.overallStatus === "PASS").length;
    const f = mExecs.filter((e) => e.overallStatus === "FAIL").length;
    const b = mExecs.filter((e) => e.overallStatus === "BLOCKED").length;
    const ne = testCases.length - mExecs.length;
    const cDefs = allDefects.filter((d) => d.testCycleId === currentCycle.id);
    return (
      <div className="max-w-5xl mx-auto px-6 py-10 space-y-6">
        <div>
          <button onClick={() => navigate(`/modernization/project/${project!.id}/test-cycles`)} className="text-[10px] text-muted-foreground hover:text-foreground mb-2 block">← Back to Test Cycles</button>
          <h1 className="text-lg font-semibold tracking-tight">{currentCycle.name}</h1>
          <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground flex-wrap">
            {currentCycle.release && <span>Release: {currentCycle.release}</span>}
            {currentCycle.build && <span>Build: {currentCycle.build}</span>}
            <span>Environment: {currentCycle.environment ?? "QA"}</span>
            <span>Tester: {currentCycle.tester}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[{ l: "Manual Total", v: testCases.length }, { l: "Not Executed", v: Math.max(0, ne), c: "text-muted-foreground" }, { l: "Passed", v: p, c: "text-green-400" }, { l: "Failed", v: f, c: "text-red-400" }, { l: "Blocked", v: b, c: "text-amber-400" }].map((s) => (
            <div key={s.l} className="rounded-lg border border-border bg-card p-3"><p className="text-[10px] text-muted-foreground">{s.l}</p><p className={`text-xl font-semibold ${s.c ?? ""}`}>{s.v}</p></div>
          ))}
        </div>
        {automationCases.length > 0 && (
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="text-xs font-medium mb-2"><TestTube className="inline size-3.5 mr-1" />Automation: {automationCases.length} test cases</h3>
            <p className="text-[10px] text-muted-foreground">Execute automation using your Java/Selenium framework and update results here.</p>
          </div>
        )}
        {cDefs.length > 0 && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 space-y-2">
            <h3 className="text-xs font-medium text-red-400"><AlertTriangle className="inline size-3.5 mr-1" />{cDefs.length} Defect(s) Logged</h3>
            {cDefs.map((d) => (
              <div key={d.id} className="flex items-center justify-between text-[11px]">
                <div><span className="font-mono text-[10px] text-muted-foreground">{d.defectId}</span><span className="ml-2">{d.title}</span></div>
                <span className={`text-[9px] px-1.5 py-0.5 rounded ${d.severity === "CRITICAL" || d.severity === "HIGH" ? "bg-red-500/10 text-red-400" : "bg-muted text-muted-foreground"}`}>{d.severity}</span>
              </div>
            ))}
          </div>
        )}
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="bg-card border-b border-border px-4 py-2.5"><h3 className="text-xs font-medium">Manual Test Cases ({testCases.length})</h3></div>
          <div className="max-h-[50vh] overflow-y-auto">
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-card border-b border-border">
                <tr className="text-[10px] font-medium text-muted-foreground">
                  <th className="px-3 py-2">Test Case</th><th className="px-3 py-2">Requirement</th><th className="px-3 py-2">Precondition</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 w-28">Action</th>
                </tr>
              </thead>
              <tbody>
                {testCases.map((tc) => {
                  const ex = execs.find((e) => e.testcaseId === tc.testcaseId);
                  const exSteps = ex ? Object.values(state.stepExecutions).filter((s) => s.executionId === ex.id) : [];
                  const evC = ex ? Object.values(state.testEvidence).filter((ev) => ev.executionId === ex.id).length : 0;
                  return (
                    <tr key={tc.id} className="border-b border-border/50 hover:bg-muted/30 text-[11px]">
                      <td className="px-3 py-2 font-medium">{tc.testcaseId}</td>
                      <td className="px-3 py-2 text-muted-foreground truncate max-w-[200px]">{tc.requirement}</td>
                      <td className="px-3 py-2 text-muted-foreground truncate max-w-[150px]">{tc.precondition}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[9px] px-1.5 py-0.5 rounded ${statusColor(ex?.overallStatus ?? "NOT_EXECUTED")}`}>{ex?.overallStatus?.replace(/_/g, " ") ?? "NOT EXECUTED"}</span>
                          {evC > 0 && <span className="text-[9px] text-muted-foreground">📸 {evC}</span>}
                          {exSteps.length > 0 && <span className="text-[9px] text-muted-foreground">✓ {exSteps.filter((s) => s.status === "PASS").length}/{exSteps.length}</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2"><button onClick={() => startExecution(tc.testcaseId)} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[9px] font-medium hover:bg-muted transition-colors"><Play className="size-2.5" /> {ex ? "Re-execute" : "Execute"}</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // New cycle form
  if (showNew) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-10 space-y-6">
        <div><h1 className="text-lg font-semibold tracking-tight">Create Test Cycle</h1><p className="mt-1 text-xs text-muted-foreground">Configure a new test execution cycle</p></div>
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div><label className="text-[10px] font-medium text-muted-foreground mb-1 block">Cycle Name *</label><input placeholder="e.g., Regression Cycle 01" value={cycleName} onChange={(e) => setCycleName(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring" autoFocus /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-[10px] font-medium text-muted-foreground mb-1 block">Release</label><input placeholder="e.g., MOD-1.4" value={release} onChange={(e) => setRelease(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring" /></div>
            <div><label className="text-[10px] font-medium text-muted-foreground mb-1 block">Build</label><input placeholder="e.g., MOD-2026.08.22.01" value={build} onChange={(e) => setBuild(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-[10px] font-medium text-muted-foreground mb-1 block">Environment</label><select value={environment} onChange={(e) => setEnvironment(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring">{["QA", "SIT", "UAT", "STAGING", "PROD", "DEV"].map((env) => <option key={env} value={env}>{env}</option>)}</select></div>
            <div><label className="text-[10px] font-medium text-muted-foreground mb-1 block">Tester</label><input placeholder="Tester name" value={tester} onChange={(e) => setTester(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring" /></div>
          </div>
          <div><label className="text-[10px] font-medium text-muted-foreground mb-1 block">Notes (optional)</label><textarea placeholder="Any notes about this test cycle..." value={cycleNotes} onChange={(e) => setCycleNotes(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring min-h-[60px]" /></div>
          <div className="flex gap-2 pt-2">
            <button onClick={createCycle} disabled={!cycleName.trim()} className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-4 py-2 text-[11px] font-medium text-background hover:opacity-90 disabled:opacity-50 transition-opacity"><Plus className="size-3" /> Create Cycle</button>
            <button onClick={() => setShowNew(false)} className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  // Cycle list
  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-lg font-semibold tracking-tight">Test Cycles</h1><p className="mt-1 text-xs text-muted-foreground">{cycles.length} test cycles · {testCases.length} manual cases · {automationCases.length} automation cases</p></div>
        <button onClick={() => setShowNew(true)} className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-[11px] font-medium text-background hover:opacity-90 transition-opacity"><Plus className="size-3" /> New Cycle</button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[{ l: "Test Cycles", v: cycles.length }, { l: "Manual Cases", v: testCases.length }, { l: "Automation Cases", v: automationCases.length }, { l: "Total Defects", v: allDefects.length }].map((s) => (
          <div key={s.l} className="rounded-lg border border-border bg-card p-3"><p className="text-[10px] text-muted-foreground">{s.l}</p><p className="text-lg font-semibold">{s.v}</p></div>
        ))}
      </div>
      {cycles.length === 0 ? (
        <div className="rounded-lg border border-border border-dashed bg-card p-10 text-center">
          <TestTube className="mx-auto size-6 text-muted-foreground/40" />
          <p className="mt-2 text-xs text-muted-foreground">No test cycles yet. Create one to start executing test cases.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {cycles.map((cycle) => {
            const cExecs = Object.values(state.testExecutions).filter((e) => e.testCycleId === cycle.id);
            const cp = cExecs.filter((e) => e.overallStatus === "PASS").length;
            const cf = cExecs.filter((e) => e.overallStatus === "FAIL").length;
            const cdc = allDefects.filter((d) => d.testCycleId === cycle.id).length;
            return (
              <button key={cycle.id} onClick={() => navigate(`/modernization/project/${project!.id}/test-cycles/${cycle.id}`)} className="w-full text-left rounded-lg border border-border bg-card px-4 py-3 hover:border-muted-foreground/20 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-medium">{cycle.name}</p>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded ${statusColor(cycle.status === "IN_PROGRESS" ? "BLOCKED" : cycle.status === "COMPLETED" ? "PASS" : "NOT_EXECUTED")}`}>{cycle.status.replace(/_/g, " ")}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground flex-wrap">
                      {cycle.release && <span>{cycle.release}</span>}
                      {cycle.build && <span>Build: {cycle.build}</span>}
                      <span>Env: {cycle.environment ?? "QA"}</span>
                      <span>{cycle.tester}</span>
                      <span>{formatTime(cycle.createdAt)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0 ml-4 text-[10px]">
                    <div className="text-center"><p className="font-semibold">{cExecs.length}</p><p className="text-muted-foreground">Executions</p></div>
                    <div className="text-center"><p className="font-semibold text-green-400">{cp}</p><p className="text-muted-foreground">Passed</p></div>
                    <div className="text-center"><p className="font-semibold text-red-400">{cf}</p><p className="text-muted-foreground">Failed</p></div>
                    {cdc > 0 && <div className="text-center"><p className="font-semibold text-amber-400">{cdc}</p><p className="text-muted-foreground">Defects</p></div>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
