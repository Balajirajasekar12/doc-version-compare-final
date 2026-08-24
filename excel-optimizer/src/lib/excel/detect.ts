/**
 * Structure detection — the "think like an Excel expert" layer.
 *
 * Every worksheet is classified row by row (title / subtitle / section /
 * header / data / total / subtotal / note) using contextual signals: row
 * occupancy, data types, merges, neighbouring rows, keyword content and
 * existing formatting. Tables are detected as header row + consecutive data
 * rows; column semantics (text, number, date, currency, percent, id) drive
 * the formatting decisions. Nothing here ever changes content.
 */
import { ParsedSheet } from "./worksheet";
import { StyleLibrary } from "./styles";
import { CellData, ColumnType, RowKind, TableRegion } from "./types";

export interface DetectionResult {
  rowKinds: Record<number, RowKind>;
  tables: TableRegion[];
  quality: number;
}

interface RowInfo {
  nonEmpty: number;
  numericCount: number;
  formulaCount: number;
  booleanCount: number;
  stringCount: number;
  allText: boolean;
  maxLen: number;
  cols: number[];
  text: string;
  mergedAcross: boolean;
}

const DATE_KEYWORDS =
  /\b(date|day|month|time|due|created|updated|issued|received|period|dob|timestamp|as of|as-of|valid from|valid until|delivery|shipment|birth|hire|termination|expiry|expiration|start date|end date)\b/i;

const CURRENCY_KEYWORDS =
  /\b(price|cost|amount|revenue|sales|fee|balance|budget|salary|invoice|payment|charge|payroll|expense|spend|gross|net total|deposit|withdrawal|freight|commission)\b/i;

const PERCENT_KEYWORDS = /\b(percent|percentage|growth|share|ratio|commission|interest)\b/i;

const ID_HEADERS = /^(id|no\.?|num\.?|number|sku|code|zip|postal|phone|fax|account( ?id)?|(employee|product|order|customer|transaction|record|entry)( ?id)?|ref|reference|key|serial( ?no\.?)?)$/i;

const TOTAL_RE = /\b(grand\s+total|overall\s+total|net\s+total|sub\s?total|totals|total)\b/i;
const SUBTOTAL_RE = /\bsub\s?total\b/i;
const NOTE_RE = /^(note|notes|source|reference|ref|remark|remarks|footnote|disclaimer|generated|prepared|exported|printed|updated|rev)\b/i;

export function detectSheet(name: string, sheet: ParsedSheet, styleLib?: StyleLibrary): DetectionResult {
  const rowKinds: Record<number, RowKind> = {};
  const tables: TableRegion[] = [];

  // Precompute per-row info.
  const info = new Map<number, RowInfo>();
  for (const [row, cells] of sheet.cells) {
    info.set(row, buildRowInfo(row, cells, sheet));
  }

  // Split into blocks of consecutive non-blank rows.
  const blocks: number[][] = [];
  let cur: number[] = [];
  for (let r = 1; r <= sheet.maxRow; r++) {
    if (info.has(r)) cur.push(r);
    else if (cur.length > 0) {
      blocks.push(cur);
      cur = [];
    }
  }
  if (cur.length > 0) blocks.push(cur);

  for (const block of blocks) {
    classifyBlock(name, block, info, rowKinds, tables, sheet, styleLib);
  }

  const quality = computeQuality(sheet, styleLib);
  return { rowKinds, tables, quality };
}

function buildRowInfo(row: number, cells: Map<number, CellData>, sheet: ParsedSheet): RowInfo {
  let nonEmpty = 0;
  let numericCount = 0;
  let formulaCount = 0;
  let booleanCount = 0;
  let stringCount = 0;
  let maxLen = 0;
  const textParts: string[] = [];
  const cols: number[] = [];
  for (const [col, c] of cells) {
    nonEmpty++;
    cols.push(col);
    if (c.hasFormula) formulaCount++;
    if (c.kind === "number") numericCount++;
    else if (c.kind === "boolean") booleanCount++;
    else stringCount++;
    const len = (c.text ?? String(c.value ?? "")).length;
    maxLen = Math.max(maxLen, len);
    if (c.text && len > 0) textParts.push(c.text.trim());
  }
  cols.sort((a, b) => a - b);
  const allText = stringCount > 0 && numericCount === 0 && formulaCount === 0 && booleanCount === 0;
  return {
    nonEmpty,
    numericCount,
    formulaCount,
    booleanCount,
    stringCount,
    allText,
    maxLen,
    cols,
    text: textParts.join(" ").toLowerCase(),
    mergedAcross: isMergedAcross(row, cols, sheet),
  };
}

