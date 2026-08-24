/**
 * Orchestrator: file intake → analysis → formatting → validation → output.
 *
 * The workflow mirrors the product spec:
 *   Original upload → temp in-memory working copy → analyze → optimize copy →
 *   validate → generate final file. The user's file is never modified.
 */
import { LoadedWorkbook, WorkbookSnapshot, extractSnapshot, loadWorkbook } from "./analyzer";
import { emptyCounters, formatSheet } from "./format";
import { fixDrawingOverlaps } from "./drawings";
import { syncTableColumnNames } from "./tables";
import { loadZip, saveZip, Zip, readEntryText, listEntries } from "./zip";
import { serializeSheet } from "./worksheet";
import { checkNativeWellFormed, checkPartAttributes, checkPartStructure, snapshotStats, validateOutput } from "./validator";
import { convertXls } from "./xls";
import { MAX_FILE_SIZE, validateUpload } from "./security";
import {
  InputFormat,
  OptimizationReport,
  OptimizerError,
  OptimizerSettings,
  SheetAnalysis,
  SheetInfo,
  WorkbookAnalysis,
} from "./types";
import { childElements, firstChildElement, getAttr, parseXml } from "./xml";

export interface ProgressUpdate {
  stage: string;
  label: string;
  pct: number;
}

export type OnProgress = (p: ProgressUpdate) => void;

export interface WorkSession {
  fileName: string;
  format: InputFormat;
  convertedFromLegacy: boolean;
  warnings: string[];
  /** Validation snapshot of the ORIGINAL file. */
  beforeSnapshot: WorkbookSnapshot;
  loaded: LoadedWorkbook;
  analysis: WorkbookAnalysis;
  outputFormat: "xlsx" | "xlsm";
  hasMacros: boolean;
  fileSize: number;
  /** Exact bytes of the uploaded file — used for a "download original" control. */
  originalBytes: ArrayBuffer;
}

const STAGES: { key: string; label: string }[] = [
  { key: "reading", label: "Reading workbook…" },
  { key: "analyzing", label: "Analyzing worksheets…" },
  { key: "detecting", label: "Detecting tables & structure…" },
  { key: "formatting", label: "Normalizing formatting…" },
  { key: "layouts", label: "Optimizing widths, heights & layout…" },
  { key: "validating", label: "Validating formulas & structure…" },
  { key: "generating", label: "Generating optimized workbook…" },
];

const MIN_STAGE_MS = 320;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function stage<T>(
  key: string,
  label: string,
  pct: number,
  onProgress: OnProgress | undefined,
  work: () => Promise<T> | T,
): Promise<T> {
  onProgress?.({ stage: key, label, pct: pct - 4 });
  const [result] = await Promise.all([Promise.resolve().then(work), delay(MIN_STAGE_MS)]);
  onProgress?.({ stage: key, label, pct });
  return result;
}

/** Reads and analyzes an uploaded file (xlsx / xlsm / xls). */
export async function createSession(
  file: File,
  onProgress?: OnProgress,
): Promise<WorkSession> {
  validateUpload(file.name, file.size);
  if (file.size > MAX_FILE_SIZE) {
    throw new OptimizerError(
      "The file is larger than the 50 MB limit.",
      "Please split the workbook or remove embedded media and try again.",
    );
  }
  const buffer = await file.arrayBuffer();
  const format = detectFromBytes(file.name, buffer);

  let beforeSnapshot: WorkbookSnapshot;
  let loaded: LoadedWorkbook;
  let warnings: string[] = [];

  if (format === "xls") {
    await stage("reading", "Reading workbook…", 8, onProgress, () => undefined);
    const conversion = convertXls(buffer);
    beforeSnapshot = conversion.beforeSnapshot;
    warnings = conversion.warnings;
    loaded = await stage("analyzing", "Analyzing worksheets…", 26, onProgress, () =>
      loadWorkbook(conversion.buffer, file.name, "xls"),
    );
  } else {
    loaded = await stage("analyzing", "Analyzing worksheets…", 26, onProgress, () =>
      loadWorkbook(buffer, file.name, format),
    );
    beforeSnapshot = loaded.snapshot;
  }

  // Detection already ran inside loadWorkbook — emit the stage for UX.
  onProgress?.({ stage: "detecting", label: "Detecting tables & structure…", pct: 44 });

  const analysis: WorkbookAnalysis = {
    ...loaded.analysis,
    fileName: file.name,
    format,
    convertedFromLegacy: format === "xls",
    warnings: [...loaded.analysis.warnings, ...warnings],
  };

  return {
    fileName: file.name,
    format,
    convertedFromLegacy: format === "xls",
    warnings: analysis.warnings,
    beforeSnapshot,
    loaded,
    analysis,
    outputFormat: loaded.analysis.hasMacros ? "xlsm" : "xlsx",
    hasMacros: loaded.analysis.hasMacros,
    fileSize: file.size,
    originalBytes: buffer,
  };
}

