import { motion } from "framer-motion";
import {
  AlertTriangle,
  FileSpreadsheet,
  Table2,
  LayoutGrid,
  Sigma,
  BarChart3,
  Grid3X3,
  Image as ImageIcon,
  EyeOff,
  FileArchive,
  ShieldCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { WorkbookAnalysis } from "@eo/lib/excel";
import { formatBytes, formatNumber } from "./utils";

interface Props {
  analysis: WorkbookAnalysis;
  fileSize: number;
}

function Stat({ icon: Icon, label, value, accent }: { icon: LucideIcon; label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border/70 bg-card/60 px-4 py-3.5">
      <div className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg ${accent ? "bg-brand/10 text-brand" : "bg-muted text-muted-foreground"}`}>
        <Icon className="size-4.5" strokeWidth={1.7} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-lg font-semibold leading-tight tracking-tight text-foreground">{value}</p>
        <p className="truncate text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

export function AnalysisView({ analysis, fileSize }: Props) {
  const tables = analysis.sheets.reduce((n, s) => n + s.tables.length, 0);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Workbook analysis</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Here is what we found in <span className="font-medium text-foreground">{analysis.fileName}</span>.
        </p>
      </div>

      {/* File card */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border/70 bg-card/60 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-brand/10 text-brand">
            <FileSpreadsheet className="size-5" strokeWidth={1.7} />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{analysis.fileName}</p>
            <p className="text-xs text-muted-foreground">
              {formatBytes(fileSize)} · {analysis.totalSheets} worksheets
              {analysis.convertedFromLegacy && <span className="text-amber-600"> · converted from legacy .xls</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {analysis.hasMacros && (
            <span className="rounded-full border border-border/70 bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
              Macros (VBA) detected — preserved
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-600">
            <ShieldCheck className="size-3.5" /> Analyzed locally
          </span>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Stat icon={LayoutGrid} label="Sheets" value={formatNumber(analysis.totalSheets)} accent />
        <Stat icon={Table2} label="Non-empty sheets" value={formatNumber(analysis.nonEmptySheets)} />
        <Stat icon={Grid3X3} label="Empty sheets" value={formatNumber(analysis.emptySheets)} />
        <Stat icon={EyeOff} label="Hidden sheets" value={formatNumber(analysis.hiddenSheets)} />
        <Stat icon={Sigma} label="Formulas" value={formatNumber(analysis.formulas)} accent />
        <Stat icon={BarChart3} label="Charts" value={formatNumber(analysis.charts)} />
        <Stat icon={Grid3X3} label="Pivot tables" value={formatNumber(analysis.pivotTables)} />
        <Stat icon={ImageIcon} label="Images" value={formatNumber(analysis.images)} />
        <Stat icon={FileArchive} label="Merged ranges" value={formatNumber(analysis.mergedRanges)} />
        <Stat icon={FileSpreadsheet} label="Cells" value={formatNumber(analysis.totalCells)} />
      </div>

      {tables > 0 && (
        <div className="rounded-xl border border-brand/20 bg-brand/5 px-5 py-3.5 text-sm text-foreground/80">
          <span className="font-semibold text-brand">{tables} table{tables === 1 ? "" : "s"}</span> detected — headers, data rows,
          totals and column types will be formatted automatically.
        </div>
      )}

      {analysis.warnings.length > 0 && (
        <div className="space-y-2">
          {analysis.warnings.map((w) => (
            <div key={w} className="flex items-start gap-2.5 rounded-xl border border-amber-200/60 bg-amber-50/60 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