function isMergedAcross(row: number, cols: number[], sheet: ParsedSheet): boolean {
  for (const m of sheet.merges) {
    if (m.row1 === row && m.row2 === row && m.col2 - m.col1 + 1 >= 3) return true;
  }
  // A single cell that spans wide via merge counts too.
  if (cols.length === 1) {
    for (const m of sheet.merges) {
      if (m.row1 <= row && row <= m.row2 && m.col1 === cols[0] && m.col2 - m.col1 + 1 >= 3) return true;
    }
  }
  return false;
}

function classifyBlock(
  sheetName: string,
  block: number[],
  info: Map<number, RowInfo>,
  rowKinds: Record<number, RowKind>,
  tables: TableRegion[],
  sheet: ParsedSheet,
  styleLib?: StyleLibrary,
): void {
  const isDataLike = (r: number, blockRows: number[]): boolean => {
    const ri = info.get(r);
    if (!ri || ri.nonEmpty === 0) return false;
    if (ri.nonEmpty >= 2 && (ri.numericCount >= 1 || ri.formulaCount >= 1)) return true;
    // Repeated text pattern: >= 3 short text cells matching the next rows.
    if (ri.nonEmpty >= 3 && ri.allText && ri.maxLen <= 60) {
      const idx = blockRows.indexOf(r);
      const a = blockRows[idx + 1];
      const b = blockRows[idx + 2];
      if (a !== undefined && b !== undefined) {
        const ia = info.get(a);
        const ib = info.get(b);
        if (ia && ib && patternMatches(ri, ia) && patternMatches(ri, ib)) return true;
      }
    }
    return false;
  };

  const isTotalRow = (r: number): boolean => {
    const ri = info.get(r);
    if (!ri || ri.nonEmpty === 0) return false;
    return TOTAL_RE.test(ri.text);
  };

  const isHeaderCandidate = (r: number, blockRows: number[]): boolean => {
    const ri = info.get(r);
    if (!ri || ri.nonEmpty < 2) return false;
    // A row that is merged across several columns is a title/subtitle, not a
    // table header. Treating it as a header puts the auto-filter over the
    // merged cells — a shape Excel rejects as corrupt.
    if (isMergedAcross(r, ri.cols, sheet)) return false;
    if (ri.numericCount >= 1 || ri.formulaCount >= 1 || ri.booleanCount >= 1) return false;
    if (ri.maxLen > 80) return false;
    const idx = blockRows.indexOf(r);
    const a = blockRows[idx + 1];
    const b = blockRows[idx + 2];
    if (a === undefined || b === undefined) return false;
    if (!isDataLike(a, blockRows) || !isDataLike(b, blockRows)) return false;
    // Header columns should overlap the data columns.
    const ia = info.get(a)!;
    const overlap = ri.cols.filter((c) => ia.cols.includes(c)).length;
    if (overlap === 0) return false;
    return true;
  };

  const isTitleCandidate = (r: number, firstOfBlock: boolean, blockRows: number[]): boolean => {
    if (isHeaderCandidate(r, blockRows)) return false;
    const ri = info.get(r);
    if (!ri || ri.nonEmpty === 0) return false;
    if (ri.numericCount > 1) return false;
    if (ri.booleanCount > 0) return false;
    if (ri.mergedAcross && ri.allText) return true;
    if (ri.allText && ri.nonEmpty <= 2) {
      if (ri.maxLen >= 12) return true;
      if (firstOfBlock && ri.maxLen >= 8) return true;
    }
    // One long label, possibly with a year-like number (e.g. "2024 Annual Report").
    if (ri.nonEmpty <= 2 && ri.maxLen >= 12) return true;
    return false;
  };

  const isNoteRow = (r: number): boolean => {
    const ri = info.get(r);
    if (!ri || ri.nonEmpty === 0) return false;
    if (ri.nonEmpty > 2) return false;
    return NOTE_RE.test(ri.text.trim());
  };

  // Phase A — leading title rows.
  let i = 0;
  while (i < block.length) {
    const r = block[i];
    if (isTitleCandidate(r, i === 0, block)) {
      rowKinds[r] = "title";
      i++;
    } else break;
  }

  // Phase B — tables.
  while (i < block.length) {
    const r = block[i];
    if (isHeaderCandidate(r, block)) {
      let j = i + 1;
      while (j < block.length && (isDataLike(block[j], block) || isTotalRow(block[j]))) j++;
      const lastRow = block[j - 1];
      const headerRow = r;

      // Column span = header ∪ data.
      const colSet = new Set<number>();
      for (const c of info.get(headerRow)?.cols ?? []) colSet.add(c);
      for (let k = i + 1; k < j; k++) {
        for (const c of info.get(block[k])?.cols ?? []) colSet.add(c);
      }
      const cols = [...colSet].sort((a, b) => a - b);
      const colMin = cols[0];
      const colMax = cols[cols.length - 1];

      const totalRows: number[] = [];
      const subtotalRows: number[] = [];
      for (let k = i + 1; k < j; k++) {
        const rr = block[k];
        if (isTotalRow(rr)) {
          if (SUBTOTAL_RE.test(info.get(rr)!.text)) subtotalRows.push(rr);
          else totalRows.push(rr);
        }
      }
      rowKinds[headerRow] = "header";
      for (let k = i + 1; k < j; k++) {
        const rr = block[k];
        rowKinds[rr] = isTotalRow(rr) ? (SUBTOTAL_RE.test(info.get(rr)!.text) ? "subtotal" : "total") : "data";
      }

      const columnTypes = computeColumnTypes(sheet, headerRow, lastRow, colMin, colMax, styleLib);

      tables.push({
        sheetName,
        headerRow,
        firstDataRow: i + 1 < block.length ? block[i + 1] : headerRow,
        lastDataRow: lastRow,
        colMin,
        colMax,
        totalRows,
        subtotalRows,
        quality: 0,
        columnTypes,
      });
      i = j;
    } else {
      const ri = info.get(r);
      if (ri && ri.nonEmpty <= 2 && ri.allText && !isDataLike(r, block)) {
        const hasTableLater = block.slice(i + 1).some((rr) => rowKinds[rr] === "header");
        const beforeAnyTable = tables.length === 0;
        if (beforeAnyTable) rowKinds[r] = "subtitle";
        else if (hasTableLater) rowKinds[r] = "section";
        else if (isNoteRow(r)) rowKinds[r] = "note";
        else rowKinds[r] = "note";
      } else if (isNoteRow(r)) {
        rowKinds[r] = "note";
      } else {
        rowKinds[r] = "none";
      }
      i++;
    }
  }
}

