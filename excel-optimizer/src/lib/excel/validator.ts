/**
 * Validation engine.
 *
 * The optimizer never trusts its own save: after producing the output it
 * re-parses the workbook and compares it against the original — formulas,
 * cell values, merged ranges, worksheet names/order/visibility, and the
 * presence of charts, pivot tables, images and macros. Any difference fails
 * the run and no output is delivered.
 */
import { SheetSnapshot, WorkbookSnapshot } from "./analyzer";
import { Zip, readEntryText } from "./zip";
import { toTitleCase, correctTypos } from "./casing";
import { SheetInfo } from "./types";
import {
  WORKSHEET_CHILD_ORDER,
  XmlEl,
  childElements,
  escapeIllegalXmlChars,
  firstChildElement,
  getAttr,
  parseXml,
  textContent,
} from "./xml";
import { rangeToRect } from "./refs";

export interface ValidationResult {
  passed: boolean;
  differences: string[];
}

/**
 * Attribute whitelists for the presentation elements this engine creates or
 * mutates. Excel rejects files containing attributes that are not part of the
 * OOXML schema (e.g. `filterMode` on sheetView), so any violation fails the
 * run before a file is offered for download.
 */
const SCHEMA_ATTRS: Record<string, Set<string>> = {
  sheetView: new Set([
    "windowProtection", "showFormulas", "showGridLines", "showRowColHeaders",
    "showZeros", "rightToLeft", "tabSelected", "showRuler",
    "showOutlineSymbols", "showUnfiltered", "showWhiteSpace", "view",
    "topLeftCell", "colorId", "zoomScale", "zoomScaleNormal",
    "zoomScaleSheetLayoutView", "zoomScalePageLayoutView", "workbookViewId",
    "defaultGridColor",
  ]),
  pane: new Set(["xSplit", "ySplit", "topLeftCell", "activePane", "state"]),
  selection: new Set(["pane", "activeCell", "activeCellId", "sqref"]),
  col: new Set(["min", "max", "width", "style", "hidden", "bestFit", "customWidth", "outlineLevel", "collapsed", "phonetic"]),
  row: new Set(["r", "spans", "s", "customFormat", "ht", "hidden", "customHeight", "outlineLevel", "collapsed", "thickTop", "thickBot", "ph"]),
  autoFilter: new Set(["ref"]),
  mergeCell: new Set(["ref"]),
};

/**
 * Scans the worksheet + styles parts the optimizer rewrites and reports any
 * attribute that is not part of the OOXML schema for that element. Returns an
 * empty array when everything is schema-safe.
 */
export async function checkPartAttributes(zip: Zip, sheetInfos: SheetInfo[]): Promise<string[]> {
  const violations: string[] = [];
  const parts = [...sheetInfos.map((s) => s.file), "xl/styles.xml"];
  for (const part of parts) {
    const xml = await readEntryText(zip, part);
    if (!xml) continue;
    let doc;
    try {
      doc = parseXml(xml);
    } catch {
      violations.push(`Part ${part} is not well-formed XML`);
      continue;
    }
    walk(doc.documentElement!, part, violations);
  }
  return violations;
}

function walk(el: XmlEl, part: string, violations: string[]): void {
  const local = el.localName || el.nodeName;
  const allowed = SCHEMA_ATTRS[local];
  if (allowed) {
    for (let i = 0; i < el.attributes.length; i++) {
      const attr = el.attributes[i];
      // Namespace declarations and extension-schema attributes (e.g.
      // x14ac:dyDescent) are fine; only unprefixed attributes are checked.
      if (attr.prefix || attr.name === "xmlns") continue;
      const name = attr.localName || attr.name;
      if (!allowed.has(name)) {
        violations.push(`Part ${part}: <${local}> has attribute "${name}" that is not in the OOXML schema`);
      }
    }
  }
  for (const child of childElements(el)) walk(child, part, violations);
}

