import { Button } from "@/components/ui/button";
import {
  ValidatorProvider,
  useValidator,
  type ValidatorStage,
} from "@/context/ValidatorContext";
import { DiffExplorer } from "@/components/validator/DiffExplorer";
import { DebugPanel } from "@/components/validator/DebugPanel";
import { GroupReview } from "@/components/validator/GroupReview";
import { InputPicker } from "@/components/validator/InputPicker";
import { PrivacyPanel } from "@/components/validator/PrivacyPanel";
import { RulesPanel } from "@/components/validator/RulesPanel";
import { endSession, getSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import {
  FileCheck2,
  FileUp,
  FolderTree,
  GitCompareArrows,
  Lock,
  LogOut,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { useNavigate } from "react-router";
import { useState } from "react";
import { toast } from "sonner";

const STEPS: Array<{ id: ValidatorStage; label: string; icon: typeof FileUp }> = [
  { id: "input", label: "Select documents", icon: FileUp },
  { id: "groups", label: "Review groups", icon: FolderTree },
  { id: "diffs", label: "Review differences", icon: GitCompareArrows },
];

function StageStepper() {
  const { stage, setStage, docs, stats } = useValidator();

  const canGo = (id: ValidatorStage): boolean => {
    if (id === "input") return true;
    if (id === "groups") return docs.length > 0;
    return stats.comparableGroups > 0;
  };

  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {STEPS.map((step, i) => {
        const active = stage === step.id;
        const reachable = canGo(step.id);
        return (
          <div key={step.id} className="flex items-center gap-1">
            {i > 0 && <div className="h-px w-6 shrink-0 bg-white/10 sm:w-10" />}
            <button
              type="button"
              disabled={!reachable}
              onClick={() => setStage(step.id)}
              className={cn(
                "flex shrink-0 cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "border-amber-400/60 bg-amber-400/10 text-amber-300"
                  : reachable
                    ? "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/20 hover:text-white"
                    : "cursor-not-allowed border-white/5 bg-transparent text-slate-600",
              )}
            >
              <step.icon className="size-3.5" />
              <span className="hidden sm:inline">{step.label}</span>
              <span className="sm:hidden">{step.label.split(" ")[1] ?? step.label}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

type View = "validator" | "rules" | "privacy";

const VIEWS: Array<{ id: View; label: string }> = [
  { id: "validator", label: "Validator" },
  { id: "rules", label: "Ignore rules" },
  { id: "privacy", label: "Privacy" },
];

function DashboardInner() {
  const navigate = useNavigate();
  const { resetSession, docs, stage } = useValidator();
  const session = getSession();
  const [view, setView] = useState<View>("validator");

  const handleEndSession = () => {
    resetSession();
    toast.success("Session ended", {
      description: "All parsed document data discarded from memory.",
    });
  };

  const handleSignOut = () => {
    endSession();
    navigate("/", { replace: true });
  };

  return (
    <div className="dark min-h-screen bg-[#07090d] text-slate-200 antialiased selection:bg-amber-400/30">
      {/* Background grid */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(ellipse 80% 60% at 50% 0%, black 40%, transparent 100%)",
        }}
      />

      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-[#07090d]/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <a href="/" className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-amber-400 text-[#07090d]">
              <FileCheck2 className="size-4" />
            </div>
            <span className="hidden text-sm font-semibold tracking-tight sm:inline">
              Document Version <span className="text-amber-400">Validator</span>
            </span>
          </a>

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300 lg:flex">
              <span className="size-1.5 rounded-full bg-emerald-400" />
              Local-only
            </span>
            {session ? (
              <span className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-slate-300 md:flex">
                <ShieldCheck className="size-3 text-amber-400" />
                Signed in · local session
              </span>
            ) : (
              <Button
                asChild
                variant="outline"
                className="h-8 gap-1.5 rounded-lg border-white/15 bg-white/[0.03] px-3 text-xs text-slate-200 hover:bg-white/[0.07] hover:text-white"
              >
                <a href="/auth?returnTo=%2Fdashboard">
                  <Lock className="size-3" />
                  Sign in
                </a>
              </Button>
            )}
            {docs.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleEndSession}
                className="h-8 gap-1.5 rounded-lg px-3 text-xs text-slate-400 hover:text-white"
              >
                <RotateCcw className="size-3" />
                <span className="hidden sm:inline">End session</span>
              </Button>
            )}
            {session && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleSignOut}
                className="h-8 gap-1.5 rounded-lg px-3 text-xs text-slate-400 hover:text-white"
                title="Sign out"
              >
                <LogOut className="size-3" />
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
              Validation workspace
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Everything runs in your browser — documents are never uploaded.
            </p>
          </div>
          <StageStepper />
        </div>

        <div className="mt-6">
          <div className="flex w-fit items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setView(v.id)}
                className={cn(
                  "cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  view === v.id
                    ? "bg-amber-400 text-[#07090d] shadow-sm"
                    : "text-slate-400 hover:text-white",
                )}
              >
                {v.label}
              </button>
            ))}
          </div>

          <div className="mt-5">
            {view === "validator" && (
              <>
                {stage === "input" && <InputPicker />}
                {stage === "groups" && <GroupReview />}
                {stage === "diffs" && (
                  <div className="space-y-4">
                    <DiffExplorer />
                    <DebugPanel />
                  </div>
                )}
              </>
            )}
            {view === "rules" && <RulesPanel />}
            {view === "privacy" && <PrivacyPanel />}
          </div>
        </div>
      </main>

      <footer className="relative border-t border-white/5">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 sm:px-6">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <FileCheck2 className="size-3.5 text-amber-400" />
            Document Version Validator — zero-upload comparison engine
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <Lock className="size-3.5" />
              SHA-256 fingerprints only
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="size-3.5" />
              Free · no APIs
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function Dashboard() {
  return (
    <ValidatorProvider>
      <DashboardInner />
    </ValidatorProvider>
  );
}