function patternMatches(a: RowInfo, b: RowInfo): boolean {
  const common = a.cols.filter((c) => b.cols.includes(c)).length;
  return common >= 2 && Math.abs(a.cols.length - b.cols.length) <= 1;
}

/* ------------------------------------------------------------------ */
/* Column typing                                                       */
/* ------------------------------------------------------------------ */

const DATE_NUMFMT_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81]);

function computeColumnTypes(
  sheet: ParsedSheet,
  headerRow: number,
  lastDataRow: number,
  colMin: number,
  colMax: number,
  styleLib?: StyleLibrary,
): Record<number, ColumnType> {
  const types: Record<number, ColumnType> = {};
  for (let col = colMin; col <= colMax; col++) {
    const cells: CellData[] = [];
    for (let r = headerRow + 1; r <= lastDataRow; r++) {
      const c = sheet.cells.get(r)?.get(col);
      if (c) cells.push(c);
    }
    const nonEmpty = cells.length;
    if (nonEmpty === 0) {
      types[col] = "text";
      continue;
    }
    const numbers = cells.filter(
      (c) =>
        (c.kind === "number" || (c.hasFormula && !isNaN(parseFloat(String(c.value ?? ""))))) &&
        c.value !== null &&
        c.value !== "",
    );
    const numericRatio = numbers.length / nonEmpty;

    if (numericRatio >= 0.6) {
      const header = columnHeaderText(sheet, headerRow, col).toLowerCase();
      const anyPercentFmt = cells.some((c) => styleLib && formatIsPercent(styleLib, c.style));
      const anyCurrencyFmt = cells.some((c) => styleLib && formatIsCurrency(styleLib, c.style));
      const anyDateFmt = cells.some((c) => styleLib && formatIsDate(styleLib, c.style));

      if (anyPercentFmt) {
        types[col] = "percent";
      } else if (anyCurrencyFmt) {
        types[col] = "currency";
      } else if (anyDateFmt || dateHeaderHint(header, numbers)) {
        types[col] = "date";
      } else if (header.includes("%") || PERCENT_KEYWORDS.test(header)) {
        types[col] = "percent";
      } else if (/[$£€¥₹]/.test(header) || CURRENCY_KEYWORDS.test(header)) {
        types[col] = "currency";
      } else if (ID_HEADERS.test(header.trim())) {
        types[col] = "id";
      } else {
        types[col] = "number";
      }
    } else {
      types[col] = "text";
    }
  }
  return types;
}