/**
 * Structural validation for the parts the optimizer rewrites.
 *
 * Excel's loader is stricter than the OOXML schema: it also rejects
 * out-of-order worksheet children, `<sheetView>` children that violate the
 * pane→selection order, style-table `count` attributes that don't match the
 * actual child count, and style references that point past the end of a
 * style table. Lenient parsers (exceljs, openpyxl) silently accept these, so
 * the engine checks them itself before a file is offered for download.
 */
export async function checkPartStructure(zip: Zip, sheetInfos: SheetInfo[]): Promise<string[]> {
  const violations: string[] = [];
  for (const info of sheetInfos) {
    const xml = await readEntryText(zip, info.file);
    if (!xml) continue;
    let doc;
    try {
      doc = parseXml(xml);
    } catch {
      continue; // well-formedness is reported by checkPartAttributes
    }
    const root = doc.documentElement!;
    checkChildOrder(root, WORKSHEET_CHILD_ORDER, info.file, violations);
    const sheetViews = firstChildElement(root, "sheetViews");
    if (sheetViews) {
      for (const view of childElements(sheetViews, "sheetView")) {
        checkSheetViewOrder(view, info.file, violations);
      }
    }
    checkAutoFilterMerges(root, info.file, violations);
    checkAutoFilterTable(root, info.file, violations);
  }

  // Every <c t="s"> must reference an existing shared string. Excel flags an
  // out-of-range index with a repair prompt ("String from
  // /xl/sharedStrings.xml part").
  const sstXml = await readEntryText(zip, "xl/sharedStrings.xml");
  let sstCount = -1;
  if (sstXml) {
    try {
      sstCount = childElements(parseXml(sstXml).documentElement!, "si").length;
    } catch {
      // well-formedness is reported by checkPartAttributes
    }
  }
  if (sstCount >= 0) {
    for (const info of sheetInfos) {
      const xml = await readEntryText(zip, info.file);
      if (!xml) continue;
      let doc;
      try {
        doc = parseXml(xml);
      } catch {
        continue;
      }
      checkSharedStringIndexes(doc.documentElement!, sstCount, info.file, violations);
    }
  }

  const stylesXml = await readEntryText(zip, "xl/styles.xml");
  if (stylesXml) {
    try {
      checkStyles(parseXml(stylesXml).documentElement!, violations);
    } catch {
      // well-formedness is reported by checkPartAttributes
    }
  }
  return violations;
}

function checkChildOrder(el: XmlEl, order: string[], part: string, violations: string[]): void {
  const parent = el.localName || el.nodeName;
  let last = -1;
  for (const child of childElements(el)) {
    const name = child.localName || child.nodeName;
    const idx = order.indexOf(name);
    if (idx === -1) continue; // extension elements (extLst etc.) are ignored
    if (idx < last) {
      violations.push(`Part ${part}: <${name}> is out of order inside <${parent}>`);
    }
    last = idx;
  }
}

/** Canonical CT_SheetView child order: pane, selection*, pivotSelection*, extLst. */
const SHEET_VIEW_ORDER = ["pane", "selection", "pivotSelection", "extLst"];

function checkSheetViewOrder(view: XmlEl, part: string, violations: string[]): void {
  let last = -1;
  for (const child of childElements(view)) {
    const name = child.localName || child.nodeName;
    const idx = SHEET_VIEW_ORDER.indexOf(name);
    if (idx === -1) {
      violations.push(`Part ${part}: <${name}> is not a valid child of <sheetView>`);
      continue;
    }
    if (idx < last) {
      violations.push(`Part ${part}: <${name}> is out of order inside <sheetView>`);
    }
    last = idx;
  }
}

function checkSharedStringIndexes(el: XmlEl, sstCount: number, part: string, violations: string[]): void {
  const local = el.localName || el.nodeName;
  if (local === "c" && getAttr(el, "t") === "s") {
    const v = firstChildElement(el, "v");
    if (v) {
      const idx = parseInt(textContent(v).trim(), 10);
      if (!isNaN(idx) && idx >= sstCount) {
        violations.push(`Part ${part}: cell references shared string #${idx} but only ${sstCount} exist`);
      }
    }
  }
  for (const child of childElements(el)) {
    checkSharedStringIndexes(child, sstCount, part, violations);
  }
}