/** Runs the optimization on an analyzed session and returns the report + blob. */
export async function runOptimization(
  session: WorkSession,
  settings: OptimizerSettings,
  onProgress?: OnProgress,
): Promise<{ report: OptimizationReport; blob: Blob | null; downloadName: string | null }> {
  const started = performance.now();
  const { loaded } = session;
  const counters = emptyCounters();

  // Format every worksheet (empty sheets are skipped automatically).
  const touchedSheets: string[] = [];
  const sheetAnalyses = new Map<string, SheetAnalysis>();
  for (const sa of session.analysis.sheets) sheetAnalyses.set(sa.name, sa);

  await stage("formatting", "Normalizing formatting…", 58, onProgress, () => {
    for (const info of loaded.wb.sheets) {
      const ps = loaded.parsed.get(info.name);
      if (!ps) continue;
      const sa = sheetAnalyses.get(info.name);
      if (!sa || sa.isEmpty) continue;
      const changed = formatSheet(
        ps,
        { rowKinds: sa.rowKinds, quality: sa.quality, tables: sa.tables },
        loaded.styleLib,
        settings,
        counters,
      );
      if (changed) touchedSheets.push(info.name);
    }
  });

  await stage("layouts", "Optimizing widths, heights & layout…", 70, onProgress, () => {
    // Layout work happens inside formatSheet; keep the stage for UX pacing.
    return undefined;
  });

  // Write modified parts back into the zip.
  let imagesReSpaced = 0;
  await stage("generating", "Generating optimized workbook…", 92, onProgress, async () => {
    loaded.zip.file("xl/styles.xml", loaded.styleLib.serialize());
    for (const name of touchedSheets) {
      const ps = loaded.parsed.get(name);
      if (ps) loaded.zip.file(psSheetFile(loaded, name), serializeSheet(ps));
    }
    // Presentation-only post passes:
    //  1. Spread apart overlapping anchored drawings (screenshots covering
    //     each other) — each drawing keeps its exact size and x position.
    //  2. Sync Excel table column names with title-cased header cells.
    for (const info of loaded.wb.sheets) {
      const ps = loaded.parsed.get(info.name);
      if (!ps) continue;
      imagesReSpaced += await fixDrawingOverlaps(loaded.zip, ps, info.file);
      if (ps.casedRefs.size > 0) {
        await syncTableColumnNames(loaded.zip, ps, info.file, ps.casedRefs);
      }
    }
  });

  const buffer = await saveZip(loaded.zip);

  // Validate the EXACT bytes the user will download: the generated package is
  // re-opened from disk-equivalent bytes (zip container + CRC checks) and
  // every part is re-parsed from it. Checks: content/formula preservation,
  // schema-valid attributes (Excel rejects unknown attributes such as
  // filterMode on sheetView as corrupt), structural soundness (element order,
  // style counts, index ranges) and — in the browser, where Excel is the
  // consumer — strict XML 1.0 well-formedness via the native DOMParser, which
  // is stricter than the engine's own DOM parser. Any violation fails the run
  // — a bad file is never delivered.
  const freshZip = await loadZip(buffer);
  const afterSnapshot = await extractSnapshot(freshZip, loaded.wb.sheets);
  const validation = validateOutput(session.beforeSnapshot, afterSnapshot);
  const [schemaViolations, structureViolations, nativeViolations] = await Promise.all([
    checkPartAttributes(freshZip, loaded.wb.sheets),
    checkPartStructure(freshZip, loaded.wb.sheets),
    checkNativeWellFormed(freshZip),
  ]);
  const allViolations = [...schemaViolations, ...structureViolations, ...nativeViolations];
  if (validation.passed && allViolations.length > 0) {
    validation.passed = false;
    validation.differences = allViolations.slice(0, 25);
  }

  const elapsed = Math.round(performance.now() - started);
  const beforeStats = snapshotStats(session.beforeSnapshot);
  const afterStats = snapshotStats(afterSnapshot);

  const base = session.fileName.replace(/\.(xlsx|xlsm|xls)$/i, "");
  const downloadName = `${base}_Optimized.${session.outputFormat}`;

  const report: OptimizationReport = {
    ok: validation.passed,
    inputFileName: session.fileName,
    outputFileName: downloadName,
    inputFormat: session.format,
    convertedFromLegacy: session.convertedFromLegacy,
    sheetsTotal: session.analysis.totalSheets,
    sheetsProcessed: session.analysis.nonEmptySheets,
    sheetsSkippedEmpty: session.analysis.emptySheets,
    formulasBefore: beforeStats.formulas,
    formulasAfter: afterStats.formulas,
    formulaChanges: beforeStats.formulas - afterStats.formulas,
    imagesBefore: session.analysis.images,
    imagesAfter: afterSnapshot.images,
    chartsBefore: session.analysis.charts,
    chartsAfter: afterSnapshot.charts,
    pivotTablesBefore: session.analysis.pivotTables,
    pivotTablesAfter: afterSnapshot.pivotTables,
    mergedRangesBefore: session.analysis.mergedRanges,
    mergedRangesAfter: afterStats.merges,
    validation: validation.passed ? "PASSED" : "FAILED",
    cellsStandardized: counters.cellsStandardized,
    columnsOptimized: counters.columnsOptimized,
    rowsHeightOptimized: counters.rowsHeightOptimized,
    headingsFormatted: counters.headingsFormatted,
    headingsTitleCased: counters.headingsTitleCased,
    imagesReSpaced,
    tablesOptimized: counters.tablesOptimized,
    totalRowsFormatted: counters.totalRowsFormatted,
    subtotalRowsFormatted: counters.subtotalRowsFormatted,
    notesFormatted: counters.notesFormatted,
    worksheetsPreserved: session.analysis.totalSheets,
    macrosPreserved: session.hasMacros,
    warnings: session.warnings,
    elapsedMs: elapsed,
    audit: await buildAudit(freshZip, loaded.wb.sheets, touchedSheets, buffer.byteLength),
  };

  if (!validation.passed) {
    report.failedReason = validation.differences[0] ?? "Unknown validation failure";
    return { report, blob: null, downloadName: null };
  }

  onProgress?.({ stage: "validating", label: "Validating formulas & structure…", pct: 100 });
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  return { report, blob, downloadName };
}

