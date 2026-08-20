/** Supported document formats (everything is parsed in the browser). */
export type DocKind = "docx" | "rtf" | "xlsx" | "xls" | "csv" | "pdf";

export const SUPPORTED_EXTS: DocKind[] = [
  "docx",
  "rtf",
  "xlsx",
  "xls",
  "csv",
  "pdf",
];

export const FORMAT_LABELS: Record<DocKind, string> = {
  docx: "Word (.docx)",
  rtf: "Rich Text (.rtf)",
  xlsx: "Excel (.xlsx)",
  xls: "Excel (.xls)",
  csv: "CSV (.csv)",
  pdf: "PDF (.pdf)",
};

/** One sheet of a spreadsheet document. */
export interface SheetData {
  name: string;
  rows: string[][];
}

/**
 * Extracted content. `text` documents (docx/rtf/pdf) become a list of lines;
 * spreadsheet documents (xlsx/xls/csv) become a grid of cells per sheet.
 */
export type ParsedContent =
  | { type: "text"; lines: string[] }
  | { type: "sheet"; sheets: SheetData[] };

export interface ParsedDoc {
  /** Stable id, derived from the file's path. */
  id: string;
  /** Full relative path inside the picked folder, or the file name. */
  path: string;
  /** Directory the file lives in ("" when none). */
  dir: string;
  fileName: string;
  ext: DocKind;
  /** File name without extension and without trailing version token. */
  stem: string;
  /** Trailing version-ish token ("2608041001", "v2", "final", …). */
  versionTag: string;
  size: number;
  /** SHA-256 hash of file bytes for duplicate detection and caching. */
  sha256?: string;
  content?: ParsedContent;
  /** Set when the file could not be parsed. */
  error?: string;
}

export interface DocGroup {
  id: string;
  dir: string;
  /**
   * Business-account label: the folder at the chosen account level under the
   * picked root (level 1 by default; auto-detected and user-adjustable).
   */
  account: string;
  /** Folder one level below the account ("(root)" when absent). */
  packageName: string;
  /** Folder two levels below the account ("" when absent). */
  category: string;
  stem: string;
  /** Distinct formats present in this group (e.g. ["csv", "docx"]). */
  formats: DocKind[];
  docs: ParsedDoc[];
}

// ── Comparison chain types ──────────────────────────────────────────────────

/** A pair of formats to compare in the chain. */
export interface ComparisonPair {
  baselineFormat: DocKind;
  comparingFormat: DocKind;
}

/** Comparison mode selected by the user. */
export type ComparisonMode = "exact" | "intelligent";

/**
 * The comparison chain for a report group, derived from format priority rules.
 * E.g. for a group with PDF, RTF, DOCX, XLSX, CSV:
 *   [PDF→RTF, PDF→DOCX, DOCX→XLSX, XLSX→CSV]
 */
export interface ComparisonChain {
  /** The baseline format the user selected. */
  baselineFormat: DocKind;
  /** Ordered pairs of comparisons to execute. */
  pairs: ComparisonPair[];
}

/** Result of a single pairwise comparison. */
export interface ComparisonResult {
  pair: ComparisonPair;
  baselineDoc: ParsedDoc;
  comparingDoc: ParsedDoc;
  diffs: DiffRecord[];
}

// ── Extended difference types ──────────────────────────────────────────────

export type DiffType =
  | "text_changed"
  | "cell_changed"
  | "header_changed"
  | "sheet_added"
  | "sheet_removed"
  | "sheet_renamed"
  | "rows_added"
  | "rows_removed"
  | "cols_added"
  | "cols_removed"
  | "missing_content"
  | "added_content"
  | "value_mismatch"
  | "format_mismatch"
  | "font_mismatch"
  | "font_size_mismatch"
  | "image_added"
  | "image_removed"
  | "image_count_mismatch"
  | "number_format_mismatch"
  | "date_format_mismatch"
  | "currency_format_mismatch"
  | "exact_match";

export type VersionDiffKind = "unchanged" | "changed" | "added" | "removed";

/** Word-level diff segment (jsdiff diffWords). */
export interface WordSeg {
  value: string;
  added?: boolean;
  removed?: boolean;
}

