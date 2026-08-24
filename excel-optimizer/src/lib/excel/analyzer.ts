/**
 * Workbook analyzer: reads every worksheet, resolves shared strings, counts
 * protected objects (charts, pivots, images, macros) and produces:
 *   1. a human-friendly WorkbookAnalysis for the UI
 *   2. a WorkbookSnapshot used by the validation engine
 */
import { Zip, countEntriesMatching, loadZip, readEntryText, workbookPath } from "./zip";
import { parseWorkbook, WorkbookModel } from "./workbook";
import { ParsedSheet, emptySheet, parseSheet } from "./worksheet";
import { XmlEl, childElements, getAttr, parseXml, textContent } from "./xml";
import {
  InputFormat,
  OptimizerError,
  SheetAnalysis,
  SheetInfo,
  WorkbookAnalysis,
} from "./types";
import { detectSheet } from "./detect";
import { StyleLibrary } from "./styles";

export interface SheetSnapshot {
  name: string;
  state: "visible" | "hidden" | "veryHidden";
  formulas: Record<string, string>;
  values: Record<string, string>;
  merges: string[];
  cellCount: number;
}

export interface WorkbookSnapshot {
  partNames: string[];
  charts: number;
  pivotTables: number;
  images: number;
  hasMacros: boolean;
  sheets: SheetSnapshot[];
}

export interface LoadedWorkbook {
  zip: Zip;
  wb: WorkbookModel;
  sharedStrings: string[];
  parsed: Map<string, ParsedSheet>;
  styleLib: StyleLibrary;
  analysis: WorkbookAnalysis;
  snapshot: WorkbookSnapshot;
}

