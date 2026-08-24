import { useCallback, useState } from "react";
import { motion } from "framer-motion";
import {
  BadgeCheck,
  Check,
  ClipboardCopy,
  Download,
  FileSpreadsheet,
  Lock,
  RefreshCcw,
  ShieldCheck,
  Sigma,
  BarChart3,
  Grid3X3,
  Image as ImageIcon,
  FileArchive,
  LayoutGrid,
  Sparkles,
  Type,
  Images,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LucideIcon } from "lucide-react";
import type { OptimizationReport } from "@eo/lib/excel";
import { downloadBlob, formatBytes, formatNumber } from "./utils";
import { debugLog } from "@eo/lib/excel";

interface Props {
  report: OptimizationReport;
  blob: Blob;
  downloadName: string;
  /** Exact bytes of the uploaded original — lets the user A/B test whether
   * Excel accepts the untouched file or only the optimized one. */
  originalBlob?: Blob;
  originalName?: string;
  onReset: () => void;
}

function Bullet({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <li className="flex items-start gap-3 py-2">
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600">
        <Check className="size-3.5" strokeWidth={2.5} />
      </span>
      <span className="flex items-center gap-2 text-sm text-foreground/85">
        <Icon className="size-4 text-muted-foreground" strokeWidth={1.7} />
        <span className="flex-1">{label}</span>
        <span className="font-semibold tabular-nums text-foreground">{value}</span>
      </span>
    </li>
  );
}