/** How one non-reference version relates to the reference for this difference. */
export interface VersionDiff {
  docId: string;
  fileName: string;
  versionTag: string;
  kind: VersionDiffKind;
  /** Content of this version at the difference location ("" for removed). */
  text: string;
  /** Word-level diff vs the reference (text documents only). */
  segments?: WordSeg[];
  /** True when this version simply matches the reference. */
  unchanged?: boolean;
}

export interface DiffRecord {
  id: string;
  groupId: string;
  /** Human label like `Non-Phi/salesreport.docx`. */
  groupLabel: string;
  account: string;
  docType: DocKind;
  differenceType: DiffType;
  /** The specific pair that produced this diff (set by chain pipeline). */
  comparisonPair?: ComparisonPair;
  comparisonMode: "reference";
  /** Canonical, stable-ish structural signature (not hashed). */
  locationSignature: string;
  /** Human label, e.g. "Lines 12–14" or "Sheet1 · B5". */
  locationLabel: string;
  /** Reference value / span text. */
  referenceText: string;
  /** File name of the reference version this difference is measured against. */
  referenceFile: string;
  /** Version tag of the reference version. */
  referenceVersion?: string;
  /** Format of the baseline document in this comparison pair. */
  baselineFormat?: DocKind;
  /** Format of the comparing document in this comparison pair. */
  comparingFormat?: DocKind;
  /** File name of the comparing document. */
  comparingFile?: string;
  /** Every non-reference version in the group, with its state. */
  versions: VersionDiff[];
  /** Detailed human-readable description of the difference. */
  detailedDescription?: string;
  /** Spreadsheet cell diffs only. */
  sheet?: string;
  address?: string;
  /** Formatting information if available. */
  formatInfo?: FormatInfo;
}

/** Formatting information extracted from documents. */
export interface FormatInfo {
  fontFamily?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  alignment?: string;
  textColor?: string;
  highlightColor?: string;
  headingLevel?: number;
}

/** Scope of an ignore rule. `occurrence` is session-only, never persisted. */
export type RuleScope =
  | "occurrence"
  | "location"
  | "report"
  | "account"
  | "global";

export interface PersistedRule {
  _id: string;
  scope: Exclude<RuleScope, "occurrence">;
  fingerprint: string;
  accountHash?: string;
  reportHash?: string;
  locationHash?: string;
  docType: string;
  differenceType: string;
  comparisonMode: string;
  createdAt: number;
}

/** Summary counts for a comparison run. */
export interface RunStats {
  files: number;
  parsed: number;
  failed: number;
  /** Distinct account folders at the chosen account level. */
  accounts: number;
  groups: number;
  comparableGroups: number;
  comparisons: number;
  differences: number;
  matches: number;
  ignored: number;
  types: Partial<Record<DiffType, number>>;
  errors: Array<{
    account: string;
    package: string;
    category: string;
    report: string;
    file: string;
    errorType: string;
    errorMessage: string;
  }>;
}

// ── Pipeline / progress types ──────────────────────────────────────────────

export type PipelineStage =
  | "idle"
  | "discovering"
  | "grouping"
  | "parsing"
  | "comparing"
  | "complete"
  | "error";

export interface PipelineProgress {
  stage: PipelineStage;
  /** Files discovered so far. */
  discovered: number;
  /** Total files discovered. */
  totalFiles: number;
  /** Report groups found. */
  groupsFound: number;
  /** Current comparison operation. */
  currentAccount?: string;
  currentPackage?: string;
  currentCategory?: string;
  currentReport?: string;
  currentPair?: string;
  /** Files processed so far in the comparing stage. */
  processedFiles: number;
  /** Estimated remaining time in ms. */
  estimatedRemainingMs?: number;
  /** Performance metrics. */
  metrics?: PerformanceMetrics;
}

/** Performance metrics for developer diagnostics. */
export interface PerformanceMetrics {
  discoveryTimeMs: number;
  groupingTimeMs: number;
  parsingTimeMs: number;
  comparisonTimeMs: number;
  totalProcessingTimeMs: number;
  peakMemoryBytes: number;
  filesPerSecond: number;
  comparisonsPerSecond: number;
}

/** File metadata from the discovery pass (no content). */
export interface FileMeta {
  path: string;
  fileName: string;
  dir: string;
  ext: DocKind;
  size: number;
  modifiedTime: number;
}
