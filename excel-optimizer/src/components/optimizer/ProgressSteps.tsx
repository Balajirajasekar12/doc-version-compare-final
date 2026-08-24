import { motion } from "framer-motion";
import { Check, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { ProgressUpdate } from "@eo/lib/excel";

const STEPS: { key: string; label: string }[] = [
  { key: "reading", label: "Reading workbook" },
  { key: "analyzing", label: "Analyzing worksheets" },
  { key: "detecting", label: "Detecting tables & structure" },
  { key: "formatting", label: "Normalizing formatting" },
  { key: "layouts", label: "Optimizing widths, heights & layout" },
  { key: "validating", label: "Validating formulas & structure" },
  { key: "generating", label: "Generating optimized workbook" },
];

interface Props {
  progress: ProgressUpdate;
}

export function ProgressSteps({ progress }: Props) {
  const currentIdx = STEPS.findIndex((s) => s.key === progress.stage);
  const pct = Math.max(4, Math.min(100, progress.pct));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Optimizing your workbook</h2>
        <p className="mt-1 text-sm text-muted-foreground">{progress.label}</p>
      </div>

      <Progress value={pct} className="h-2" />

      <ul className="space-y-1.5">
        {STEPS.map((step, i) => {
          const done = i < currentIdx || progress.stage === "done";
          const active = i === currentIdx;
          return (
            <motion.li
              key={step.key}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                active ? "bg-brand/5 font-medium text-foreground" : done ? "text-foreground/80" : "text-muted-foreground/70"
              }`}
            >
              <span
                className={`flex size-5 shrink-0 items-center justify-center rounded-full ${
                  done ? "bg-emerald-500/15 text-emerald-600" : active ? "bg-brand/15 text-brand" : "border border-border"
                }`}
              >
                {done ? (
                  <Check className="size-3.5" strokeWidth={2.5} />
                ) : active ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <span className="size-1 rounded-full bg-muted-foreground/40" />
                )}
              </span>
              {step.label}
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}