export function ReportView({ report, blob, downloadName, originalBlob, originalName, onReset }: Props) {
  const [copied, setCopied] = useState(false);

  const copyDiagnostics = useCallback(async () => {
    const lines = [
      "Excel Optimizer — download diagnostics",
      `Input file: ${report.inputFileName}`,
      `Output file: ${report.outputFileName}`,
      `Format: ${report.inputFormat}${report.convertedFromLegacy ? " (converted from legacy .xls)" : ""}`,
      `Validation: ${report.validation}${report.failedReason ? ` — ${report.failedReason}` : ""}`,
      `Sheets: ${report.sheetsTotal} (${report.sheetsProcessed} optimized, ${report.sheetsSkippedEmpty} empty)`,
      `Cells standardized: ${formatNumber(report.cellsStandardized)}`,
      `Headings title-cased: ${formatNumber(report.headingsTitleCased)}`,
      `Screenshots repositioned: ${formatNumber(report.imagesReSpaced)}`,
      `Image overlaps: ${report.imageOverlapsBefore} → ${report.imageOverlapsAfter}`,
      `Content/image conflicts: ${report.imageContentConflictsBefore} → ${report.imageContentConflictsAfter}`,
      `Images grouped: ${formatNumber(report.imagesGrouped)}`,
      `Formulas: ${report.formulasBefore} → ${report.formulasAfter}`,
      `Charts: ${report.chartsAfter} · Pivots: ${report.pivotTablesAfter} · Images: ${report.imagesAfter} · Merges: ${report.mergedRangesAfter}`,
      `Macros preserved: ${report.macrosPreserved}`,
      `Elapsed: ${(report.elapsedMs / 1000).toFixed(1)}s`,
      ...report.warnings.map((w) => `Warning: ${w}`),
      ...(report.audit ?? []).map((a) => `AUDIT | ${a}`),
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be unavailable; fall back to a prompt.
      window.prompt("Copy diagnostics:", lines.join("\n"));
    }
  }, [report]);

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="space-y-6">
      <div className="text-center">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 220, damping: 16, delay: 0.05 }}
          className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-600"
        >
          <BadgeCheck className="size-7" strokeWidth={1.8} />
        </motion.div>
        <h2 className="mt-4 text-xl font-semibold tracking-tight">Optimization complete</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{report.inputFileName}</span> →{" "}
          <span className="font-medium text-foreground">{report.outputFileName}</span>
        </p>
        <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1.5 text-xs font-semibold text-emerald-600">
          <ShieldCheck className="size-4" />
          Validation status: {report.validation}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border/70 bg-card/50 p-5">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Sparkles className="size-4 text-brand" />
            Formatting improvements
          </h3>
          <ul className="divide-y divide-border/40">
            <Bullet icon={FileSpreadsheet} label="Cells standardized" value={formatNumber(report.cellsStandardized)} />
            <Bullet icon={FileArchive} label="Column widths optimized" value={formatNumber(report.columnsOptimized)} />
            <Bullet icon={LayoutGrid} label="Row heights optimized" value={formatNumber(report.rowsHeightOptimized)} />
            <Bullet icon={Sparkles} label="Headings formatted" value={formatNumber(report.headingsFormatted)} />
            {report.headingsTitleCased > 0 && (
              <Bullet icon={Type} label="Headings title-cased" value={formatNumber(report.headingsTitleCased)} />
            )}
            {report.imagesReSpaced > 0 && (
              <Bullet icon={Images} label="Screenshots repositioned" value={formatNumber(report.imagesReSpaced)} />
            )}
            {report.imageOverlapsBefore > 0 && (
              <Bullet icon={Images} label="Image overlaps fixed" value={`${formatNumber(report.imageOverlapsBefore - report.imageOverlapsAfter)} of ${formatNumber(report.imageOverlapsBefore)}`} />
            )}
            {report.imageContentConflictsBefore > 0 && (
              <Bullet icon={Images} label="Content/image conflicts fixed" value={`${formatNumber(report.imageContentConflictsBefore - report.imageContentConflictsAfter)} of ${formatNumber(report.imageContentConflictsBefore)}`} />
            )}
            {report.imagesGrouped > 0 && (
              <Bullet icon={Images} label="Images grouped" value={formatNumber(report.imagesGrouped)} />
            )}
            <Bullet icon={Grid3X3} label="Tables optimized" value={formatNumber(report.tablesOptimized)} />
            <Bullet icon={Sigma} label="Total / subtotal rows" value={`${formatNumber(report.totalRowsFormatted)} / ${formatNumber(report.subtotalRowsFormatted)}`} />
          </ul>
        </div>

        <div className="rounded-xl border border-border/70 bg-card/50 p-5">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Lock className="size-4 text-brand" />
            Protected — untouched
          </h3>
          <ul className="divide-y divide-border/40">
            <Bullet icon={Sigma} label="Formulas preserved" value={formatNumber(report.formulasAfter)} />
            <Bullet icon={BarChart3} label="Charts preserved" value={formatNumber(report.chartsAfter)} />
            <Bullet icon={Grid3X3} label="Pivot tables preserved" value={formatNumber(report.pivotTablesAfter)} />
            <Bullet icon={ImageIcon} label="Images preserved" value={formatNumber(report.imagesAfter)} />
            <Bullet icon={FileArchive} label="Merged ranges preserved" value={formatNumber(report.mergedRangesAfter)} />
            <Bullet icon={LayoutGrid} label="Worksheets preserved" value={formatNumber(report.worksheetsPreserved)} />
          </ul>
          {report.macrosPreserved && (
            <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50/70 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
              <Check className="mt-0.5 size-3.5 shrink-0" strokeWidth={2.5} />
              VBA macros preserved — the output remains a macro-enabled .xlsm workbook
            </p>
          )}
        </div>
      </div>

      {/* Drawing Analysis — per-sheet image diagnostics */}
      {report.drawingAnalysis && report.drawingAnalysis.some((d) => d.hasDrawing) && (
        <div className="rounded-xl border border-border/70 bg-card/50 p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Images className="size-4 text-brand" />
            Screenshot / Drawing Analysis
          </h3>
          <div className="space-y-3">
            {report.drawingAnalysis
              .filter((d) => d.hasDrawing)
              .map((d) => (
                <div key={d.sheetName} className="rounded-lg border border-border/40 bg-muted/30 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">{d.sheetName}</span>
                    <div className="flex gap-2 text-[10px] font-medium">
                      <span className="rounded bg-blue-100 px-1.5 py-0.5 text-blue-700">
                        {d.imageCount} image{d.imageCount !== 1 ? "s" : ""}
                      </span>
                      {d.overlapCount > 0 && (
                        <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-700">
                          {d.overlapCount} overlap{d.overlapCount !== 1 ? "s" : ""}
                        </span>
                      )}
                      {d.contentConflictCount > 0 && (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-700">
                          {d.contentConflictCount} content conflict{d.contentConflictCount !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </div>
                  {d.anchors.length > 0 && (
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full text-[10px] leading-tight">
                        <thead>
                          <tr className="text-left text-muted-foreground">
                            <th className="pr-2">#</th>
                            <th className="pr-2">From (col,row)</th>
                            <th className="pr-2">To (col,row)</th>
                            <th className="pr-2">Size (EMU)</th>
                            <th className="pr-2">Overlap</th>
                            <th>Content?</th>
                          </tr>
                        </thead>
                        <tbody>
                          {d.anchors.map((a) => (
                            <tr key={a.index} className="border-t border-border/20">
                              <td className="pr-2 tabular-nums">{a.index}</td>
                              <td className="pr-2 tabular-nums">({a.fromCol},{a.fromRow})</td>
                              <td className="pr-2 tabular-nums">({a.toCol},{a.toRow})</td>
                              <td className="pr-2 tabular-nums">{a.widthEmu}×{a.heightEmu}</td>
                              <td className="pr-2">
                                {a.overlapsWith.length > 0 ? (
                                  <span className="text-red-600">[{a.overlapsWith.join(",")}]</span>
                                ) : (
                                  <span className="text-emerald-600">none</span>
                                )}
                              </td>
                              <td>
                                {a.overlapsContent ? (
                                  <span className="text-amber-600">YES</span>
                                ) : (
                                  <span className="text-emerald-600">no</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      {report.convertedFromLegacy && (
        <p className="rounded-xl border border-amber-200/60 bg-amber-50/60 px-4 py-3 text-xs leading-relaxed text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
          This legacy .xls file was converted to the modern .xlsx format. Cell data, formulas, merges and basic formats were
          preserved; charts, pivot tables and images embedded in legacy files cannot be carried over.
        </p>
      )}

      <div className="flex flex-col items-center gap-3">
        <Button
          size="lg"
          className="h-11 cursor-pointer px-8 text-sm"
          onClick={() => downloadBlob(blob, downloadName)}
        >
          <Download className="size-4.5" />
          Download optimized Excel
        </Button>
        <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
          <span>Processed in {(report.elapsedMs / 1000).toFixed(1)}s</span>
          <span>·</span>
          <span>Original file untouched</span>
          <span>·</span>
          <span>Nothing was uploaded</span>
        </div>
        {originalBlob && originalName && (
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
            <Button
              variant="outline"
              size="sm"
              className="cursor-pointer"
              onClick={() => downloadBlob(originalBlob, originalName)}
            >
              <FileArchive className="size-3.5" />
              Download original (unchanged) — {formatBytes(originalBlob.size)}
            </Button>
            <Button variant="ghost" size="sm" className="cursor-pointer" onClick={copyDiagnostics}>
              <ClipboardCopy className="size-3.5" />
              {copied ? "Copied!" : "Copy diagnostics"}
            </Button>
            <Button variant="ghost" size="sm" className="cursor-pointer" onClick={() => debugLog.download()}
              title="Download detailed optimization log for debugging">
              <FileArchive className="size-3.5" />
              Download debug log
            </Button>
          </div>
        )}
        <button
          type="button"
          onClick={onReset}
          className="mt-1 inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          <RefreshCcw className="size-3.5" />
          Optimize another workbook
        </button>
      </div>
    </motion.div>
  );
}