/**
 * A sheet carrying both an auto-filter AND an Excel table (tableParts) over
 * the same range is a known Excel corruption trigger — the table already
 * provides filtering, and Excel rejects the duplicate filter element.
 */
function checkAutoFilterTable(root: XmlEl, part: string, violations: string[]): void {
  if (!firstChildElement(root, "autoFilter")) return;
  if (!firstChildElement(root, "tableParts")) return;
  const af = getAttr(firstChildElement(root, "autoFilter")!, "ref") ?? "";
  const tableParts = firstChildElement(root, "tableParts")!;
  const refs = childElements(tableParts, "tablePart")
    .map((t) => getAttr(t, "r:id") ?? "")
    .join(",");
  violations.push(`Part ${part}: autoFilter ${af} coexists with tableParts (${refs})`);
}

/**
 * An auto-filter range that overlaps merged cells is a known Excel
 * corruption trigger ("we found a problem with some content").
 */
function checkAutoFilterMerges(root: XmlEl, part: string, violations: string[]): void {
  const autoFilter = firstChildElement(root, "autoFilter");
  if (!autoFilter) return;
  const ref = getAttr(autoFilter, "ref");
  if (!ref) return;
  const rect = rangeToRect(ref);
  if (!rect) return;
  const mergeCells = firstChildElement(root, "mergeCells");
  if (!mergeCells) return;
  for (const mc of childElements(mergeCells, "mergeCell")) {
    const mref = getAttr(mc, "ref");
    if (!mref) continue;
    const m = rangeToRect(mref);
    if (!m) continue;
    if (rect.row1 <= m.row2 && rect.row2 >= m.row1 && rect.col1 <= m.col2 && rect.col2 >= m.col1) {
      violations.push(`Part ${part}: autoFilter ${ref} overlaps merged range ${mref}`);
    }
  }
}

const STYLE_CONTAINERS: Record<string, string> = {
  numFmts: "numFmt",
  fonts: "font",
  fills: "fill",
  borders: "border",
  cellStyleXfs: "xf",
  cellXfs: "xf",
  dxfs: "dxf",
};

function checkStyles(root: XmlEl, violations: string[]): void {
  // Every style-table `count` must equal its actual child count; Excel flags
  // mismatches as "found a problem with some content".
  for (const [container, childName] of Object.entries(STYLE_CONTAINERS)) {
    const el = firstChildElement(root, container);
    if (!el) continue;
    const declared = parseInt(getAttr(el, "count") ?? "", 10);
    if (isNaN(declared)) continue;
    const actual = childElements(el, childName).length;
    if (declared !== actual) {
      violations.push(`xl/styles.xml: <${container} count="${declared}"> has ${actual} child element(s)`);
    }
  }

  // Style references must point at existing records.
  const childNameOf = (container: string) => STYLE_CONTAINERS[container] ?? container;
  const n = (container: string) => {
    const el = firstChildElement(root, container);
    return el ? childElements(el, childNameOf(container)).length : 0;
  };
  const fonts = n("fonts");
  const fills = n("fills");
  const borders = n("borders");
  const cellStyleXfs = n("cellStyleXfs");
  const cellXfsEl = firstChildElement(root, "cellXfs");
  if (cellXfsEl) {
    for (const xf of childElements(cellXfsEl, "xf")) {
      const fontId = parseInt(getAttr(xf, "fontId") ?? "0", 10);
      const fillId = parseInt(getAttr(xf, "fillId") ?? "0", 10);
      const borderId = parseInt(getAttr(xf, "borderId") ?? "0", 10);
      const xfId = getAttr(xf, "xfId");
      if (fontId >= fonts) violations.push(`xl/styles.xml: xf fontId="${fontId}" out of range (${fonts} fonts)`);
      if (fillId >= fills) violations.push(`xl/styles.xml: xf fillId="${fillId}" out of range (${fills} fills)`);
      if (borderId >= borders) violations.push(`xl/styles.xml: xf borderId="${borderId}" out of range (${borders} borders)`);
      if (xfId !== undefined && parseInt(xfId, 10) >= cellStyleXfs) {
        violations.push(`xl/styles.xml: xf xfId="${xfId}" out of range (${cellStyleXfs} cellStyleXfs)`);
      }
    }
  }
}