function formatIsPercent(styleLib: StyleLibrary, styleIdx: number): boolean {
  return styleLib.numFmtCodeAt(styleIdx).includes("%");
}

function formatIsCurrency(styleLib: StyleLibrary, styleIdx: number): boolean {
  return /[$£€¥₹]/.test(styleLib.numFmtCodeAt(styleIdx));
}

function formatIsDate(styleLib: StyleLibrary, styleIdx: number): boolean {
  const xf = styleLib.xfAt(styleIdx);
  if (DATE_NUMFMT_IDS.has(xf.numFmtId)) return true;
  const code = styleLib.numFmtCodeAt(styleIdx);
  if (/[dy]/i.test(code) && !/^\[?h/i.test(code)) return true;
  return false;
}

function columnHeaderText(sheet: ParsedSheet, headerRow: number, col: number): string {
  return sheet.cells.get(headerRow)?.get(col)?.text ?? "";
}

function dateHeaderHint(header: string, numbers: CellData[]): boolean {
  if (!DATE_KEYWORDS.test(header)) return false;
  // Year-like columns ("Year", "FY2024", "Quarter") are usually not dates.
  if (/year|fy|quarter|^q[1-4]/.test(header)) return false;
  // Values must look like Excel serial dates.
  for (const c of numbers) {
    const n = typeof c.value === "number" ? c.value : parseFloat(String(c.value));
    if (isNaN(n) || n < 1 || n > 2_958_465) return false;
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Quality scoring                                                     */
/* ------------------------------------------------------------------ */

export function computeQuality(sheet: ParsedSheet, styleLib?: StyleLibrary): number {
  let styled = 0;
  let bordered = 0;
  let filled = 0;
  let total = 0;
  const fontNames = new Set<string>();
  for (const rowCells of sheet.cells.values()) {
    for (const c of rowCells.values()) {
      total++;
      if (c.style !== 0) styled++;
      if (styleLib) {
        const xf = styleLib.xfAt(c.style);
        if (xf.borderId !== 0) bordered++;
        if (xf.fillId !== 0) filled++;
        const font = styleLib.fontAt(xf.fontId);
        if (font.name) fontNames.add(font.name.toLowerCase());
      }
    }
  }
  if (total === 0) return 100;
  const styledFrac = styled / total;
  const borderScore = Math.min(1, (bordered / total) * 3);
  const fillScore = Math.min(1, (filled / total) * 2.5);
  const fontScore = styleLib ? (fontNames.size <= 1 ? 1 : 0.35) : 1;
  const score = 30 * styledFrac + 25 * borderScore + 25 * fillScore + 20 * fontScore;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export type Intensity = "full" | "moderate" | "light";

export function intensityFor(quality: number): Intensity {
  if (quality > 78) return "light";
  if (quality >= 55) return "moderate";
  return "full";
}
