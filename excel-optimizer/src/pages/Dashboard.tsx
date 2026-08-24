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
    <main className="min-h-screen bg-gray-50 text-gray-900">
      {/* ------------------------------ Header ------------------------------ */}
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5">
          <a href="/" className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-blue-600 text-white">
              <FileSpreadsheet className="size-4.5" strokeWidth={1.9} />
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-gray-900">Excel Optimizer</span>
          </a>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1.5 rounded-full border border-gray-200 bg-blue-50 px-3 py-1 text-[11px] font-medium text-blue-700 sm:inline-flex">
              <ShieldCheck className="size-3.5 text-blue-600" />
              100% in-browser · nothing uploaded
            </span>
            <Link to="/">
              <Button variant="outline" size="sm" className="cursor-pointer border-gray-200 text-gray-700 hover:bg-gray-100">
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
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
              Workspace
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Optimize workbooks, keep every formula
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-gray-500 sm:text-base">
              Drop in a workbook and the engine formats titles, tables, totals and number columns
              with a consistent professional style — while preserving every value, formula, chart,
              pivot table and merge.
            </p>
          </div>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="flex shrink-0 items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-medium text-blue-700"
          >
            <Sparkles className="size-4" />
            Free · private · no AI required
          </motion.div>
        </div>

        {/* ------------------------------ Main ------------------------------ */}
        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
          <div className="rounded-3xl border border-gray-200 bg-white p-4 shadow-xl shadow-black/[0.03] sm:p-6">
            <OptimizerApp onOptimized={handleOptimized} />
          </div>

          {/* ----------------------------- Aside ----------------------------- */}
          <aside className="space-y-6">
            <section className="rounded-2xl border border-gray-200 bg-white p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-gray-900">
                  <History className="size-4 text-blue-600" />
                  Recent optimizations
                </h2>
                {history.length > 0 && (
                  <button
                    type="button"
                    onClick={clearHistory}
                    className="cursor-pointer text-xs font-medium text-gray-400 underline-offset-2 hover:text-gray-900 hover:underline"
                  >
                    Clear
                  </button>
                )}
              </div>

              {history.length === 0 ? (
                <p className="mt-3 text-sm leading-relaxed text-gray-500">
                  No optimizations yet. Completed runs appear here — only summary stats are stored
                  on this device, never your workbook contents.
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-gray-100">
                  {history.map((h) => (
                    <li key={h.id} className="py-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 truncate text-sm font-medium text-gray-900">
                          {h.inputFileName}
                        </p>
                        <span className="shrink-0 text-[11px] text-gray-400">
                          {timeAgo(h.at)}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-gray-500">
                        → {h.outputFileName}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-gray-600">
                          {formatNumber(h.cellsStandardized)} cells styled
                        </span>
                        <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-gray-600">
                          {formatNumber(h.tablesOptimized)} tables
                        </span>
                        <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-emerald-700">
                          ✓ {formatNumber(h.formulasAfter)} formulas intact
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-5">
              <h2 className="text-sm font-semibold tracking-tight text-gray-900">What stays untouched</h2>
              <ul className="mt-3 space-y-2 text-xs leading-relaxed text-gray-500">
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-blue-500" />
                  Cell values, text and every formula — verified byte-for-byte before delivery
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-blue-500" />
                  Charts, pivot tables, images, merges, hyperlinks and macros
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-blue-500" />
                  Sheet names, order and hidden/visible state
                </li>
              </ul>
              <p className="mt-4 flex items-center gap-1.5 text-[11px] font-medium text-blue-600">
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
