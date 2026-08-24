import { useCallback, useState } from "react";
import { motion } from "framer-motion";
import { FileSpreadsheet, History, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OptimizerApp } from "@eo/components/optimizer/OptimizerApp";
import { formatNumber } from "@eo/components/optimizer/utils";
import type { OptimizationReport } from "@eo/lib/excel";
import { Link } from "react-router";

interface HistoryEntry {
  id: string;
  inputFileName: string;
  outputFileName: string;
  at: string;
  elapsedMs: number;
  cellsStandardized: number;
  tablesOptimized: number;
  formulasAfter: number;
  validation: "PASSED" | "FAILED";
}

const HISTORY_KEY = "excel-optimizer:history:v1";
const MAX_ENTRIES = 6;

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HistoryEntry[];
    return Array.isArray(parsed) ? parsed.slice(0, MAX_ENTRIES) : [];
  } catch {
    return [];
  }
}

function saveHistory(entries: HistoryEntry[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    // Storage unavailable — history simply won't persist.
  }
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(then).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function Dashboard() {
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory);

  const handleOptimized = useCallback((report: OptimizationReport) => {
    const entry: HistoryEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      inputFileName: report.inputFileName,
      outputFileName: report.outputFileName,
      at: new Date().toISOString(),
      elapsedMs: report.elapsedMs,
      cellsStandardized: report.cellsStandardized,
      tablesOptimized: report.tablesOptimized,
      formulasAfter: report.formulasAfter,
      validation: report.validation,
    };
    setHistory((prev) => {
      const next = [entry, ...prev].slice(0, MAX_ENTRIES);
      saveHistory(next);
      return next;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    saveHistory([]);
  }, []);

  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* ------------------------------ Header ------------------------------ */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5">
          <a href="/" className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-brand text-brand-foreground">
              <FileSpreadsheet className="size-4.5" strokeWidth={1.9} />
            </span>
            <span className="text-[15px] font-semibold tracking-tight">Excel Optimizer</span>
          </a>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1.5 rounded-full border border-border/70 bg-muted/40 px-3 py-1 text-[11px] font-medium text-muted-foreground sm:inline-flex">
              <ShieldCheck className="size-3.5 text-brand" />
              100% in-browser · nothing uploaded
            </span>
            <Link to="/">
              <Button variant="outline" size="sm" className="cursor-pointer">
                Home
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl px-5 py-10">
        {/* ------------------------------ Intro ----------------------------- */}
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">
              Workspace
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Optimize workbooks, keep every formula
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Drop in a workbook and the engine formats titles, tables, totals and number columns
              with a consistent professional style — while preserving every value, formula, chart,
              pivot table and merge.
            </p>
          </div>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="flex shrink-0 items-center gap-2 rounded-xl border border-brand/20 bg-brand/5 px-4 py-3 text-xs font-medium text-brand"
          >
            <Sparkles className="size-4" />
            Free · private · no AI required
          </motion.div>
        </div>

        {/* ------------------------------ Main ------------------------------ */}
        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
          <div className="rounded-3xl border border-border/70 bg-card/50 p-4 shadow-xl shadow-black/[0.03] sm:p-6">
            <OptimizerApp onOptimized={handleOptimized} />
          </div>

          {/* ----------------------------- Aside ----------------------------- */}
          <aside className="space-y-6">
            <section className="rounded-2xl border border-border/70 bg-card/60 p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
                  <History className="size-4 text-brand" />
                  Recent optimizations
                </h2>
                {history.length > 0 && (
                  <button
                    type="button"
                    onClick={clearHistory}
                    className="cursor-pointer text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  >
                    Clear
                  </button>
                )}
              </div>

              {history.length === 0 ? (
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  No optimizations yet. Completed runs appear here — only summary stats are stored
                  on this device, never your workbook contents.
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-border/50">
                  {history.map((h) => (
                    <li key={h.id} className="py-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 truncate text-sm font-medium text-foreground">
                          {h.inputFileName}
                        </p>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {timeAgo(h.at)}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        → {h.outputFileName}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                          {formatNumber(h.cellsStandardized)} cells styled
                        </span>
                        <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                          {formatNumber(h.tablesOptimized)} tables
                        </span>
                        <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-emerald-600">
                          ✓ {formatNumber(h.formulasAfter)} formulas intact
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-2xl border border-brand/20 bg-gradient-to-br from-brand/[0.06] to-card p-5">
              <h2 className="text-sm font-semibold tracking-tight">What stays untouched</h2>
              <ul className="mt-3 space-y-2 text-xs leading-relaxed text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" />
                  Cell values, text and every formula — verified byte-for-byte before delivery
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" />
                  Charts, pivot tables, images, merges, hyperlinks and macros
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" />
                  Sheet names, order and hidden/visible state
                </li>
              </ul>
              <p className="mt-4 flex items-center gap-1.5 text-[11px] font-medium text-brand">
                <ShieldCheck className="size-3.5" />
                If validation fails, no file is produced.
              </p>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