export async function loadWorkbook(
  buffer: ArrayBuffer,
  fileName: string,
  format: InputFormat,
): Promise<LoadedWorkbook> {
  const zip = await loadZip(buffer);
  const wbPath = workbookPath(zip);
  void wbPath;
  const wb = await parseWorkbook(zip);
  const sharedStrings = await parseSharedStrings(zip);
  const stylesXml = await readEntryText(zip, "xl/styles.xml");
  const styleLib = new StyleLibrary(stylesXml);

  const parsed = new Map<string, ParsedSheet>();
  const sheets: SheetAnalysis[] = [];
  const snapSheets: SheetSnapshot[] = [];

  let totalCells = 0;
  let formulas = 0;
  let mergedRanges = 0;
  let nonEmptySheets = 0;
  let hiddenSheets = 0;

  for (const info of wb.sheets) {
    const xml = await readEntryText(zip, info.file);
    if (!xml) {
      // Missing part — treat as empty sheet rather than failing the whole run.
      sheets.push({
        name: info.name,
        state: info.state,
        nonEmptyCells: 0,
        formulaCount: 0,
        mergedRanges: [],
        isEmpty: true,
        tables: [],
        rowKinds: {},
        quality: 100,
      });
      snapSheets.push({
        name: info.name,
        state: info.state,
        formulas: {},
        values: {},
        merges: [],
        cellCount: 0,
      });
      continue;
    }

    let ps: ParsedSheet;
    try {
      ps = parseSheet(xml, sharedStrings);
    } catch {
      throw new OptimizerError(
        `Worksheet "${info.name}" could not be parsed.`,
        "Unsupported worksheet feature detected. Your original file has not been modified.",
      );
    }

    parsed.set(info.name, ps);

    const detection = detectSheet(info.name, ps, styleLib);
    const isEmpty = ps.cellCount === 0;
    if (!isEmpty) nonEmptySheets++;
    if (info.state !== "visible") hiddenSheets++;
    totalCells += ps.cellCount;
    formulas += ps.formulaMap.size;
    mergedRanges += ps.merges.length;

    sheets.push({
      name: info.name,
      state: info.state,
      nonEmptyCells: ps.cellCount,
      formulaCount: ps.formulaMap.size,
      mergedRanges: ps.merges,
      isEmpty,
      tables: detection.tables,
      rowKinds: detection.rowKinds,
      quality: detection.quality,
    });

    const formulasRec: Record<string, string> = {};
    ps.formulaMap.forEach((f, ref) => (formulasRec[ref] = f));
    const valuesRec: Record<string, string> = {};
    ps.valueMap.forEach((v, ref) => (valuesRec[ref] = v));
    snapSheets.push({
      name: info.name,
      state: info.state,
      formulas: formulasRec,
      values: valuesRec,
      merges: ps.merges.map((m) => m.ref).sort(),
      cellCount: ps.cellCount,
    });
  }

  const charts = countEntriesMatching(zip, /^xl\/charts\/chart\d+\.xml$/);
  const pivotTables = countEntriesMatching(zip, /^xl\/pivotTables\/pivotTable\d+\.xml$/);
  const images = countEntriesMatching(zip, /^xl\/media\//);
  const hasMacros = listHasMacros(zip);

  const warnings: string[] = [];
  if (totalCells > 500_000) {
    warnings.push("This is a large workbook — processing may take a few seconds.");
  }
  if (format === "xls") {
    warnings.push("Legacy .xls files are converted to the modern .xlsx format.");
  }

  const analysis: WorkbookAnalysis = {
    fileName,
    format,
    convertedFromLegacy: format === "xls",
    sheets,
    totalSheets: sheets.length,
    nonEmptySheets,
    emptySheets: sheets.length - nonEmptySheets,
    hiddenSheets,
    totalCells,
    formulas,
    charts,
    pivotTables,
    images,
    mergedRanges,
    hasMacros,
    warnings,
  };

  const snapshot: WorkbookSnapshot = {
    partNames: listEntryNames(zip),
    charts,
    pivotTables,
    images,
    hasMacros,
    sheets: snapSheets,
  };

  return { zip, wb, sharedStrings, parsed, styleLib, analysis, snapshot };
}

function listHasMacros(zip: Zip): boolean {
  return !!zip.file("xl/vbaProject.bin");
}

function listEntryNames(zip: Zip): string[] {
  return Object.keys(zip.files)
    .filter((name) => !zip.files[name].dir)
    .sort();
}

export async function parseSharedStrings(zip: Zip): Promise<string[]> {
  const xml = await readEntryText(zip, "xl/sharedStrings.xml");
  if (!xml) return [];
  try {
    const doc = parseXml(xml);
    const out: string[] = [];
    for (const si of childElements(doc.documentElement!, "si")) {
      let text = "";
      for (let i = 0; i < si.childNodes.length; i++) {
        const n = si.childNodes[i];
        if (n.nodeType !== 1) continue;
        const name = (n as XmlEl).localName || (n as XmlEl).nodeName;
        if (name === "t") text += textContent(n as XmlEl);
        else if (name === "r") {
          for (const runChild of childElements(n as XmlEl)) {
            if ((runChild.localName || runChild.nodeName) === "t") {
              text += textContent(runChild);
            }
          }
        }
        // <rPh> (phonetic runs) and <phoneticPr> are intentionally skipped.
      }
      out.push(text);
    }
    return out;
  } catch {
    throw new OptimizerError(
      "The workbook's shared text could not be read.",
      "Unsupported workbook feature detected. Your original file has not been modified.",
    );
  }
}

/** Re-extracts a snapshot from an output zip (used by the validator). */
export async function extractSnapshot(zip: Zip, sheetInfos: SheetInfo[]): Promise<WorkbookSnapshot> {
  const sharedStrings = await parseSharedStrings(zip);
  const snapSheets: SheetSnapshot[] = [];
  for (const info of sheetInfos) {
    const xml = await readEntryText(zip, info.file);
    const ps: ParsedSheet = xml ? parseSheet(xml, sharedStrings) : emptySheet();
    const formulasRec: Record<string, string> = {};
    ps.formulaMap.forEach((f, ref) => (formulasRec[ref] = f));
    const valuesRec: Record<string, string> = {};
    ps.valueMap.forEach((v, ref) => (valuesRec[ref] = v));
    snapSheets.push({
      name: info.name,
      state: info.state,
      formulas: formulasRec,
      values: valuesRec,
      merges: ps.merges.map((m) => m.ref).sort(),
      cellCount: ps.cellCount,
    });
  }
  return {
    partNames: listEntryNames(zip),
    charts: countEntriesMatching(zip, /^xl\/charts\/chart\d+\.xml$/),
    pivotTables: countEntriesMatching(zip, /^xl\/pivotTables\/pivotTable\d+\.xml$/),
    images: countEntriesMatching(zip, /^xl\/media\//),
    hasMacros: listHasMacros(zip),
    sheets: snapSheets,
  };
}
