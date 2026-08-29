/**
 * Worksheet part model + mutations.
 *
 * Parsing is read-only; mutations are strictly presentation-level:
 *  - cell `s` (style) attribute
 *  - column widths, row heights
 *  - freeze panes, auto-filter
 *
 * Cell values (`v`), formulas (`f`), merges, hyperlinks, conditional
 * formatting, data validation, drawings etc. are never modified here.
 */
import {
  XmlDoc,
  XmlEl,
  WORKSHEET_CHILD_ORDER,
  childElements,
  createElement,
  firstChildElement,
  getAttr,
  insertInCanonicalOrder,
  parseXml,
  serializeXml,
  setAttr,
  setTextContent,
  textContent,
} from "./xml";
import { CellData, MergeRange } from "./types";
import { rangeToRect, refToRC, rcToRef } from "./refs";

export interface ColSpec {
  min: number;
  max: number;
  width?: number;
  hidden?: boolean;
  customWidth?: boolean;
  style?: number;
  outlineLevel?: number;
  collapsed?: boolean;
  bestFit?: boolean;
}

export interface ParsedSheet {
  doc: XmlDoc;
  root: XmlEl;
  sheetDataEl: XmlEl;
  rowEls: XmlEl[];
  rowByNum: Map<number, XmlEl>;
  merges: MergeRange[];
  hyperlinkRefs: Set<string>;
  /** row (1-based) → col (1-based) → cell data (non-empty cells only). */
  cells: Map<number, Map<number, CellData>>;
  /** ref → formula text (normalized, no leading "="). */
  formulaMap: Map<string, string>;
  /** ref → serialized value snapshot used for validation. */
  valueMap: Map<string, string>;
  cellCount: number;
  hasAutoFilter: boolean;
  /** Sheet contains an Excel table (tableParts) — tables provide their own filter UI. */
  hasTable: boolean;
  /** Sheet contains anchored drawings/images/charts — geometry must stay untouched. */
  hasDrawing: boolean;
  hasPane: boolean;
  /** Refs of heading cells whose text was title-cased (for table name sync). */
  casedRefs: Set<string>;
  sheetViewEl: XmlEl | null;
  cols: ColSpec[];
  maxRow: number;
  maxCol: number;
}

export function emptySheet(): ParsedSheet {
  const doc = parseXml(`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"/>`);
  const root = doc.documentElement!;
  return {
    doc,
    root,
    sheetDataEl: root,
    rowEls: [],
    rowByNum: new Map(),
    merges: [],
    hyperlinkRefs: new Set(),
    cells: new Map(),
    formulaMap: new Map(),
    valueMap: new Map(),
    cellCount: 0,
    hasAutoFilter: false,
    hasTable: false,
    hasDrawing: false,
    hasPane: false,
    casedRefs: new Set(),
    sheetViewEl: null,
    cols: [],
    maxRow: 0,
    maxCol: 0,
  };
}

