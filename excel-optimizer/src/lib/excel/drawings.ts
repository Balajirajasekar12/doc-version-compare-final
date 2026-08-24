/**
 * Anchored-drawing repair.
 *
 * Workbooks with many embedded screenshots/charts can have anchors that
 * overlap (generators commonly tile images into a space too small for them).
 * Excel renders them stacked on top of each other, so screenshots cover one
 * another. This pass detects overlapping `<xdr:twoCellAnchor>` /
 * `<xdr:oneCellAnchor>` rects (converted to EMU using the sheet's column
 * widths / row heights) and pushes the lower ones down until nothing
 * overlaps — each drawing keeps its exact size and horizontal position.
 *
 * Only drawings that actually overlap are moved, and the part is only
 * rewritten when something moved; clean drawing parts pass through
 * byte-for-byte.
 */
import { Zip, readEntryText } from "./zip";
import {
  XmlDoc,
  XmlEl,
  childElements,
  firstChildElement,
  getAttr,
  parseXml,
  textContent,
} from "./xml";
import { ParsedSheet } from "./worksheet";

/** EMU per pixel (914400 EMU per inch / 96 px per inch). */
const EMU_PER_PX = 9525;
/** Pixels added between drawings that were pushed apart. */
const SPACING_PX = 25;
const DEFAULT_COL_WIDTH = 8.43; // characters
const DEFAULT_ROW_HEIGHT = 15; // points

interface AnchorRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** New top position after spreading (equals y1 when not moved). */
  newY1: number;
  w: number;
  h: number;
}

/**
 * Resolves a worksheet's relationship file to a map of rId →
 * { resolved zip target, type }. Shared by the drawing repair and the table
 * column-name sync.
 */
export async function resolveSheetRels(
  zip: Zip,
  sheetFile: string,
): Promise<Map<string, { target: string; type: string }>> {
  const out = new Map<string, { target: string; type: string }>();
  const dir = sheetFile.substring(0, sheetFile.lastIndexOf("/") + 1);
  const base = sheetFile.split("/").pop() ?? sheetFile;
  const relsPath = `${dir}_rels/${base}.rels`;
  const xml = await readEntryText(zip, relsPath);
  if (!xml) return out;
  try {
    const doc = parseXml(xml);
    for (const rel of childElements(doc.documentElement!, "Relationship")) {
      const id = getAttr(rel, "Id");
      const target = getAttr(rel, "Target");
      const type = getAttr(rel, "Type") ?? "";
      if (id && target) out.set(id, { target: normalizeRelTarget(dir, target), type });
    }
  } catch {
    // unreadable rels — treated as no relationships
  }
  return out;
}