export function validateOutput(before: WorkbookSnapshot, after: WorkbookSnapshot): ValidationResult {
  const diffs: string[] = [];

  // Zip part list (skipped for legacy snapshots that don't carry one).
  if (before.partNames.length > 0 && after.partNames.length > 0) {
    const bSet = new Set(before.partNames);
    const aSet = new Set(after.partNames);
    for (const p of before.partNames) if (!aSet.has(p)) diffs.push(`Missing zip part: ${p}`);
    for (const p of after.partNames) if (!bSet.has(p)) diffs.push(`Unexpected zip part: ${p}`);
  }

  // Protected object counts.
  if (before.charts !== after.charts) diffs.push(`Charts changed: ${before.charts} → ${after.charts}`);
  if (before.pivotTables !== after.pivotTables) {
    diffs.push(`Pivot tables changed: ${before.pivotTables} → ${after.pivotTables}`);
  }
  if (before.images !== after.images) diffs.push(`Images changed: ${before.images} → ${after.images}`);
  if (before.hasMacros !== after.hasMacros) diffs.push("Macro (VBA) project changed");

  // Worksheets.
  if (before.sheets.length !== after.sheets.length) {
    diffs.push(`Worksheet count changed: ${before.sheets.length} → ${after.sheets.length}`);
  }
  const maxLen = Math.max(before.sheets.length, after.sheets.length);
  for (let i = 0; i < maxLen; i++) {
    const b = before.sheets[i];
    const a = after.sheets[i];
    if (!a) {
      diffs.push(`Worksheet #${i + 1} ("${b?.name}") is missing from the output`);
      continue;
    }
    if (!b) {
      diffs.push(`Unexpected worksheet #${i + 1} ("${a.name}") in the output`);
      continue;
    }
    if (a.name !== b.name) diffs.push(`Worksheet name changed: "${b.name}" → "${a.name}"`);
    if (a.state !== b.state) diffs.push(`Visibility of "${b.name}" changed (${b.state} → ${a.state})`);
    if (a.cellCount !== b.cellCount) diffs.push(`Cell count changed on "${b.name}"`);

    // Formulas. Illegal XML characters are compared in their escaped form
    // (Excel decodes `_xHHHH_` back to the original character on load).
    const bf = Object.keys(b.formulas);
    const af = Object.keys(a.formulas);
    if (bf.length !== af.length) diffs.push(`Formula count changed on "${b.name}" (${bf.length} → ${af.length})`);
    for (const ref of bf) {
      const av = a.formulas[ref];
      if (av === undefined) {
        diffs.push(`Formula lost at "${b.name}"!${ref}`);
      } else if (normFormula(av) !== normFormula(escapeIllegalXmlChars(b.formulas[ref]))) {
        diffs.push(`Formula changed at "${b.name}"!${ref}`);
      }
    }

    // Values. The ONLY permitted content change is the heading title-case
    // normalization (titles/subtitles/table headers) — recognized by the
    // after-value being exactly the deterministic title-case of the before.
    for (const [ref, val] of Object.entries(b.values)) {
      const av = a.values[ref];
      if (av === undefined) {
        diffs.push(`Value lost at "${b.name}"!${ref}`);
      } else if (
        !valuesEqual(escapeIllegalXmlChars(val), av) &&
        !isTitleCaseChange(escapeIllegalXmlChars(val), av) &&
        !isTypoCorrectionChange(escapeIllegalXmlChars(val), av)
      ) {
        diffs.push(`Value changed at "${b.name}"!${ref}`);
      }
    }

    // Merged ranges.
    const bm = JSON.stringify(b.merges);
    const am = JSON.stringify(a.merges);
    if (bm !== am) diffs.push(`Merged ranges changed on "${b.name}"`);
  }

  return { passed: diffs.length === 0, differences: diffs.slice(0, 25) };
}