export function parseSheet(xml: string, sharedStrings: string[]): ParsedSheet {
  const doc = parseXml(xml);
  const root = doc.documentElement!;
  const sheetDataEl = firstChildElement(root, "sheetData")!;
  const rowEls = childElements(sheetDataEl, "row");

  const rowByNum = new Map<number, XmlEl>();
  const cells = new Map<number, Map<number, CellData>>();
  const formulaMap = new Map<string, string>();
  const valueMap = new Map<string, string>();
  const hyperlinkRefs = new Set<string>();
  let cellCount = 0;
  let maxRow = 0;
  let maxCol = 0;

  const merges: MergeRange[] = [];
  const mergeEls = firstChildElement(root, "mergeCells");
  if (mergeEls) {
    for (const mc of childElements(mergeEls, "mergeCell")) {
      const ref = getAttr(mc, "ref");
      if (!ref) continue;
      const rect = rangeToRect(ref);
      if (rect) merges.push({ ref, ...rect });
    }
  }

  const hyperlinksEl = firstChildElement(root, "hyperlinks");
  if (hyperlinksEl) {
    for (const hl of childElements(hyperlinksEl, "hyperlink")) {
      const ref = getAttr(hl, "ref");
      if (ref) hyperlinkRefs.add(ref);
    }
  }

  let autoRow = 0;
  for (const rowEl of rowEls) {
    let row = parseInt(getAttr(rowEl, "r") ?? "", 10);
    if (isNaN(row)) row = ++autoRow;
    else autoRow = row;
    rowByNum.set(row, rowEl);
    maxRow = Math.max(maxRow, row);
    let autoCol = 0;
    for (const c of childElements(rowEl, "c")) {
      const ref = getAttr(c, "r");
      let col: number;
      if (ref) {
        const rc = refToRC(ref);
        col = rc ? rc.col : ++autoCol;
      } else {
        col = ++autoCol;
      }
      autoCol = col;
      const data = readCell(c, col, sharedStrings);
      if (!data) continue;
      cellCount++;
      maxCol = Math.max(maxCol, col);
      if (!cells.has(row)) cells.set(row, new Map());
      cells.get(row)!.set(col, data);
      if (data.hasFormula) {
        formulaMap.set(data.ref, data.formula);
      }
      const serialized = serializeCellValue(data);
      if (serialized !== null) valueMap.set(data.ref, serialized);
    }
  }

  const hasAutoFilter = !!firstChildElement(root, "autoFilter");
  const hasTable = !!firstChildElement(root, "tableParts");
  const hasDrawing =
    !!firstChildElement(root, "drawing") || !!firstChildElement(root, "legacyDrawing");
  let sheetViewEl: XmlEl | null = null;
  let hasPane = false;
  const sheetViewsEl = firstChildElement(root, "sheetViews");
  if (sheetViewsEl) {
    const views = childElements(sheetViewsEl, "sheetView");
    if (views.length > 0) {
      sheetViewEl = views[0];
      hasPane = !!firstChildElement(sheetViewEl, "pane");
    }
  }

  const cols: ColSpec[] = [];
  const colsEl = firstChildElement(root, "cols");
  if (colsEl) {
    for (const col of childElements(colsEl, "col")) {
      const min = parseInt(getAttr(col, "min") ?? "1", 10);
      const max = parseInt(getAttr(col, "max") ?? String(min), 10);
      const spec: ColSpec = { min, max };
      const width = getAttr(col, "width");
      if (width !== undefined) spec.width = parseFloat(width);
      const hidden = getAttr(col, "hidden");
      if (hidden !== undefined) spec.hidden = hidden === "1" || hidden === "true";
      const customWidth = getAttr(col, "customWidth");
      if (customWidth !== undefined) spec.customWidth = customWidth === "1" || customWidth === "true";
      const style = getAttr(col, "style");
      if (style !== undefined) spec.style = parseInt(style, 10);
      const outlineLevel = getAttr(col, "outlineLevel");
      if (outlineLevel !== undefined) spec.outlineLevel = parseInt(outlineLevel, 10);
      // SheetJS legacy output writes `level` instead of `outlineLevel`.
      else {
        const level = getAttr(col, "level");
        if (level !== undefined) spec.outlineLevel = parseInt(level, 10);
      }
      const collapsed = getAttr(col, "collapsed");
      if (collapsed !== undefined) spec.collapsed = collapsed === "1" || collapsed === "true";
      const bestFit = getAttr(col, "bestFit");
      if (bestFit !== undefined) spec.bestFit = bestFit === "1" || bestFit === "true";
      cols.push(spec);
    }
  }

  return {
    doc,
    root,
    sheetDataEl,
    rowEls,
    rowByNum,
    merges,
    hyperlinkRefs,
    cells,
    formulaMap,
    valueMap,
    cellCount,
    hasAutoFilter,
    hasTable,
    hasDrawing,
    hasPane,
    casedRefs: new Set(),
    sheetViewEl,
    cols,
    maxRow,
    maxCol,
  };
}

function readCell(c: XmlEl, col: number, sharedStrings: string[]): CellData | null {
  const ref = getAttr(c, "r") ?? "";
  const type = getAttr(c, "t");
  const style = parseInt(getAttr(c, "s") ?? "0", 10) || 0;
  let rc = refToRC(ref);
  if (!rc && ref === "") rc = { row: 0, col };
  const row = rc?.row ?? 0;
  if (row === 0) return null;

  const vEl = firstChildElement(c, "v");
  const fEl = firstChildElement(c, "f");
  const rawV = vEl ? textContent(vEl) : "";
  const formulaText = fEl ? textContent(fEl) : "";
  const formula = normalizeFormula(formulaText);

  let kind: CellData["kind"] = "number";
  let value: string | number | boolean | null = null;
  let text: string | undefined;

  if (fEl) {
    kind = "formula";
    value = rawV;
  } else if (type === "s") {
    kind = "string";
    const idx = parseInt(rawV, 10);
    text = sharedStrings[idx] ?? "";
    value = text;
  } else if (type === "inlineStr") {
    kind = "string";
    const isEl = firstChildElement(c, "is");
    text = isEl ? textContent(isEl) : "";
    value = text;
  } else if (type === "str") {
    kind = "string";
    text = rawV;
    value = rawV;
  } else if (type === "b") {
    kind = "boolean";
    value = rawV === "1" ? true : false;
  } else if (type === "e") {
    kind = "error";
    value = rawV;
  } else if (type === "d") {
    kind = "string";
    text = rawV;
    value = rawV;
  } else {
    // numeric
    const n = parseFloat(rawV);
    value = isNaN(n) ? null : rawV;
    if (value === null && rawV === "") return null;
  }

  return {
    ref: rcToRef(row, col),
    row,
    col,
    kind,
    value,
    hasFormula: !!fEl,
    formula: formula ?? "",
    type,
    style,
    text,
  };
}