function normalizeRelTarget(dir: string, target: string): string {
  if (target.startsWith("/")) return target.replace(/^\//, "");
  const parts = (dir + target).split("/");
  const stack: string[] = [];
  for (const p of parts) {
    if (p === "." || p === "") continue;
    if (p === "..") stack.pop();
    else stack.push(p);
  }
  return stack.join("/");
}

/**
 * Repairs overlapping drawings on `sheet`. Returns the number of anchors that
 * were moved (0 means the drawing part was left untouched).
 */
export async function fixDrawingOverlaps(
  zip: Zip,
  sheet: ParsedSheet,
  sheetFile: string,
): Promise<number> {
  if (!sheet.hasDrawing) return 0;
  const rels = await resolveSheetRels(zip, sheetFile);
  let drawingTarget: string | null = null;
  for (const rel of rels.values()) {
    if (rel.type.includes("/drawing")) {
      drawingTarget = rel.target;
      break;
    }
  }
  if (!drawingTarget) return 0;

  const originalXml = await readEntryText(zip, drawingTarget);
  if (!originalXml) return 0;

  // Parse with xmldom for position calculation ONLY (read-only).
  let doc: XmlDoc;
  try {
    doc = parseXml(originalXml);
  } catch {
    return 0;
  }
  const root = doc.documentElement!;
  const anchors = childElements(root).filter((el) => {
    const n = el.localName || el.nodeName;
    return n === "twoCellAnchor" || n === "oneCellAnchor";
  });
  if (anchors.length === 0) return 0;

  const geom = new DrawingGeometry(sheet);
  const rects: AnchorRect[] = [];
  for (const el of anchors) {
    const r = geom.parseAnchor(el);
    if (r) rects.push(r);
  }
  if (rects.length === 0) return 0;

  // Calculate new positions.
  const movedByContent = pushBelowContent(sheet, rects, geom);
  const movedByImages = spreadRects(rects);
  const totalMoved = movedByContent + movedByImages;
  if (totalMoved === 0) return 0;

  // Apply repositioning using SCOPED block replacement.
  // Instead of a whole-XML regex that can match across anchor boundaries,
  // we match each <from>...</from> and <to>...</to> block individually,
  // then replace <row>/<rowOff> values ONLY within that block.
  // This prevents the cross-boundary corruption that broke drawing30.xml/drawing33.xml.
  const modifiedXml = updateAnchorRows(originalXml, rects, geom);

  if (modifiedXml !== originalXml) {
    zip.file(drawingTarget, modifiedXml);
  }

  return totalMoved;
}

/**
 * Updates <row>/<rowOff> values in <from> and <to> blocks using scoped
 * replacement. Each block is matched independently, preventing cross-anchor
 * boundary corruption.
 *
 * Previous approaches failed because:
 * 1. xmldom re-serialization corrupts namespace prefixes → images lost
 * 2. Whole-XML regex with [\s\S]*? wildcards matches across anchor
 *    boundaries → corrupts specific drawings (drawing30.xml, drawing33.xml)
 *
 * This approach matches each <from>...</from> block as a complete unit,
 * then replaces values ONLY within that block.
 */
function updateAnchorRows(
  xml: string,
  rects: AnchorRect[],
  geom: DrawingGeometry,
): string {
  let result = xml;

  // Phase 1: Update <from> blocks.
  // Match each <from>...</from> as a complete unit.
  let fromIdx = 0;
  result = result.replace(
    /<(?:\w+:)?from\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?from>/g,
    (fullMatch, _attrs: string, inner: string) => {
      if (fromIdx >= rects.length) return fullMatch;
      const r = rects[fromIdx];
      fromIdx++;
      if (r.newY1 === r.y1) return fullMatch; // not moved

      const { row, off } = geom.yToRow(r.newY1);
      const newOff = Math.max(0, Math.round(off));

      // Replace <row> within this <from> block only.
      let updated = inner.replace(
        /<(?:\w+:)?row>(\d+)<\/(?:\w+:)?row>/,
        `<row>${row}</row>`,
      );

      // Replace <rowOff> within this <from> block only.
      updated = updated.replace(
        /<(?:\w+:)?rowOff>(\d+)<\/(?:\w+:)?rowOff>/,
        `<rowOff>${newOff}</rowOff>`,
      );

      return fullMatch.replace(inner, updated);
    },
  );

  // Phase 2: Update <to> blocks (for twoCellAnchor).
  let toIdx = 0;
  result = result.replace(
    /<(?:\w+:)?to\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?to>/g,
    (fullMatch, _attrs: string, inner: string) => {
      if (toIdx >= rects.length) return fullMatch;
      const r = rects[toIdx];
      toIdx++;
      if (r.newY1 === r.y1) return fullMatch; // not moved

      const newY2 = r.newY1 + r.h;
      const { row, off } = geom.yToRow(newY2);
      const newOff = Math.max(0, Math.round(off));

      let updated = inner.replace(
        /<(?:\w+:)?row>(\d+)<\/(?:\w+:)?row>/,
        `<row>${row}</row>`,
      );

      updated = updated.replace(
        /<(?:\w+:)?rowOff>(\d+)<\/(?:\w+:)?rowOff>/,
        `<rowOff>${newOff}</rowOff>`,
      );

      return fullMatch.replace(inner, updated);
    },
  );

  return result;
}

/**
 * Pushes images below cell content to prevent overlap.
 *
 * Strategy: find the absolute last row with non-empty content, compute
 * its EMU bottom, and push every image whose top is above that boundary
 * below it. This is deliberately conservative — it may push images that
 * were intentionally placed within content, but it guarantees zero
 * content-image overlap.
 */
function pushBelowContent(
  sheet: ParsedSheet,
  rects: AnchorRect[],
  geom: DrawingGeometry,
): number {
  if (rects.length === 0) return 0;

  // Find the maximum row number that contains non-empty content.
  let maxContentRow = 0;
  for (const [row, cells] of sheet.cells) {
    for (const cell of cells.values()) {
      const t = cell.text ?? "";
      if (t.trim()) {
        if (row > maxContentRow) maxContentRow = row;
        break;
      }
    }
  }

  if (maxContentRow === 0) return 0;

  // Compute the EMU bottom of the last content row.
  // We use rowStart(maxContentRow + 1) which gives the top of the
  // row AFTER the last content — this is where images should start.
  const contentBoundaryY = geom.rowStart(maxContentRow + 1);

  let moved = 0;
  for (const r of rects) {
    // Only push images whose top is above the content boundary.
    if (r.y1 < contentBoundaryY) {
      const newY = contentBoundaryY + SPACING_PX * EMU_PER_PX;
      r.newY1 = newY;
      moved++;
    }
  }

  return moved;
}

/** Pushes overlapping rects down (keeping x and size); returns moved count. */
function spreadRects(rects: AnchorRect[]): number {
  const ordered = [...rects].sort((a, b) => a.newY1 - b.newY1 || a.x1 - b.x1);
  const placed: { x1: number; y1: number; x2: number; y2: number }[] = [];
  let moved = 0;
  for (const r of ordered) {
    let y = r.newY1;
    for (;;) {
      const blockers = placed.filter(
        (p) => p.x1 < r.x2 && p.x2 > r.x1 && p.y1 < y + r.h && p.y2 > y,
      );
      if (blockers.length === 0) break;
      y = Math.max(...blockers.map((p) => p.y2)) + SPACING_PX * EMU_PER_PX;
    }
    if (y !== r.y1) moved++;
    r.newY1 = y;
    placed.push({ x1: r.x1, y1: y, x2: r.x2, y2: y + r.h });
  }
  return moved;
}

/**
 * Converts anchor cells to EMU coordinates using the sheet's column widths
 * and row heights, and back. The mapping is consistent for every anchor on a
 * sheet, so relative sizes and positions are exact even though the absolute
 * conversion is an approximation of Excel's own grid math.
 */
class DrawingGeometry {
  private sheet: ParsedSheet;
  private defaultColWidth: number;
  private defaultRowHeight: number;

  constructor(sheet: ParsedSheet) {
    this.sheet = sheet;
    const fmt = firstChildElement(sheet.root, "sheetFormatPr");
    const dcw = fmt ? parseFloat(getAttr(fmt, "defaultColWidth") ?? "") : NaN;
    const drh = fmt ? parseFloat(getAttr(fmt, "defaultRowHeight") ?? "") : NaN;
    this.defaultColWidth = isNaN(dcw) ? DEFAULT_COL_WIDTH : dcw;
    this.defaultRowHeight = isNaN(drh) ? DEFAULT_ROW_HEIGHT : drh;
  }

  parseAnchor(el: XmlEl): AnchorRect | null {
    const from = firstChildElement(el, "from");
    if (!from) return null;
    const col1 = intOf(firstChildElement(from, "col"));
    const off1 = intOf(firstChildElement(from, "colOff"));
    const row1 = intOf(firstChildElement(from, "row"));
    const roff1 = intOf(firstChildElement(from, "rowOff"));
    if (col1 < 0 || row1 < 0) return null;
    const x1 = this.colStart(col1) + off1;
    const y1 = this.rowStart(row1) + roff1;

    const to = firstChildElement(el, "to");
    if (to) {
      const col2 = intOf(firstChildElement(to, "col"));
      const off2 = intOf(firstChildElement(to, "colOff"));
      const row2 = intOf(firstChildElement(to, "row"));
      const roff2 = intOf(firstChildElement(to, "rowOff"));
      if (col2 < 0 || row2 < 0) return null;
      const x2 = this.colStart(col2) + off2;
      const y2 = this.rowStart(row2) + roff2;
      if (x2 <= x1 || y2 <= y1) return null;
      return { x1, y1, x2, y2, newY1: y1, w: x2 - x1, h: y2 - y1 };
    }
    const ext = firstChildElement(el, "ext");
    if (ext) {
      const cx = parseInt(getAttr(ext, "cx") ?? "", 10);
      const cy = parseInt(getAttr(ext, "cy") ?? "", 10);
      if (isNaN(cx) || isNaN(cy) || cx <= 0 || cy <= 0) return null;
      return { x1, y1, x2: x1 + cx, y2: y1 + cy, newY1: y1, w: cx, h: cy };
    }
    return null;
  }

  /** EMU width of column `col` (0-based). */
  private colEmu(col: number): number {
    let width = this.defaultColWidth;
    for (const spec of this.sheet.cols) {
      if (col + 1 >= spec.min && col + 1 <= spec.max) {
        if (spec.width !== undefined) width = spec.width;
        break;
      }
    }
    return (width * 7 + 5) * EMU_PER_PX;
  }

  /** EMU height of row `row` (0-based). */
  public rowEmu(row: number): number {
    const rowEl = this.sheet.rowByNum.get(row);
    let pt = this.defaultRowHeight;
    if (rowEl) {
      const ht = parseFloat(getAttr(rowEl, "ht") ?? "");
      if (!isNaN(ht) && ht > 0) pt = ht;
    }
    return pt * 12700;
  }

  private colStart(col: number): number {
    let acc = 0;
    for (let c = 0; c < col; c++) acc += this.colEmu(c);
    return acc;
  }

  public rowStart(row: number): number {
    let acc = 0;
    for (let r = 0; r < row; r++) acc += this.rowEmu(r);
    return acc;
  }

  /** Converts an EMU y position back to (row, rowOff) with rowOff ≥ 0. */
  public yToRow(y: number): { row: number; off: number } {
    let acc = 0;
    for (let r = 0; r < 200_000; r++) {
      const h = this.rowEmu(r);
      if (y < acc + h) return { row: r, off: y - acc };
      acc += h;
    }
    return { row: 0, off: 0 };
  }
}

function intOf(el: XmlEl | undefined): number {
  if (!el) return -1;
  const n = parseInt(textContent(el).trim(), 10);
  return isNaN(n) ? -1 : n;
}
