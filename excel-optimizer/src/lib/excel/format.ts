/**
 * The safe optimizer. Applies the detection plan as presentation-only
 * changes: cell styles, column widths, row heights, freeze panes and
 * auto-filters. Never modifies a cell value, formula, merge, hyperlink,
 * conditional format, data validation or drawing.
 */
import { Intensity, intensityFor } from "./detect";
import { FontSpec, StyleLibrary, XfAlignment } from "./styles";
import { toTitleCase, correctTypos } from "./casing";
import {
  ParsedSheet,
  applyAutoFilter,
  applyColWidths,
  applyFreezePanes,
  applyRowHeight,
  setCellStyle,
  setCellText,
} from "./worksheet";
import { CellData, ColumnType, OptimizerSettings, RowKind } from "./types";
import { colToName, rangeToRect } from "./refs";

export interface FormatCounters {
  cellsStandardized: number;
  columnsOptimized: number;
  rowsHeightOptimized: number;
  headingsFormatted: number;
  tablesOptimized: number;
  totalRowsFormatted: number;
  subtotalRowsFormatted: number;
  notesFormatted: number;
  headingsTitleCased: number;
}

export function emptyCounters(): FormatCounters {
  return {
    cellsStandardized: 0,
    columnsOptimized: 0,
    rowsHeightOptimized: 0,
    headingsFormatted: 0,
    tablesOptimized: 0,
    totalRowsFormatted: 0,
    subtotalRowsFormatted: 0,
    notesFormatted: 0,
    headingsTitleCased: 0,
  };
}

interface TablePlan {
  headerRow: number;
  firstDataRow: number;
  lastDataRow: number;
  colMin: number;
  colMax: number;
  totalRows: number[];
  subtotalRows: number[];
  columnTypes: Record<number, ColumnType>;
}

/* ------------------------------------------------------------------ */
/* Palette (Modern theme — quiet neutrals + refined slate/indigo)      */
/* ------------------------------------------------------------------ */

const COLOR_TITLE = "FF0F172A";
const COLOR_SECTION = "FF1E293B";
const COLOR_SUBTITLE = "FF334155";
const COLOR_HEADER_TEXT = "FFFFFFFF";
const COLOR_HEADER_TEXT_MINIMAL = "FF1E293B";
const COLOR_NOTE = "FF64748B";
const COLOR_HEADER_FILL = "FF334155"; // slate-700
const COLOR_HEADER_FILL_ACCENT = "FF4F46E5"; // indigo-600
const COLOR_ALT_FILL = "FFF8FAFC"; // slate-50
const COLOR_TOTAL_FILL = "FFEEF2FF"; // indigo-50
const COLOR_SUBTOTAL_FILL = "FFF1F5F9"; // slate-100
const COLOR_GRID = "FFE2E8F0"; // slate-200
const COLOR_HEADER_BOTTOM = "FF64748B"; // slate-500
const COLOR_TOTAL_TOP = "FF94A3B8"; // slate-400

/* ------------------------------------------------------------------ */