function normalizeFormula(f: string): string {
  return f.trim().replace(/^=/, "");
}

function serializeCellValue(c: CellData): string | null {
  switch (c.kind) {
    case "formula":
      return c.value === null || c.value === "" ? null : `n:${c.value}`;
    case "boolean":
      return `b:${c.value ? "1" : "0"}`;
    case "error":
      return `e:${c.value}`;
    case "string":
      return `s:${c.value}`;
    default:
      return `n:${c.value}`;
  }
}

/* ------------------------------------------------------------------ */
/* Mutations                                                           */
/* ------------------------------------------------------------------ */

export function getCellEl(sheet: ParsedSheet, row: number, col: number): XmlEl | null {
  const rowEl = sheet.rowByNum.get(row);
  if (!rowEl) return null;
  const ref = rcToRef(row, col);
  for (const c of childElements(rowEl, "c")) {
    const r = getAttr(c, "r");
    if (r === ref) return c;
  }
  // Fallback: positional lookup (cells without r attributes).
  let i = 0;
  for (const c of childElements(rowEl, "c")) {
    const r = getAttr(c, "r");
    if (r) {
      const rc = refToRC(r);
      if (rc && rc.col === col) return c;
    } else {
      i++;
      if (i === col) return c;
    }
  }
  return null;
}

export function setCellStyle(sheet: ParsedSheet, row: number, col: number, styleIndex: number): void {
  const el = getCellEl(sheet, row, col);
  if (el) setAttr(el, "s", styleIndex);
}

/**
 * Sets the display text of a string cell (heading normalization). Only
 * shared-string cells (converted to inline strings so the shared table and
 * other cells are never affected) and inline-string cells are touched.
 * Formula cells, numeric cells, booleans and errors are never modified.
 * Returns true when the cell text was actually rewritten.
 */
export function setCellText(sheet: ParsedSheet, row: number, col: number, text: string): boolean {
  const el = getCellEl(sheet, row, col);
  if (!el) return false;
  if (firstChildElement(el, "f")) return false; // never touch formula cells
  const t = getAttr(el, "t");
  if (t === "s") {
    // Convert to an inline string so only THIS cell changes — other cells
    // referencing the same shared string are left untouched.
    setAttr(el, "t", "inlineStr");
    const vEl = firstChildElement(el, "v");
    if (vEl) el.removeChild(vEl);
    const is = createElement(sheet.doc, "is");
    const tEl = createElement(sheet.doc, "t");
    if (/^\s|\s$/.test(text)) setAttr(tEl, "xml:space", "preserve");
    setTextContent(tEl, text);
    is.appendChild(tEl);
    el.appendChild(is);
    return true;
  }
  if (t === "inlineStr") {
    const is = firstChildElement(el, "is");
    if (!is) return false;
    const tEl = firstChildElement(is, "t");
    if (!tEl) return false; // rich-text runs — leave untouched
    setTextContent(tEl, text);
    return true;
  }
  return false;
}

/**
 * Rewrites the <cols> block from a per-column width map. Columns not in the
 * map keep their original spec; attributes like `hidden` are preserved.
 */
