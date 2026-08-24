/**
 * Shared types for the Excel optimizer engine.
 *
 * Design principle: CONTENT and WORKBOOK LOGIC are immutable — only
 * PRESENTATION is optimized. These types describe what the engine reads,
 * decides, and writes without ever touching cell values or formulas.
 */

export type InputFormat = "xlsx" | "xlsm" | "xls";

export type SheetState = "visible" | "hidden" | "veryHidden";

export interface SheetInfo {
  /** Worksheet name (from workbook.xml) — never modified. */
  name: string;
  /** Path of the worksheet part inside the zip, e.g. "xl/worksheets/sheet1.xml". */
  file: string;
  state: SheetState;
  /** Original order index (0-based). */
  index: number;
}

export type CellKind = "number" | "string" | "boolean" | "error" | "formula";

/** A single parsed cell. `value` is the raw string/number from the XML. */
export interface CellData {
  ref: string;
  row: number; // 1-based
  col: number; // 1-based
  kind: CellKind;
  /** Raw <v> content when present. */
  value: string | number | boolean | null;
  /** True when the cell contains a <f> formula element. */
  hasFormula: boolean;
  /** Formula text (may be empty for shared-formula followers). */
  formula: string;
  /** `t` attribute of the <c> element. */
  type: string | undefined;
  /** Style index `s` attribute (0 when absent). */
  style: number;
  /** Resolved display text (for strings / inline strings). */
  text?: string;
}

export interface MergeRange {
  ref: string;
  row1: number;
  col1: number;
  row2: number;
  col2: number;
}

export type ColumnType = "text" | "number" | "date" | "currency" | "percent" | "id";

export type RowKind =
  | "blank"
  | "title"
  | "subtitle"
  | "section"
  | "header"
  | "data"
  | "total"
  | "subtotal"
  | "note"
  | "none";

export interface TableRegion {
  sheetName: string;
  headerRow: number;
  firstDataRow: number;
  lastDataRow: number;
  colMin: number;
  colMax: number;
  totalRows: number[];
  subtotalRows: number[];
  /** 0-100 formatting-quality score of the region. */
  quality: number;
  /** Detected semantic type per column (col → type). */
  columnTypes: Record<number, ColumnType>;
}

export interface SheetAnalysis {
  name: string;
  state: SheetState;
  nonEmptyCells: number;
  formulaCount: number;
  mergedRanges: MergeRange[];
  isEmpty: boolean;
  tables: TableRegion[];
  /** Row classification: row number → kind. */
  rowKinds: Record<number, RowKind>;
  /** Quality score 0-100 for the whole sheet. */
  quality: number;
}