/** Formula comparison: case-insensitive, whitespace-insensitive, no leading "=". */
function normFormula(f: string): string {
  return f.replace(/^=/, "").replace(/\s+/g, "").toUpperCase();
}

function valuesEqual(a: string, b: string): boolean {
  if (a === b) return true;
  const ka = a.slice(0, 2);
  const kb = b.slice(0, 2);
  if (ka !== kb) return false;
  if (ka === "n:") {
    const na = parseFloat(a.slice(2));
    const nb = parseFloat(b.slice(2));
    if (isNaN(na) || isNaN(nb)) return false;
    const tol = 1e-9 * Math.max(1, Math.abs(na), Math.abs(nb));
    return Math.abs(na - nb) <= tol;
  }
  return false;
}

/** True when `after` is exactly the deterministic title-case of `before`. */
function isTitleCaseChange(before: string, after: string): boolean {
  if (before.slice(0, 2) !== "s:" || after.slice(0, 2) !== "s:") return false;
  const b = before.slice(2);
  const a = after.slice(2);
  return b !== a && toTitleCase(b) === a;
}

/** True when `after` equals correctTypos(before) then title-cased. */
function isTypoCorrectionChange(before: string, after: string): boolean {
  if (before.slice(0, 2) !== "s:" || after.slice(0, 2) !== "s:") return false;
  const b = before.slice(2);
  const a = after.slice(2);
  if (b === a) return false;
  const corrected = correctTypos(b);
  const result = toTitleCase(corrected);
  return result === a;
}

/** Counts formulas/values/merges across a snapshot (for the report). */
export function snapshotStats(snapshot: WorkbookSnapshot): {
  formulas: number;
  values: number;
  merges: number;
  cells: number;
} {
  let formulas = 0;
  let values = 0;
  let merges = 0;
  let cells = 0;
  for (const s of snapshot.sheets) {
    formulas += Object.keys(s.formulas).length;
    values += Object.keys(s.values).length;
    merges += s.merges.length;
    cells += s.cellCount;
  }
  return { formulas, values, merges, cells };
}

/**
 * Strict XML 1.0 well-formedness check using the browser's native DOMParser
 * (when available). The engine's own DOM parser is lenient — it accepts
 * illegal XML characters that Excel's parser rejects — so every XML part of
 * the generated package is re-parsed with the native parser as a final gate.
 * Returns an empty array when every part is well-formed (or in runtimes
 * without DOMParser, where the check is skipped).
 */
export async function checkNativeWellFormed(zip: Zip): Promise<string[]> {
  if (typeof DOMParser === "undefined") return [];
  const violations: string[] = [];
  for (const name of listXmlParts(zip)) {
    const xml = await readEntryText(zip, name);
    if (xml === null) continue;
    let doc: Document;
    try {
      doc = new DOMParser().parseFromString(xml, "application/xml");
    } catch {
      violations.push(`Part ${name} failed to parse`);
      continue;
    }
    const errors = doc.getElementsByTagName("parsererror");
    if (errors.length > 0) {
      const detail = errors[0].textContent?.trim().split(/\n/)[0] ?? "unknown error";
      violations.push(`Part ${name}: not well-formed XML (${detail})`);
    }
  }
  return violations;
}

function listXmlParts(zip: Zip): string[] {
  const out: string[] = [];
  for (const name of Object.keys(zip.files)) {
    const entry = zip.files[name];
    if (entry.dir) continue;
    if (/\.(xml|rels|vml)$/i.test(name)) out.push(name);
  }
  return out;
}

export type { SheetSnapshot, WorkbookSnapshot };
