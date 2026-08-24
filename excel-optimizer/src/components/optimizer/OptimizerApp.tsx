import { useCallback, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, FileWarning, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createSession, runOptimization, type OptimizationReport, type ProgressUpdate, type WorkSession } from "@eo/lib/excel";
import { DEFAULT_SETTINGS, type OptimizerSettings } from "@eo/lib/excel";
import { UploadZone } from "./UploadZone";
import { AnalysisView } from "./AnalysisView";
import { SettingsPanel } from "./SettingsPanel";
import { ProgressSteps } from "./ProgressSteps";
import { ReportView } from "./ReportView";

type Phase = "idle" | "analyzing" | "analyzed" | "running" | "done" | "error";

interface SessionState {
  session: WorkSession;
  fileSize: number;
}

interface Props {
  /** Called once when an optimization completes successfully (e.g. for history). */
  onOptimized?: (report: OptimizationReport) => void;
}

export function OptimizerApp({ onOptimized }: Props = {}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [settings, setSettings] = useState<OptimizerSettings>(DEFAULT_SETTINGS);
  const [progress, setProgress] = useState<ProgressUpdate>({ stage: "reading", label: "Reading workbook…", pct: 4 });
  const [sessionState, setSessionState] = useState<SessionState | null>(null);
  const [result, setResult] = useState<{ report: OptimizationReport; blob: Blob; downloadName: string } | null>(null);
  const [error, setError] = useState<{ title: string; detail: string } | null>(null);
  const runToken = useRef(0);

  const reset = useCallback(() => {
    runToken.current++;
    setPhase("idle");
    setSessionState(null);
    setResult(null);
    setError(null);
    setSettings(DEFAULT_SETTINGS);
  }, []);

  const handleFile = useCallback(async (file: File) => {
    const token = ++runToken.current;
    setError(null);
    setPhase("analyzing");
    setProgress({ stage: "reading", label: "Reading workbook…", pct: 6 });
    try {
      const session = await createSession(file, (p) => {
        if (runToken.current === token) setProgress(p);
      });
      if (runToken.current !== token) return;
      setSessionState({ session, fileSize: file.size });
      setPhase("analyzed");
    } catch (e) {
      if (runToken.current !== token) return;
      setError(toError(e));
      setPhase("error");
    }
  }, []);

  const handleOptimize = useCallback(async () => {
    if (!sessionState) return;
    const token = ++runToken.current;
    setError(null);
    setPhase("running");
    setProgress({ stage: "reading", label: "Optimizing workbook…", pct: 4 });
    try {
      const res = await runOptimization(sessionState.session, settings, (p) => {
        if (runToken.current === token) setProgress(p);
      });
      if (runToken.current !== token) return;
      if (res.report.ok && res.blob && res.downloadName) {
        setResult({ report: res.report, blob: res.blob, downloadName: res.downloadName });
        setPhase("done");
        onOptimized?.(res.report);
      } else {
        setError({
          title: "Optimization could not be safely completed",
          detail: res.report.failedReason ?? "Validation detected an unexpected change. Your original workbook was not modified.",
        });
        setPhase("error");
      }
    } catch (e) {
      if (runToken.current !== token) return;
      setError(toError(e));
      setPhase("error");
    }
  }, [sessionState, settings]);

  return (
    <div className="w-full">
      <AnimatePresence mode="wait">
        {phase === "idle" && (
          <motion.div key="upload" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3 }}>
            <UploadZone onFile={handleFile} />
          </motion.div>
        )}

        {phase === "analyzing" && (
          <motion.div key="analyzing" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3 }}>
            <AnalyzingCard progress={progress} />
          </motion.div>
        )}

        {phase === "analyzed" && sessionState && (
          <motion.div key="analyzed" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3 }} className="space-y-8">
            <AnalysisView analysis={sessionState.session.analysis} fileSize={sessionState.fileSize} />
            <div className="border-t border-border/60 pt-8">
              <SettingsPanel settings={settings} onChange={setSettings} />
            </div>
            <div className="flex flex-col items-center gap-3 pt-2">
              <Button size="lg" className="h-12 cursor-pointer px-10 text-base" onClick={handleOptimize}>
                <ArrowRight className="size-5" />
                Optimize Excel
              </Button>
              <button
                type="button"
                onClick={reset}
                className="cursor-pointer text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Choose a different file
              </button>
            </div>
          </motion.div>
        )}

        {phase === "running" && (
          <motion.div key="running" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3 }}>
            <ProgressSteps progress={progress} />
          </motion.div>
        )}

        {phase === "done" && result && (
          <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
            <ReportView
              report={result.report}
              blob={result.blob}
              downloadName={result.downloadName}
              originalBlob={sessionState ? new Blob([sessionState.session.originalBytes]) : undefined}
              originalName={sessionState ? sessionState.session.fileName : undefined}
              onReset={reset}
            />
          </motion.div>
        )}

        {phase === "error" && error && (
          <motion.div key="error" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3 }} className="space-y-5">
            <ErrorCard title={error.title} detail={error.detail} onReset={reset} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function toError(e: unknown): { title: string; detail: string } {
  if (e instanceof Error) {
    const detail = (e as Error & { detail?: string }).detail;
    return { title: e.message, detail: detail ?? "We could not safely process this workbook. Your original file has not been modified." };
  }
  return { title: "Something went wrong", detail: "We could not safely process this workbook. Your original file has not been modified." };
}

function AnalyzingCard({ progress }: { progress: ProgressUpdate }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-border/70 bg-card/60 px-6 py-14 text-center">
      <div className="flex size-12 items-center justify-center rounded-xl bg-brand/10 text-brand">
        <Loader2 className="size-6 animate-spin" strokeWidth={1.8} />
      </div>
      <p className="text-base font-semibold tracking-tight">{progress.label}</p>
      <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5 text-brand" />
        Processing locally — your file never leaves this device
      </p>
    </div>
  );
}

function ErrorCard({ title, detail, onReset }: { title: string; detail: string; onReset: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-destructive/25 bg-destructive/5 px-6 py-12 text-center">
      <div className="flex size-12 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
        <FileWarning className="size-6" strokeWidth={1.8} />
      </div>
      <div className="space-y-1.5">
        <h3 className="text-base font-semibold tracking-tight">{title}</h3>
        <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">{detail}</p>
      </div>
      <Button variant="outline" className="cursor-pointer" onClick={onReset}>
        Try another workbook
      </Button>
    </div>
  );
}