/** Human-friendly workbook analysis shown in the UI. */
export interface WorkbookAnalysis {
  fileName: string;
  format: InputFormat;
  convertedFromLegacy: boolean;
  sheets: SheetAnalysis[];
  totalSheets: number;
  nonEmptySheets: number;
  emptySheets: number;
  hiddenSheets: number;
  totalCells: number;
  formulas: number;
  charts: number;
  pivotTables: number;
  images: number;
  mergedRanges: number;
  hasMacros: boolean;
  warnings: string[];
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export type TriState = "automatic" | "on" | "off";
export type HeaderStyle = "professional" | "minimal" | "accent";
export type DateFormat = "dd-mmm-yyyy" | "yyyy-mm-dd" | "dd/mm/yyyy";

export interface OptimizerSettings {
  mode: "automatic" | "advanced";
  // Typography
  globalFont: string;
  titleFontSize: number;
  headingFontSize: number;
  subheadingFontSize: number;
  tableHeaderFontSize: number;
  bodyFontSize: number;
  headerStyle: HeaderStyle;
  /** Title-case detected titles, subtitles, sections and table headers. */
  titleCase: boolean;
  /** Correct common spelling mistakes in headings (e.g., "Sfb" → "SFB"). */
  correctTypos: boolean;
  // Tables
  borders: TriState;
  alternatingRows: TriState;
  alignment: "automatic" | "preserve";
  wrapText: TriState;
  columnWidth: "automatic" | "preserve";
  rowHeight: "automatic" | "preserve";
  freezeHeaders: TriState;
  autoFilter: TriState;
  // Numbers
  numberFormatting: boolean;
  currencyDetection: boolean;
  percentDetection: boolean;
  dateDetection: boolean;
  dateFormat: DateFormat;
}

export const DEFAULT_SETTINGS: OptimizerSettings = {
  mode: "automatic",
  globalFont: "Aptos",
  titleFontSize: 16,
  headingFontSize: 14,
  subheadingFontSize: 12,
  tableHeaderFontSize: 10.5,
  bodyFontSize: 10,
  headerStyle: "professional",
  titleCase: true,
  correctTypos: true,
  borders: "automatic",
  alternatingRows: "automatic",
  alignment: "automatic",
  wrapText: "automatic",
  columnWidth: "automatic",
  rowHeight: "automatic",
  freezeHeaders: "automatic",
  autoFilter: "automatic",
  numberFormatting: true,
  currencyDetection: true,
  percentDetection: true,
  dateDetection: true,
  dateFormat: "dd-mmm-yyyy",
};

export const FONT_PRESETS = ["Aptos", "Calibri", "Segoe UI", "Arial", "Helvetica", "Verdana", "Cambria", "Georgia"];

/* ------------------------------------------------------------------ */
/* Report                                                              */
/* ------------------------------------------------------------------ */

export interface OptimizationReport {
  ok: boolean;
  inputFileName: string;
  outputFileName: string;
  inputFormat: InputFormat;
  convertedFromLegacy: boolean;
  sheetsTotal: number;
  sheetsProcessed: number;
  sheetsSkippedEmpty: number;
  formulasBefore: number;
  formulasAfter: number;
  formulaChanges: number;
  imagesBefore: number;
  imagesAfter: number;
  chartsBefore: number;
  chartsAfter: number;
  pivotTablesBefore: number;
  pivotTablesAfter: number;
  mergedRangesBefore: number;
  mergedRangesAfter: number;
  validation: "PASSED" | "FAILED";
  // Formatting counters
  cellsStandardized: number;
  columnsOptimized: number;
  rowsHeightOptimized: number;
  headingsFormatted: number;
  tablesOptimized: number;
  totalRowsFormatted: number;
  subtotalRowsFormatted: number;
  notesFormatted: number;
  /** Heading cells whose text was normalized to title case. */
  headingsTitleCased: number;
  /** Anchored drawings that were spread apart to remove overlaps. */
  imagesReSpaced: number;
  /** Number of image-image overlaps detected before optimization. */
  imageOverlapsBefore: number;
  /** Number of image-image overlaps remaining after optimization. */
  imageOverlapsAfter: number;
  /** Number of image-content conflicts detected before optimization. */
  imageContentConflictsBefore: number;
  /** Number of image-content conflicts remaining after optimization. */
  imageContentConflictsAfter: number;
  /** Number of images that were repositioned. */
  imagesRepositioned: number;
  /** Number of images grouped into logical grids. */
  imagesGrouped: number;
  worksheetsPreserved: number;
  macrosPreserved: boolean;
  warnings: string[];
  elapsedMs: number;
  failedReason?: string;
  /** Compact per-sheet structural audit (used for support diagnostics). */
  audit?: string[];
}

export interface OptimizationResult {
  ok: boolean;
  report: OptimizationReport;
  blob: Blob | null;
  downloadName: string | null;
  error?: { title: string; detail: string; technical?: string };
}

/** User-facing error with a safe message (never a raw stack trace). */
export class OptimizerError extends Error {
  detail: string;
  constructor(message: string, detail = "We could not safely process this workbook.") {
    super(message);
    this.detail = detail;
  }
}