export function formatSheet(
  sheet: ParsedSheet,
  detection: { rowKinds: Record<number, RowKind>; quality: number; tables: TablePlan[] },
  styleLib: StyleLibrary,
  settings: OptimizerSettings,
  counters: FormatCounters,
): boolean {
  let dirty = false;
  const intensity: Intensity = intensityFor(detection.quality);
  const styling = intensity !== "light";
  const fontName = settings.globalFont;

  // Pre-build style parts.
  const titleFont = styleLib.addFont({ name: fontName, size: settings.titleFontSize, bold: true, color: { rgb: COLOR_TITLE } });
  const sectionFont = styleLib.addFont({ name: fontName, size: settings.headingFontSize, bold: true, color: { rgb: COLOR_SECTION } });
  const subtitleFont = styleLib.addFont({ name: fontName, size: settings.subheadingFontSize, bold: true, color: { rgb: COLOR_SUBTITLE } });
  const headerFont = styleLib.addFont({
    name: fontName,
    size: settings.tableHeaderFontSize,
    bold: true,
    color: { rgb: settings.headerStyle === "minimal" ? COLOR_HEADER_TEXT_MINIMAL : COLOR_HEADER_TEXT },
  });
  const noteFont = styleLib.addFont({ name: fontName, size: 9, italic: true, color: { rgb: COLOR_NOTE } });

  const headerFill =
    settings.headerStyle === "accent"
      ? styleLib.solidFill(COLOR_HEADER_FILL_ACCENT)
      : settings.headerStyle === "minimal"
        ? 0
        : styleLib.solidFill(COLOR_HEADER_FILL);
  const altFill = styleLib.solidFill(COLOR_ALT_FILL);
  const totalFill = styleLib.solidFill(COLOR_TOTAL_FILL);
  const subtotalFill = styleLib.solidFill(COLOR_SUBTOTAL_FILL);

  const thin = { style: "thin", color: { rgb: COLOR_GRID } };
  const gridBorder = styleLib.addBorder({ left: thin, right: thin, top: thin, bottom: thin });
  const headerBorder = styleLib.addBorder({
    left: thin,
    right: thin,
    top: thin,
    bottom: { style: "medium", color: { rgb: COLOR_HEADER_BOTTOM } },
  });
  const totalBorder = styleLib.addBorder({
    left: thin,
    right: thin,
    bottom: thin,
    top: { style: "medium", color: { rgb: COLOR_TOTAL_TOP } },
  });

  const bordersOn = settings.borders === "on" || (settings.borders === "automatic" && styling);
  const alternatingOn = settings.alternatingRows === "on" || (settings.alternatingRows === "automatic" && styling);

  let frozen = false;
  let filtered = false;

  for (const table of detection.tables) {
    counters.tablesOptimized++;
    const colTypes = table.columnTypes;

    /* ------------------------- column widths ------------------------- */
    // Sheets with anchored drawings/images/charts keep their geometry: column
    // width changes resize every anchored picture, which makes screenshots
    // shrink, stretch and overlap. Styling is safe; geometry is not.
    if (settings.columnWidth === "automatic" && !sheet.hasDrawing) {
      const widths = new Map<number, number>();
      for (let c = table.colMin; c <= table.colMax; c++) {
        if (isHiddenColumn(sheet, c)) continue;
        const w = computeColumnWidth(sheet, table, c, settings);
        if (w === null) continue;
        const existing = existingColumnWidth(sheet, c);
        if (existing === null || Math.abs(existing - w) > 1.2) widths.set(c, w);
      }
      if (widths.size > 0) {
        applyColWidths(sheet, widths);
        counters.columnsOptimized += widths.size;
        dirty = true;
      }
    }

    /* -------------------------- cell styling ------------------------- */
    if (styling) {
      // Header row.
      let headerChanged = false;
      for (let c = table.colMin; c <= table.colMax; c++) {
        const cell = sheet.cells.get(table.headerRow)?.get(c);
        if (!cell) continue;
        const long = isLongText(cell);
        const align = settings.alignment === "automatic" ? { horizontal: "center", vertical: "center", wrapText: long && wrapEnabled(settings, long) } : undefined;
        const changed = styleCell(sheet, styleLib, cell, {
          fontId: headerFont,
          fillId: headerFill,
          borderId: bordersOn ? headerBorder : undefined,
          alignment: align,
          skipFillWhenExisting: headerFill === 0,
          keepFontIfHyperlink: sheet.hyperlinkRefs.has(cell.ref),
        });
        if (changed) headerChanged = true;
      }
      if (headerChanged) {
        counters.headingsFormatted++;
        dirty = true;
      }

      // Data rows.
      for (let r = table.firstDataRow; r <= table.lastDataRow; r++) {
        const kind = detection.rowKinds[r] ?? "data";
        const isTotal = kind === "total";
        const isSubtotal = kind === "subtotal";
        const banded = alternatingOn && !isTotal && !isSubtotal && (r - table.firstDataRow) % 2 === 1;
        for (let c = table.colMin; c <= table.colMax; c++) {
          const cell = sheet.cells.get(r)?.get(c);
          if (!cell) continue;
          const colType = colTypes[c] ?? "text";
          const long = isLongText(cell);
          const wrap = wrapEnabled(settings, long) && (colType === "text" || colType === "id");
          const align = settings.alignment === "automatic" ? alignmentFor(colType, wrap) : undefined;
          const colHeader = sheet.cells.get(table.headerRow)?.get(c)?.text ?? "";
          const numFmtId = numberFormatIdFor(sheet, styleLib, settings, cell, colType, colHeader, table);

          const fontSpec = isTotal || isSubtotal ? bodyFont(styleLib, cell, settings, true) : bodyFont(styleLib, cell, settings, false);

          const changed = styleCell(sheet, styleLib, cell, {
            fontSpec,
            fillId: isTotal ? totalFill : isSubtotal ? subtotalFill : banded ? altFill : undefined,
            borderId: bordersOn ? (isTotal ? totalBorder : gridBorder) : undefined,
            alignment: align,
            numFmtId,
            skipFillWhenExisting: true,
            keepFontIfHyperlink: sheet.hyperlinkRefs.has(cell.ref),
          });
          if (changed) {
            counters.cellsStandardized++;
            dirty = true;
          }
        }
        if (isTotal) counters.totalRowsFormatted++;
        if (isSubtotal) counters.subtotalRowsFormatted++;
      }
    }

    /* ----------------------- freeze + filter ------------------------- */
    if (!frozen && settings.freezeHeaders !== "off" && !sheet.hasPane && table.headerRow <= 5) {
      applyFreezePanes(sheet, table.headerRow);
      frozen = true;
      dirty = true;
    }
    // A sheet that already has an Excel table (tableParts) must not get an
    // auto-filter element as well — tables provide their own filter UI, and
    // Excel rejects the duplicate filter over the same range as corrupt.
    if (!filtered && settings.autoFilter !== "off" && !sheet.hasAutoFilter && !sheet.hasTable && table.lastDataRow > table.headerRow) {
      const ref = `${colToName(table.colMin)}${table.headerRow}:${colToName(table.colMax)}${table.lastDataRow}`;
      // An auto-filter whose range overlaps merged cells is rejected by Excel
      // as corrupt — skip the filter rather than ship a file Excel flags.
      if (!overlapsMerge(sheet, ref)) {
        applyAutoFilter(sheet, ref);
        filtered = true;
        dirty = true;
      }
    }
  }

  /* ------------------------- row heights ---------------------------- */
  // Same rule as column widths: row-height changes also shift anchored
  // drawings, so sheets with images keep their original row heights.
  if (styling && settings.rowHeight === "automatic" && !sheet.hasDrawing) {
    const before = counters.rowsHeightOptimized;
    optimizeRowHeights(sheet, detection.tables, settings, counters);
    if (counters.rowsHeightOptimized !== before) dirty = true;
  }

  /* -------------------- headings / notes outside tables ------------- */
  if (styling) {
    const roleStyle: Partial<Record<RowKind, { fontId: number; align: XfAlignment }>> = {
      title: { fontId: titleFont, align: { horizontal: "left", vertical: "center" } },
      subtitle: { fontId: subtitleFont, align: { horizontal: "left", vertical: "center" } },
      section: { fontId: sectionFont, align: { horizontal: "left", vertical: "center" } },
      note: { fontId: noteFont, align: { horizontal: "left", vertical: "center" } },
    };
    for (const [rowStr, kind] of Object.entries(detection.rowKinds)) {
      const rs = roleStyle[kind];
      if (!rs) continue;
      const row = parseInt(rowStr, 10);
      const cells = sheet.cells.get(row);
      if (!cells) continue;
      for (const cell of cells.values()) {
        const changed = styleCell(sheet, styleLib, cell, {
          fontId: rs.fontId,
          alignment: settings.alignment === "automatic" ? rs.align : undefined,
          keepFontIfHyperlink: sheet.hyperlinkRefs.has(cell.ref),
        });
        if (changed) {
          dirty = true;
          if (kind === "title" || kind === "subtitle" || kind === "section") counters.headingsFormatted++;
          if (kind === "note") counters.notesFormatted++;
        }
      }
    }
  }

  /* --------------- heading text normalization (title case) ---------- */
  // Titles, subtitles, section labels and table header cells are re-cased so
  // every sheet reads consistently ("PROJECT 11 TESTING SUMMARY" and
  // "test automation execution dashboard 5" → "Project 11 Testing Summary").
  // Only cells the detector classified as headings are touched — data cells
  // are never modified — and only when the text actually changes.
  if (settings.titleCase || settings.correctTypos) {
    const seen = new Set<string>();
    const tryCase = (cell: CellData) => {
      const key = `${cell.row}:${cell.col}`;
      if (seen.has(key)) return;
      seen.add(key);
      if (applyTitleCase(sheet, cell, settings) ) {
        counters.headingsTitleCased++;
        dirty = true;
      }
    };
    for (const [rowStr, kind] of Object.entries(detection.rowKinds)) {
      if (kind !== "title" && kind !== "subtitle" && kind !== "section") continue;
      const row = parseInt(rowStr, 10);
      const cells = sheet.cells.get(row);
      if (!cells) continue;
      for (const cell of cells.values()) tryCase(cell);
    }
    for (const table of detection.tables) {
      const header = sheet.cells.get(table.headerRow);
      if (!header) continue;
      for (let c = table.colMin; c <= table.colMax; c++) {
        const cell = header.get(c);
        if (cell) tryCase(cell);
      }
    }
  }

  /* --------------- typo corrections for data cells ---------- */
  // Apply typo/spelling corrections to ALL string cells (not just headings).
  // This fixes common misspellings like "pupose" → "purpose".
  if (settings.correctTypos) {
    for (const [row, cells] of sheet.cells) {
      for (const cell of cells.values()) {
        if (cell.kind !== "string" || cell.hasFormula) continue;
        const text = cell.text ?? "";
        if (!text) continue;
        const corrected = correctTypos(text);
        if (corrected !== text) {
          if (setCellText(sheet, cell.row, cell.col, corrected)) {
            dirty = true;
          }
        }
      }
    }
  }

  return dirty;
}