export function applyColWidths(sheet: ParsedSheet, widths: Map<number, number>): void {
  if (widths.size === 0) return;
  const perCol = new Map<number, ColSpec>();
  for (const spec of sheet.cols) {
    for (let c = spec.min; c <= spec.max; c++) {
      perCol.set(c, { ...spec, min: c, max: c });
    }
  }
  for (const [c, w] of widths) {
    const existing = perCol.get(c);
    perCol.set(c, {
      ...(existing ?? {}),
      min: c,
      max: c,
      width: w,
      customWidth: true,
    });
  }

  // Merge consecutive columns with identical attribute sets.
  const merged: ColSpec[] = [];
  let current: ColSpec | null = null;
  const specKey = (s: ColSpec) =>
    JSON.stringify({
      width: s.width ?? null,
      hidden: s.hidden ?? null,
      customWidth: s.customWidth ?? null,
      style: s.style ?? null,
      outlineLevel: s.outlineLevel ?? null,
      collapsed: s.collapsed ?? null,
      bestFit: s.bestFit ?? null,
    });
  const sortedCols = [...perCol.keys()].sort((a, b) => a - b);
  for (const c of sortedCols) {
    const spec = perCol.get(c)!;
    if (current && specKey(current) === specKey(spec) && current.max + 1 === c) {
      current.max = c;
    } else {
      current = { ...spec };
      merged.push(current);
    }
  }

  const existingColsEl = firstChildElement(sheet.root, "cols");
  const colsEl = existingColsEl ?? createElement(sheet.doc, "cols");
  if (!existingColsEl) {
    insertInCanonicalOrder(sheet.root, colsEl, WORKSHEET_CHILD_ORDER);
  } else {
    while (colsEl.firstChild) colsEl.removeChild(colsEl.firstChild);
  }
  for (const spec of merged) {
    const attrs: Record<string, string | number> = { min: spec.min, max: spec.max };
    if (spec.width !== undefined) attrs.width = spec.width;
    if (spec.hidden) attrs.hidden = "1";
    if (spec.customWidth) attrs.customWidth = "1";
    if (spec.style !== undefined) attrs.style = spec.style;
    if (spec.outlineLevel !== undefined) attrs.outlineLevel = spec.outlineLevel;
    if (spec.collapsed) attrs.collapsed = "1";
    if (spec.bestFit) attrs.bestFit = "1";
    colsEl.appendChild(createElement(sheet.doc, "col", attrs));
  }
}

export function applyRowHeight(sheet: ParsedSheet, row: number, height: number): void {
  const rowEl = sheet.rowByNum.get(row);
  if (!rowEl) return;
  setAttr(rowEl, "ht", height.toFixed(2));
  setAttr(rowEl, "customHeight", "1");
}

/** Freezes the top `rows` rows. Preserves an existing pane if present. */
export function applyFreezePanes(sheet: ParsedSheet, rows: number): void {
  if (rows <= 0) return;
  if (sheet.hasPane) return;

  let sheetViewsEl = firstChildElement(sheet.root, "sheetViews");
  if (!sheetViewsEl) {
    sheetViewsEl = createElement(sheet.doc, "sheetViews");
    insertInCanonicalOrder(sheet.root, sheetViewsEl, WORKSHEET_CHILD_ORDER);
  }
  let view = sheet.sheetViewEl;
  if (!view) {
    view = createElement(sheet.doc, "sheetView", { workbookViewId: "0" });
    sheetViewsEl.appendChild(view);
  }
  if (firstChildElement(view, "pane")) return; // already frozen

  const topLeft = rcToRef(rows + 1, 1);

  // Mirror Excel's own serialization for a frozen header exactly: pane with
  // ySplit only (no xSplit="0"), then the two selections Excel writes, each
  // tagged with its pane. Any existing pane/selection children are replaced —
  // a <selection> without a `pane` attribute sitting next to a frozen pane is
  // not a shape Excel itself ever writes, and its loader is stricter about
  // pane/selection consistency than the OOXML schema is. Attributes are also
  // limited to the CT_Pane/CT_Selection sets (filterMode etc. would make
  // Excel reject the whole file as corrupt).
  const pane = createElement(sheet.doc, "pane", {
    ySplit: rows,
    topLeftCell: topLeft,
    activePane: "bottomLeft",
    state: "frozen",
  });
  // Drop existing pane/selection children first (childElements returns a
  // snapshot, so removal while iterating is safe).
  for (const child of childElements(view)) {
    const name = child.localName || child.nodeName;
    if (name === "pane" || name === "selection") {
      view.removeChild(child);
    }
  }
  // CT_SheetView children must follow the order pane, selection*,
  // pivotSelection*, extLst. Pane is inserted as the FIRST child and each
  // selection directly after it — appending at the end would place them
  // after any existing pivotSelection/extLst, which Excel flags as "found a
  // problem with some content".
  const sel1 = createElement(sheet.doc, "selection", {
    pane: "topLeft",
    activeCell: "A1",
    activeCellId: "0",
    sqref: "A1",
  });
  const sel2 = createElement(sheet.doc, "selection", {
    pane: "bottomLeft",
    activeCell: topLeft,
    activeCellId: "0",
    sqref: topLeft,
  });
  view.insertBefore(pane, view.firstChild);
  view.insertBefore(sel1, pane.nextSibling);
  view.insertBefore(sel2, sel1.nextSibling);
}