function psSheetFile(loaded: LoadedWorkbook, sheetName: string): string {
  const info = loaded.wb.sheets.find((s) => s.name === sheetName);
  return info?.file ?? sheetName;
}

/**
 * Builds a compact structural audit of the OUTPUT workbook: for every sheet
 * the features Excel cares about (merges, auto-filter, freeze, drawings,
 * hyperlinks, validations, conditional formats, table parts) plus which parts
 * the engine rewrote. Pasted back as diagnostics, this pinpoints the sheet
 * and feature combination Excel rejects without needing the file bytes.
 */
async function buildAudit(
  zip: Zip,
  sheetInfos: SheetInfo[],
  touchedSheets: string[],
  outputBytes: number,
): Promise<string[]> {
  const lines: string[] = [];
  lines.push(`Output size: ${(outputBytes / 1024).toFixed(1)} KB, ${listEntries(zip).length} parts`);
  for (const info of sheetInfos) {
    const xml = await readEntryText(zip, info.file);
    if (!xml) {
      lines.push(`${info.name}: MISSING PART`);
      continue;
    }
    let doc;
    try {
      doc = parseXml(xml);
    } catch {
      lines.push(`${info.name}: NOT WELL-FORMED`);
      continue;
    }
    const root = doc.documentElement!;
    const touched = touchedSheets.includes(info.name) ? "TOUCHED" : "untouched";
    const parts: string[] = [touched];

    const sheetData = firstChildElement(root, "sheetData");
    let cells = 0;
    let formulas = 0;
    if (sheetData) {
      for (const row of childElements(sheetData, "row")) {
        for (const c of childElements(row, "c")) {
          cells++;
          if (firstChildElement(c, "f")) formulas++;
        }
      }
    }
    parts.push(`cells=${cells}`, `formulas=${formulas}`);

    const merges = firstChildElement(root, "mergeCells");
    if (merges) {
      parts.push(`merges=${childElements(merges, "mergeCell").length}`);
      const refs = childElements(merges, "mergeCell").map((m) => getAttr(m, "ref") ?? "").join(",");
      if (refs) parts.push(`mergeRefs=[${refs}]`);
    }
    const af = firstChildElement(root, "autoFilter");
    if (af) parts.push(`filter=${getAttr(af, "ref") ?? ""}`);
    const views = firstChildElement(root, "sheetViews");
    if (views) {
      for (const view of childElements(views, "sheetView")) {
        const pane = firstChildElement(view, "pane");
        if (pane) parts.push(`freeze=${getAttr(pane, "ySplit") ?? ""}x${getAttr(pane, "xSplit") ?? ""} state=${getAttr(pane, "state") ?? ""}`);
      }
    }
    const drawing = firstChildElement(root, "drawing");
    if (drawing) parts.push(`drawing=${getAttr(drawing, "r:id") ?? ""}`);
    const legacy = firstChildElement(root, "legacyDrawing");
    if (legacy) parts.push(`legacyDrawing=${getAttr(legacy, "r:id") ?? ""}`);
    const hyperlinks = firstChildElement(root, "hyperlinks");
    if (hyperlinks) parts.push(`hyperlinks=${childElements(hyperlinks, "hyperlink").length}`);
    const validations = firstChildElement(root, "dataValidations");
    if (validations) parts.push(`validations=${childElements(validations, "dataValidation").length}`);
    const cf = firstChildElement(root, "conditionalFormatting");
    if (cf) parts.push(`condFmt`);
    const tableParts = firstChildElement(root, "tableParts");
    if (tableParts) parts.push(`tableParts=${childElements(tableParts, "tablePart").length}`);
    if (firstChildElement(root, "extLst")) parts.push("extLst");
    lines.push(`${info.name}: ${parts.join(" | ")}`);
  }
  return lines;
}

export function detectFromBytes(fileName: string, buffer: ArrayBuffer): InputFormat {
  const ext = (fileName.split(".").pop() ?? "").toLowerCase();
  const bytes = new Uint8Array(buffer);
  const isZip = bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
  const isOle =
    bytes.length > 8 &&
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0 &&
    bytes[4] === 0xa1 &&
    bytes[5] === 0xb1 &&
    bytes[6] === 0x1a &&
    bytes[7] === 0xe1;
  if (isZip) {
    if (ext === "xlsm") return "xlsm";
    return "xlsx";
  }
  if (isOle) return "xls";
  if (ext === "xls") return "xls";
  throw new OptimizerError("Unsupported file format.", "The file is not a valid Excel workbook (.xlsx, .xlsm or .xls).");
}

export { OptimizerError };