/** Rewrites a heading cell's text to title case (with typo corrections). Returns true when changed. */
function applyTitleCase(sheet: ParsedSheet, cell: CellData, settings: OptimizerSettings): boolean {
  if (cell.kind !== "string" || cell.hasFormula) return false;
  const text = cell.text ?? "";
  if (!text) return false;
  // Apply typo/spelling corrections first, then title case
  const corrected = settings.correctTypos ? correctTypos(text) : text;
  const cased = toTitleCase(corrected);
  if (cased === text) return false;
  if (setCellText(sheet, cell.row, cell.col, cased)) {
    sheet.casedRefs.add(cell.ref);
    return true;
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* Per-cell styling                                                    */
/* ------------------------------------------------------------------ */

interface StyleOptions {
  fontId?: number;
  fontSpec?: FontSpec | null;
  fillId?: number;
  borderId?: number;
  alignment?: XfAlignment;
  numFmtId?: number;
  skipFillWhenExisting?: boolean;
  keepFontIfHyperlink?: boolean;
}

function styleCell(sheet: ParsedSheet, styleLib: StyleLibrary, cell: CellData, opts: StyleOptions): boolean {
  const xf = styleLib.xfAt(cell.style);

  let fontId = xf.fontId;
  if (opts.keepFontIfHyperlink) {
    fontId = xf.fontId;
  } else if (opts.fontId !== undefined) {
    fontId = opts.fontId;
  } else if (opts.fontSpec) {
    fontId = styleLib.addFont(opts.fontSpec);
  }

  let fillId = xf.fillId;
  if (opts.fillId !== undefined) {
    if (opts.fillId === 0) fillId = 0;
    else if (!(opts.skipFillWhenExisting && xf.fillId !== 0)) fillId = opts.fillId;
  }

  let borderId = xf.borderId;
  if (opts.borderId !== undefined) {
    // Don't overwrite meaningful existing borders (status/emphasis styling).
    borderId = opts.borderId !== 0 && xf.borderId !== 0 ? xf.borderId : opts.borderId;
  }

  const numFmtId = opts.numFmtId !== undefined ? opts.numFmtId : xf.numFmtId;
  const alignment = opts.alignment !== undefined ? opts.alignment : xf.alignment;

  if (
    fontId === xf.fontId &&
    fillId === xf.fillId &&
    borderId === xf.borderId &&
    numFmtId === xf.numFmtId &&
    sameAlignment(alignment, xf.alignment)
  ) {
    return false;
  }
  const newIdx = styleLib.addXf({ numFmtId, fontId, fillId, borderId, alignment });
  setCellStyle(sheet, cell.row, cell.col, newIdx);
  return true;
}

function sameAlignment(a: XfAlignment | undefined, b: XfAlignment | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return a.horizontal === b.horizontal && a.vertical === b.vertical && !!a.wrapText === !!b.wrapText;
}

function bodyFont(styleLib: StyleLibrary, cell: CellData, settings: OptimizerSettings, forceBold: boolean): FontSpec | null {
  const orig = styleLib.fontAt(styleLib.xfAt(cell.style).fontId);
  const targetName = settings.globalFont;
  const targetSize = settings.bodyFontSize;
  const nameChanged = (orig.name ?? "").toLowerCase() !== targetName.toLowerCase();
  const sizeChanged = (orig.size ?? 0) !== targetSize;
  if (!nameChanged && !sizeChanged && !forceBold) return null;
  const spec: FontSpec = {
    bold: forceBold || orig.bold,
    italic: orig.italic,
    underline: orig.underline,
    strike: orig.strike,
    color: orig.color,
    name: targetName,
    size: targetSize,
  };
  if (nameChanged) {
    // Drop theme scheme when switching to an explicit font family.
    spec.family = undefined;
    spec.scheme = undefined;
  }
  return spec;
}

/* ------------------------------------------------------------------ */
/* Number formats                                                      */
/* ------------------------------------------------------------------ */

function numberFormatIdFor(
  sheet: ParsedSheet,
  styleLib: StyleLibrary,
  settings: OptimizerSettings,
  cell: CellData,
  colType: ColumnType,
  headerText: string,
  table: TablePlan,
): number | undefined {
  if (!settings.numberFormatting) return undefined;
  if (!styleLib.isReplaceableNumberFormat(cell.style)) return undefined;
  let code: string | null = null;
  switch (colType) {
    case "number": {
      code = columnAllIntegers(sheet, cell.col, table) ? "#,##0" : "#,##0.00";
      break;
    }
    case "currency": {
      if (!settings.currencyDetection) return undefined;
      code = `${currencySymbol(headerText)}#,##0.00`;
      break;
    }
    case "percent": {
      if (!settings.percentDetection) return undefined;
      code = "0.0%";
      break;
    }
    case "date": {
      if (!settings.dateDetection) return undefined;
      code = dateFormatCode(sheet, cell.col, table, settings);
      break;
    }
    default:
      return undefined;
  }
  if (!code) return undefined;
  return styleLib.numFmtIdFor(code);
}

function columnAllIntegers(sheet: ParsedSheet, col: number, table: TablePlan): boolean {
  let any = false;
  for (let r = table.firstDataRow; r <= table.lastDataRow; r++) {
    const c = sheet.cells.get(r)?.get(col);
    if (!c) continue;
    const v = typeof c.value === "number" ? c.value : parseFloat(String(c.value ?? ""));
    if (isNaN(v)) continue;
    any = true;
    if (!Number.isInteger(v)) return false;
  }
  return any;
}

function currencySymbol(headerText: string): string {
  for (const s of ["€", "£", "¥", "₹", "$"]) {
    if (headerText.includes(s)) return s;
  }
  return "$";
}

function dateFormatCode(sheet: ParsedSheet, col: number, table: TablePlan, settings: OptimizerSettings): string {
  const base = settings.dateFormat;
  let anyValue = false;
  let anyFractional = false;
  let allUnderOne = true;
  for (let r = table.firstDataRow; r <= table.lastDataRow; r++) {
    const c = sheet.cells.get(r)?.get(col);
    if (!c) continue;
    const v = typeof c.value === "number" ? c.value : parseFloat(String(c.value ?? ""));
    if (isNaN(v)) continue;
    anyValue = true;
    if (v % 1 !== 0) anyFractional = true;
    if (v >= 1) allUnderOne = false;
  }
  if (!anyValue) return base;
  if (allUnderOne) return "hh:mm";
  return anyFractional ? `${base} hh:mm` : base;
}

/* ------------------------------------------------------------------ */
/* Alignment / wrap                                                    */
/* ------------------------------------------------------------------ */

function alignmentFor(colType: ColumnType, wrap: boolean): XfAlignment {
  switch (colType) {
    case "number":
    case "currency":
    case "percent":
    case "id":
      return { horizontal: "right", vertical: "center" };
    case "date":
      return { horizontal: "center", vertical: "center" };
    default:
      return wrap ? { horizontal: "left", vertical: "top", wrapText: true } : { horizontal: "left", vertical: "center" };
  }
}

function wrapEnabled(settings: OptimizerSettings, long: boolean): boolean {
  if (settings.wrapText === "off") return false;
  if (settings.wrapText === "on") return true;
  return long;
}

function isLongText(cell: CellData): boolean {
  const t = cell.text ?? "";
  return t.length > 30 || t.includes("\n");
}

/* ------------------------------------------------------------------ */
/* Widths / heights                                                    */
/* ------------------------------------------------------------------ */

function computeColumnWidth(sheet: ParsedSheet, table: TablePlan, col: number, _settings: OptimizerSettings): number | null {
  const colType = table.columnTypes[col] ?? "text";
  const headerLen = cellTextLen(sheet, table.headerRow, col);
  let maxValueLen = 0;
  let maxLine = 0;
  let hasNewline = false;
  let hasFractional = false;
  for (let r = table.firstDataRow; r <= table.lastDataRow; r++) {
    const cell = sheet.cells.get(r)?.get(col);
    if (!cell) continue;
    const t = cell.text ?? "";
    const lines = t.split("\n");
    if (lines.length > 1) hasNewline = true;
    for (const line of lines) maxLine = Math.max(maxLine, line.length);
    if (cell.kind === "number" || cell.hasFormula) {
      const s = typeof cell.value === "number" ? String(cell.value) : String(cell.value ?? "");
      maxValueLen = Math.max(maxValueLen, s.length);
      const n = parseFloat(s);
      if (!isNaN(n) && n % 1 !== 0) hasFractional = true;
    }
  }

  let width: number;
  switch (colType) {
    case "number":
      width = clamp(maxValueLen + 3, 9, 22);
      break;
    case "currency":
      width = clamp(maxValueLen + 4, 10, 24);
      break;
    case "percent":
      width = clamp(maxValueLen + 2, 8, 14);
      break;
    case "date":
      width = hasFractional ? 17 : 12;
      break;
    case "id":
      width = clamp(maxLine + 2, 8, 16);
      break;
    default: {
      const longest = Math.max(headerLen, maxLine);
      if (longest > 45 || hasNewline) {
        width = clamp(longest + 2, 12, 60);
      } else {
        width = clamp(longest + 2, 8, 40);
      }
    }
  }
  return Math.round(width * 10) / 10;
}

function optimizeRowHeights(sheet: ParsedSheet, tables: TablePlan[], settings: OptimizerSettings, counters: FormatCounters): void {
  const widthByCol = new Map<number, number>();
  for (const spec of sheet.cols) {
    for (let c = spec.min; c <= spec.max; c++) widthByCol.set(c, spec.width ?? 9);
  }
  const perLine = settings.bodyFontSize + 4.5;
  for (const table of tables) {
    for (let r = table.headerRow; r <= table.lastDataRow; r++) {
      let maxLines = 1;
      for (let c = table.colMin; c <= table.colMax; c++) {
        const cell = sheet.cells.get(r)?.get(c);
        if (!cell) continue;
        const colType = table.columnTypes[c] ?? "text";
        if (colType !== "text" && colType !== "id") continue;
        const t = cell.text ?? "";
        if (!t) continue;
        const long = t.length > 30 || t.includes("\n");
        if (!wrapEnabled(settings, long)) continue;
        const width = widthByCol.get(c) ?? 9;
        const charsPerLine = Math.max(4, Math.floor(width * 1.05));
        const lines = Math.max(1, Math.ceil(t.length / charsPerLine));
        maxLines = Math.max(maxLines, lines);
      }
      if (maxLines <= 1) continue;
      const target = Math.min(120, Math.round(maxLines * perLine + 2));
      const current = currentRowHeight(sheet, r);
      if (target > current + 1.5) {
        applyRowHeight(sheet, r, target);
        counters.rowsHeightOptimized++;
      }
    }
  }
}

function currentRowHeight(sheet: ParsedSheet, row: number): number {
  const rowEl = sheet.rowByNum.get(row);
  if (!rowEl) return 15;
  const ht = rowEl.getAttribute("ht");
  const n = ht ? parseFloat(ht) : NaN;
  return isNaN(n) ? 15 : n;
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

function cellTextLen(sheet: ParsedSheet, row: number, col: number): number {
  return sheet.cells.get(row)?.get(col)?.text?.length ?? 0;
}

function existingColumnWidth(sheet: ParsedSheet, col: number): number | null {
  for (const spec of sheet.cols) {
    if (col >= spec.min && col <= spec.max) return spec.width ?? null;
  }
  return null;
}

function isHiddenColumn(sheet: ParsedSheet, col: number): boolean {
  for (const spec of sheet.cols) {
    if (col >= spec.min && col <= spec.max) return !!spec.hidden;
  }
  return false;
}

function overlapsMerge(sheet: ParsedSheet, ref: string): boolean {
  const rect = rangeToRect(ref);
  if (!rect) return false;
  for (const m of sheet.merges) {
    if (rect.row1 <= m.row2 && rect.row2 >= m.row1 && rect.col1 <= m.col2 && rect.col2 >= m.col1) {
      return true;
    }
  }
  return false;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