/** Adds an auto-filter over `ref` unless one already exists. */
export function applyAutoFilter(sheet: ParsedSheet, ref: string): void {
  if (sheet.hasAutoFilter) return;
  const el = createElement(sheet.doc, "autoFilter", { ref });
  insertInCanonicalOrder(sheet.root, el, WORKSHEET_CHILD_ORDER);
  // Note: no `filterMode` attribute on sheetView — it is not part of
  // CT_SheetView and makes Excel report the file as corrupt.
}

export function serializeSheet(sheet: ParsedSheet): string {
  return serializeXml(sheet.doc);
}

/**
 * Shift all rows and cells in the ParsedSheet DOM by `rowsToInsert` starting
 * from `insertAtRow`. This keeps the DOM, cell maps, formula maps, and merge
 * ranges in sync after insertRowsInWorksheet modifies the XML string.
 *
 * Must be called BEFORE serializeSheet() so that the serialized XML reflects
 * the inserted rows and shifted cell references.
 */
export function shiftSheetRows(
  sheet: ParsedSheet,
  insertAtRow: number,
  rowsToInsert: number,
  cellMapping: Map<string, string>,
): void {
  if (rowsToInsert <= 0) return;

  // 1. Shift rowByNum entries: move rows >= insertAtRow to new positions
  const shiftedRows = new Map<number, XmlEl>();
  for (const [rowNum, rowEl] of sheet.rowByNum) {
    if (rowNum >= insertAtRow) {
      shiftedRows.set(rowNum + rowsToInsert, rowEl);
      // Update the r="..." attribute on the <row> element
      for (let i = 0; i < rowEl.attributes.length; i++) {
        const attr = rowEl.attributes[i];
        if (attr.localName === 'r' || attr.nodeName === 'r') {
          rowEl.setAttribute('r', String(rowNum + rowsToInsert));
          break;
        }
      }
    }
  }
  // Add shifted entries to rowByNum and remove old ones
  for (const [newRow, rowEl] of shiftedRows) {
    sheet.rowByNum.set(newRow, rowEl);
  }
  for (const oldRow of shiftedRows.keys()) {
    sheet.rowByNum.delete(oldRow);
  }

  // 2. Shift cells map: move cells at rows >= insertAtRow
  const shiftedCells = new Map<number, Map<number, CellData>>();
  for (const [row, colMap] of sheet.cells) {
    if (row >= insertAtRow) {
      shiftedCells.set(row + rowsToInsert, colMap);
    }
  }
  for (const [newRow, colMap] of shiftedCells) {
    sheet.cells.set(newRow, colMap);
  }
  for (const oldRow of shiftedCells.keys()) {
    sheet.cells.delete(oldRow);
  }

  // 3. Rebuild formulaMap and valueMap using cellMapping
  const newFormulaMap = new Map<string, string>();
  const newValueMap = new Map<string, string>();
  for (const [ref, formula] of sheet.formulaMap) {
    const newRef = cellMapping.get(ref);
    if (newRef) {
      newFormulaMap.set(newRef, formula);
    } else {
      newFormulaMap.set(ref, formula);
    }
  }
  for (const [ref, value] of sheet.valueMap) {
    const newRef = cellMapping.get(ref);
    if (newRef) {
      newValueMap.set(newRef, value);
    } else {
      newValueMap.set(ref, value);
    }
  }
  sheet.formulaMap = newFormulaMap;
  sheet.valueMap = newValueMap;

  // 4. Shift merge ranges
  for (const merge of sheet.merges) {
    if (merge.row1 >= insertAtRow) merge.row1 += rowsToInsert;
    if (merge.row2 >= insertAtRow) merge.row2 += rowsToInsert;
    // Update ref string
    const colStart = String.fromCharCode(64 + merge.col1);
    const colEnd = String.fromCharCode(64 + merge.col2);
    merge.ref = `${colStart}${merge.row1}:${colEnd}${merge.row2}`;
  }

  // 5. Update maxRow
  if (sheet.maxRow >= insertAtRow) {
    sheet.maxRow += rowsToInsert;
  }

  // 6. Update <c r="..."> attributes in the DOM to match the cellMapping.
  // insertRowsInWorksheet already updated the XML string, but the DOM's
  // <c> elements still have the old r attributes. Without this step,
  // serializeSheet would write stale references (e.g. <c r="B11"> in
  // <row r="19">) which the validator cannot match.
  for (const [oldRef, newRef] of cellMapping) {
    const rc = refToRC(oldRef);
    if (!rc) continue;
    const rowEl = sheet.rowByNum.get(rc.row);
    if (!rowEl) continue;
    for (const c of childElements(rowEl, 'c')) {
      const r = getAttr(c, 'r');
      if (r === oldRef) {
        setAttr(c, 'r', newRef);
        break;
      }
    }
  }
}