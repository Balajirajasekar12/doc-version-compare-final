/**
 * Legacy .xls support.
 *
 * The browser cannot run LibreOffice, so legacy BIFF workbooks are converted
 * with SheetJS (open-source, pure JavaScript, zero cost). Cell values,
 * formulas, merges and basic formats carry over; embedded charts, pivot
 * tables and images from legacy files cannot be converted, which is clearly
 * disclosed in the analysis warnings — nothing is silently discarded.
 */
import * as XLSX from "xlsx";
import { OptimizerError } from "./types";
import { SheetSnapshot, WorkbookSnapshot } from "./analyzer";
import { rcToRef, rectToRef } from "./refs";

export interface XlsConversion {
  buffer: ArrayBuffer;
  beforeSnapshot: WorkbookSnapshot;
  warnings: string[];
  sheetNames: string[];
}

export function convertXls(data: ArrayBuffer): XlsConversion {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(data, {
      type: "array",
      cellFormula: true,
      cellNF: true,
      cellStyles: true,
      cellDates: false,
    });
  } catch {
    throw new OptimizerError(
      "We could not read this legacy .xls workbook.",
      "The file may be damaged or use an unsupported legacy format. Your original file has not been modified.",
    );
  }
  if (!wb.SheetNames || wb.SheetNames.length === 0) {
    throw new OptimizerError("The .xls workbook contains no worksheets.");
  }

  let out: ArrayBuffer;
  try {
    const written = XLSX.write(wb, {
      type: "array",
      bookType: "xlsx",
      cellStyles: true,
      compression: true,
    });
    out = written as ArrayBuffer;
  } catch {
    throw new OptimizerError(
      "The legacy workbook could not be converted safely.",
      "Conversion was stopped to avoid producing a corrupted file. Your original file has not been modified.",
    );
  }

  return {
    buffer: out,
    beforeSnapshot: snapshotFromSheetJS(wb),
    warnings: [
      "Converted from legacy .xls — cell data, formulas, merges and basic formats are preserved. Charts, pivot tables and images embedded in legacy files cannot be carried over to the modern format.",
    ],
    sheetNames: wb.SheetNames,
  };
}

/** Builds a validation snapshot from a SheetJS workbook. */
export function snapshotFromSheetJS(wb: XLSX.WorkBook): WorkbookSnapshot {
  const sheets: SheetSnapshot[] = wb.SheetNames.map((name, i) => {
    const ws = wb.Sheets[name];
    const formulas: Record<string, string> = {};
    const values: Record<string, string> = {};
    const merges: string[] = [];
    let cellCount = 0;
    for (const key of Object.keys(ws)) {
      if (key.startsWith("!")) continue;
      const cell = ws[key];
      if (!cell) continue;
      // Count only cells that carry a value or a formula — matching the
      // engine's own sheet parser. SheetJS also exposes styled-but-empty
      // cells (t:"z" / no value), and counting those here makes legacy
      // .xls validation fail with a phantom "Cell count changed" error.
      if (!cell.f && (cell.v === undefined || cell.v === null)) continue;
      cellCount++;
      const ref = rcToRef((i2rc(key) as { row: number }).row, (i2rc(key) as { row: number; col: number }).col);
      if (cell.f) formulas[ref] = cell.f.replace(/^=/, "").trim();
      const sv = serializeValue(cell);
      if (sv !== null) values[ref] = sv;
    }
    if (Array.isArray(ws["!merges"])) {
      for (const m of ws["!merges"] as { s: { r: number; c: number }; e: { r: number; c: number } }[]) {
        merges.push(
          rectToRef({
            row1: m.s.r + 1,
            col1: m.s.c + 1,
            row2: m.e.r + 1,
            col2: m.e.c + 1,
          }),
        );
      }
      merges.sort();
    }
    const hidden = ((wb.Workbook as XLSX.WorkBook & { Sheets?: { Hidden?: number }[] }).Sheets?.[i]?.Hidden ?? 0) as number;
    const state: SheetSnapshot["state"] = hidden === 2 ? "veryHidden" : hidden === 1 ? "hidden" : "visible";
    return { name, state, formulas, values, merges, cellCount };
  });
  return { partNames: [], charts: 0, pivotTables: 0, images: 0, hasMacros: false, sheets };
}

/** SheetJS "A1" → { row, col } with 1-based indices. */
function i2rc(key: string): { row: number; col: number } {
  const m = /^([A-Z]+)(\d+)$/.exec(key);
  if (!m) return { row: 1, col: 1 };
  let col = 0;
  for (let i = 0; i < m[1].length; i++) col = col * 26 + (m[1].charCodeAt(i) - 64);
  return { row: parseInt(m[2], 10), col };
}

function serializeValue(cell: XLSX.CellObject): string | null {
  if (cell.v === undefined || cell.v === null) return null;
  if (cell.t === "b") return `b:${cell.v ? "1" : "0"}`;
  if (cell.t === "e") return `e:${String(cell.v)}`;
  if (typeof cell.v === "number") return `n:${cell.v}`;
  if (typeof cell.v === "string") return `s:${cell.v}`;
  return `s:${String(cell.v)}`;
}
