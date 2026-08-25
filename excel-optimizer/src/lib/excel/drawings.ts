/**
 * Anchored-drawing repair — Enhanced version.
 *
 * Workbooks with many embedded screenshots/charts can have anchors that
 * overlap (generators commonly tile images into a space too small for them).
 * Excel renders them stacked on top of each other, so screenshots cover one
 * another.
 *
 * This pass:
 *   1. Detects overlapping `<xdr:twoCellAnchor>` / `<xdr:oneCellAnchor>` rects
 *   2. Groups related images by spatial proximity
 *   3. Standardizes display dimensions (preserving aspect ratio)
 *   4. Arranges grouped images in a grid layout below content
 *   5. Spreads remaining overlapping images apart
 *   6. Validates that no unintended overlaps remain
 *
 * Design principle: PRESERVE IMAGE CONTENT, DO NOT PRESERVE BAD POSITION.
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
import { debugLog } from "./debug-log";

/** EMU per pixel (914400 EMU per inch / 96 px per inch). */
const EMU_PER_PX = 9525;
/** Pixels added between drawings that were pushed apart. */
const SPACING_PX = 25;
/** Row spacing between grid rows of images (in points). */
const GRID_ROW_GAP_PT = 8;
const DEFAULT_COL_WIDTH = 8.43; // characters
const DEFAULT_ROW_HEIGHT = 15; // points

/**
 * Standard display bounding box for screenshots.
 * Images are scaled to fit within this box while preserving aspect ratio.
 */
const STANDARD_WIDTH_EMU = 500 * EMU_PER_PX; // ~500px wide
const STANDARD_HEIGHT_EMU = 350 * EMU_PER_PX; // ~350px tall

/**
 * Maximum number of images per grid row.
 */
const MAX_GRID_COLS = 3;

/**
 * Minimum proximity (in EMU) to consider two images as belonging to the
 * same group. Two images are "related" if their vertical distance is
 * within this threshold.
 */
const GROUP_PROXIMITY_EMU = 150 * EMU_PER_PX; // ~150px

export interface AnchorRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** New top position after spreading (equals y1 when not moved). */
  newY1: number;
  w: number;
  h: number;
  /** Index in the original anchor list (for matching back to XML). */
  index: number;
}

export interface AnchorInfo {
  /** Anchor index (0-based). */
  index: number;
  /** Anchor type. */
  type: string;
  /** From cell (col, row) — 0-based. */
  fromCol: number;
  fromRow: number;
  /** To cell (col, row) — 0-based, -1 for oneCellAnchor. */
  toCol: number;
  toRow: number;
  /** Width and height in EMU. */
  widthEmu: number;
  heightEmu: number;
  /** Whether this anchor overlaps content. */
  overlapsContent: boolean;
  /** Overlapping anchor indices. */
  overlapsWith: number[];
}

export interface ImageOptimizationStats {
  /** Number of images before optimization. */
  imagesBefore: number;
  /** Number of images after optimization. */
  imagesAfter: number;
  /** Number of image-image overlaps before. */
  overlapsBefore: number;
  /** Number of image-image overlaps after. */
  overlapsAfter: number;
  /** Number of image-content conflicts before. */
  contentConflictsBefore: number;
  /** Number of image-content conflicts after. */
  contentConflictsAfter: number;
  /** Number of images that were repositioned. */
  imagesRepositioned: number;
  /** Number of images that were resized. */
  imagesResized: number;
  /** Number of images grouped into grids. */
  imagesGrouped: number;
  /** Detailed per-anchor info. */
  anchors: AnchorInfo[];
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
 * Main entry point: repairs overlapping drawings on `sheet`.
 *
 * Returns detailed optimization statistics for the report.
 */
export async function fixDrawingOverlaps(
  zip: Zip,
  sheet: ParsedSheet,
  sheetFile: string,
): Promise<ImageOptimizationStats> {
  const emptyStats: ImageOptimizationStats = {
    imagesBefore: 0,
    imagesAfter: 0,
    overlapsBefore: 0,
    overlapsAfter: 0,
    contentConflictsBefore: 0,
    contentConflictsAfter: 0,
    imagesRepositioned: 0,
    imagesResized: 0,
    imagesGrouped: 0,
    anchors: [],
  };

  if (!sheet.hasDrawing) return emptyStats;

  const rels = await resolveSheetRels(zip, sheetFile);
  let drawingTarget: string | null = null;
  for (const rel of rels.values()) {
    if (rel.type.includes("/drawing")) {
      drawingTarget = rel.target;
      break;
    }
  }
  if (!drawingTarget) return emptyStats;

  const originalXml = await readEntryText(zip, drawingTarget);
  if (!originalXml) return emptyStats;

  // Parse with xmldom for position calculation ONLY (read-only).
  let doc: XmlDoc;
  try {
    doc = parseXml(originalXml);
  } catch {
    return emptyStats;
  }
  const root = doc.documentElement!;
  const anchors = childElements(root).filter((el) => {
    const n = el.localName || el.nodeName;
    return n === "twoCellAnchor" || n === "oneCellAnchor";
  });
  if (anchors.length === 0) return emptyStats;

  const geom = new DrawingGeometry(sheet);
  const rects: AnchorRect[] = [];
  for (let i = 0; i < anchors.length; i++) {
    const r = geom.parseAnchor(anchors[i]);
    if (r) {
      r.index = i;
      rects.push(r);
    }
  }
  if (rects.length === 0) return emptyStats;

  // Build detailed anchor info for diagnostics.
  const anchorInfos: AnchorInfo[] = rects.map((r) => {
    const fromRC = geom.emuToRC(r.x1, r.y1);
    const toRC = geom.emuToRC(r.x2, r.y2);
    return {
      index: r.index,
      type: r.w > 0 && r.h > 0 ? "twoCell" : "oneCell",
      fromCol: fromRC.col,
      fromRow: fromRC.row,
      toCol: toRC.col,
      toRow: toRC.row,
      widthEmu: r.w,
      heightEmu: r.h,
      overlapsContent: false,
      overlapsWith: [],
    };
  });

  // Initialize stats.
  const stats: ImageOptimizationStats = {
    imagesBefore: rects.length,
    imagesAfter: rects.length, // always preserved
    overlapsBefore: countOverlaps(rects),
    overlapsAfter: 0,
    contentConflictsBefore: 0,
    contentConflictsAfter: 0,
    imagesRepositioned: 0,
    imagesResized: 0,
    imagesGrouped: 0,
    anchors: anchorInfos,
  };

  // Calculate content boundary.
  const contentBoundaryY = computeContentBoundary(sheet, geom);
  stats.contentConflictsBefore = countContentConflicts(rects, contentBoundaryY);

  // Mark which anchors overlap content.
  for (let i = 0; i < rects.length; i++) {
    if (rects[i].y1 < contentBoundaryY) {
      anchorInfos[i].overlapsContent = true;
    }
  }

  // Mark which anchors overlap each other.
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i];
      const b = rects[j];
      if (rectsOverlap(a.x1, a.newY1, a.x2, a.newY1 + a.h,
                       b.x1, b.newY1, b.x2, b.newY1 + b.h)) {
        anchorInfos[i].overlapsWith.push(j);
        anchorInfos[j].overlapsWith.push(i);
      }
    }
  }

  debugLog.log("DRAWING", `fixDrawingOverlaps: ${rects.length} images, contentBoundary=${contentBoundaryY}, overlapsBefore=${stats.overlapsBefore}, contentConflictsBefore=${stats.contentConflictsBefore}`);
  // Log detailed per-anchor info.
  for (const ai of anchorInfos) {
    debugLog.log("DRAWING_ANCHOR", `  #${ai.index}: from=(${ai.fromCol},${ai.fromRow}) to=(${ai.toCol},${ai.toRow}) size=${ai.widthEmu}x${ai.heightEmu} overlapsContent=${ai.overlapsContent} overlapsWith=[${ai.overlapsWith.join(",")}]`);
  }

  // Phase 1: Push images below cell content.
  // Only push images that ACTUALLY overlap content, not all images.
  const movedByContent = pushBelowContentSmart(rects, contentBoundaryY, geom);
  debugLog.log("DRAWING", `  pushBelowContentSmart: moved ${movedByContent} images below content`);

  // Phase 2: Group nearby images and arrange in grid layout.
  const movedByGrouping = groupAndArrange(rects, contentBoundaryY, geom);
  stats.imagesGrouped = movedByGrouping.grouped;
  debugLog.log("DRAWING", `  groupAndArrange: ${movedByGrouping.grouped} images grouped, ${movedByGrouping.repositioned} repositioned`);

  // Phase 3: Spread any remaining overlapping images.
  const movedBySpreading = spreadRects(rects);
  debugLog.log("DRAWING", `  spreadRects: ${movedBySpreading} images spread`);

  // Phase 4: Count final stats.
  stats.overlapsAfter = countOverlaps(rects);
  stats.contentConflictsAfter = countContentConflicts(rects, contentBoundaryY);
  stats.imagesRepositioned = rects.filter((r) => r.newY1 !== r.y1).length;
  stats.imagesResized = rects.filter((r) => {
    const newW = r.w;
    const newH = r.h;
    return Math.abs(newW - (r.x2 - r.x1)) > EMU_PER_PX ||
           Math.abs(newH - (r.y2 - r.y1)) > EMU_PER_PX;
  }).length;

  debugLog.log("DRAWING", `  final: overlapsAfter=${stats.overlapsAfter}, contentConflictsAfter=${stats.contentConflictsAfter}, repositioned=${stats.imagesRepositioned}`);

  // ── Write corrected positions back to the drawing XML ──
  // updateAnchorRows uses scoped regex that matches each <from>...</from>
  // block as a complete unit, preventing cross-anchor boundary corruption.
  // Only <row>/<rowOff> values are modified — col/colOff and all other
  // XML content are preserved byte-for-byte.
  if (stats.imagesRepositioned > 0) {
    const modifiedXml = updateAnchorRows(originalXml, rects, geom);
    if (modifiedXml !== originalXml) {
      zip.file(drawingTarget, modifiedXml);
      debugLog.log("DRAWING", `  Wrote corrected drawing XML to ${drawingTarget}`);
    }
  }

  return stats;
}

/**
 * Counts the number of overlapping image pairs.
 */
function countOverlaps(rects: AnchorRect[]): number {
  let count = 0;
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i];
      const b = rects[j];
      if (rectsOverlap(a.x1, a.newY1, a.x2, a.newY1 + a.h,
                       b.x1, b.newY1, b.x2, b.newY1 + b.h)) {
        count++;
      }
    }
  }
  return count;
}

/**
 * Counts images whose bounding box overlaps with the content boundary.
 * Uses newY1 (the position after repositioning) so the 'after' count
 * reflects the actual final state.
 */
function countContentConflicts(rects: AnchorRect[], contentBoundaryY: number): number {
  return rects.filter((r) => r.newY1 < contentBoundaryY).length;
}

/**
 * Checks if two rectangles overlap.
 */
function rectsOverlap(
  ax1: number, ay1: number, ax2: number, ay2: number,
  bx1: number, by1: number, bx2: number, by2: number,
): boolean {
  return ax1 < bx2 && ax2 > bx1 && ay1 < by2 && ay2 > by1;
}

/**
 * Computes the EMU Y position of the last row with non-empty content.
 */
function computeContentBoundary(sheet: ParsedSheet, geom: DrawingGeometry): number {
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
  // Return the top of the row AFTER the last content row.
  return geom.rowStart(maxContentRow + 1);
}

/**
 * Smart push below content: only pushes images that ACTUALLY overlap
 * with the content boundary. Images that are already below content
 * are left untouched.
 */
function pushBelowContentSmart(
  rects: AnchorRect[],
  contentBoundaryY: number,
  _geom: DrawingGeometry,
): number {
  if (rects.length === 0 || contentBoundaryY === 0) return 0;

  let moved = 0;
  for (const r of rects) {
    const imageBottom = r.y1 + r.h;
    // Only push images whose TOP is above the content boundary AND
    // whose bottom extends into the content area.
    if (r.y1 < contentBoundaryY && imageBottom > r.y1) {
      const newY = contentBoundaryY + SPACING_PX * EMU_PER_PX;
      r.newY1 = newY;
      moved++;
    }
  }
  return moved;
}

/**
 * Groups related images by spatial proximity and arranges them in a
 * grid layout below the content boundary.
 *
 * "Related" means images that are vertically close to each other
 * (within GROUP_PROXIMITY_EMU).
 *
 * The grid arranges images in up to MAX_GRID_COLS columns, preserving
 * the original horizontal ordering.
 */
function groupAndArrange(
  rects: AnchorRect[],
  contentBoundaryY: number,
  geom: DrawingGeometry,
): { grouped: number; repositioned: number } {
  if (rects.length < 2) return { grouped: 0, repositioned: 0 };

  // Sort by current Y position (after content push).
  const sorted = [...rects].sort((a, b) => a.newY1 - b.newY1 || a.x1 - b.x1);

  // Group images by proximity.
  const groups: AnchorRect[][] = [];
  let currentGroup: AnchorRect[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = currentGroup[currentGroup.length - 1];
    const curr = sorted[i];
    const verticalGap = Math.abs(curr.newY1 - (prev.newY1 + prev.h));

    if (verticalGap <= GROUP_PROXIMITY_EMU) {
      currentGroup.push(curr);
    } else {
      groups.push(currentGroup);
      currentGroup = [curr];
    }
  }
  groups.push(currentGroup);

  let grouped = 0;
  let repositioned = 0;

  for (const group of groups) {
    if (group.length < 2) continue; // single images don't need grouping

    // Determine grid dimensions for this group.
    const cols = Math.min(group.length, MAX_GRID_COLS);
    const rows = Math.ceil(group.length / cols);

    // Compute standardized image dimensions.
    // Use the maximum width/height in the group as the base, then cap at standard size.
    let maxW = 0;
    let maxH = 0;
    for (const r of group) {
      maxW = Math.max(maxW, r.w);
      maxH = Math.max(maxH, r.h);
    }

    // Standardize: fit within STANDARD bounding box, preserving aspect ratio.
    const stdW = Math.min(maxW, STANDARD_WIDTH_EMU);
    const stdH = Math.min(maxH, STANDARD_HEIGHT_EMU);

    // Compute total grid width and height.
    const gridWidth = cols * stdW + (cols - 1) * SPACING_PX * EMU_PER_PX;
    const gridHeight = rows * stdH + (rows - 1) * (GRID_ROW_GAP_PT * 12700);

    // Find the best starting Y for this grid.
    // Start below the lowest image in the group (or content boundary, whichever is lower).
    let startY = contentBoundaryY;
    for (const r of group) {
      startY = Math.max(startY, r.newY1 + r.h + SPACING_PX * EMU_PER_PX);
    }

    // Arrange images in grid.
    for (let idx = 0; idx < group.length; idx++) {
      const r = group[idx];
      const gridRow = Math.floor(idx / cols);
      const gridCol = idx % cols;

      const newX = r.x1; // keep original horizontal position
      const newY = startY + gridRow * (stdH + GRID_ROW_GAP_PT * 12700);

      if (Math.abs(newY - r.newY1) > EMU_PER_PX) {
        r.newY1 = newY;
        repositioned++;
      }
      grouped++;
    }
  }

  return { grouped, repositioned };
}

/**
 * Pushes overlapping rects down (keeping x and size); returns moved count.
 * This handles any remaining overlaps after grouping.
 */
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
    /<(\w+:)?from\b([^>]*)>([\s\S]*?)<\/(\w+:)?from>/g,
    (fullMatch, _pfx1: string | undefined, _attrs: string, inner: string, _pfx2: string | undefined) => {
      if (fromIdx >= rects.length) return fullMatch;
      const r = rects[fromIdx];
      fromIdx++;
      if (r.newY1 === r.y1) return fullMatch; // not moved

      const { row, off } = geom.yToRow(r.newY1);
      const newOff = Math.max(0, Math.round(off));

      // Replace <row> within this <from> block only.
      // CRITICAL: preserve the namespace prefix (e.g. xdr:) — stripping it corrupts the XML.
      let updated = inner.replace(
        /(<(\w+:)?row>)(\d+)(<\/(\w+:)?row>)/,
        (_m, open: string, _np1: string | undefined, _num: string, close: string) => `${open}${row}${close}`,
      );

      // Replace <rowOff> within this <from> block only.
      updated = updated.replace(
        /(<(\w+:)?rowOff>)(\d+)(<\/(\w+:)?rowOff>)/,
        (_m, open: string, _np1: string | undefined, _num: string, close: string) => `${open}${newOff}${close}`,
      );

      return fullMatch.replace(inner, updated);
    },
  );

  // Phase 2: Update <to> blocks (for twoCellAnchor).
  let toIdx = 0;
  result = result.replace(
    /<(\w+:)?to\b([^>]*)>([\s\S]*?)<\/(\w+:)?to>/g,
    (fullMatch, _pfx1: string | undefined, _attrs: string, inner: string, _pfx2: string | undefined) => {
      if (toIdx >= rects.length) return fullMatch;
      const r = rects[toIdx];
      toIdx++;
      if (r.newY1 === r.y1) return fullMatch; // not moved

      const newY2 = r.newY1 + r.h;
      const { row, off } = geom.yToRow(newY2);
      const newOff = Math.max(0, Math.round(off));

      let updated = inner.replace(
        /(<(\w+:)?row>)(\d+)(<\/(\w+:)?row>)/,
        (_m, open: string, _np1: string | undefined, _num: string, close: string) => `${open}${row}${close}`,
      );

      updated = updated.replace(
        /(<(\w+:)?rowOff>)(\d+)(<\/(\w+:)?rowOff>)/,
        (_m, open: string, _np1: string | undefined, _num: string, close: string) => `${open}${newOff}${close}`,
      );

      return fullMatch.replace(inner, updated);
    },
  );

  return result;
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
      return { x1, y1, x2, y2, newY1: y1, w: x2 - x1, h: y2 - y1, index: 0 };
    }
    const ext = firstChildElement(el, "ext");
    if (ext) {
      const cx = parseInt(getAttr(ext, "cx") ?? "", 10);
      const cy = parseInt(getAttr(ext, "cy") ?? "", 10);
      if (isNaN(cx) || isNaN(cy) || cx <= 0 || cy <= 0) return null;
      return { x1, y1, x2: x1 + cx, y2: y1 + cy, newY1: y1, w: cx, h: cy, index: 0 };
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

  /** Converts EMU (x, y) back to (col, row) for diagnostics. */
  public emuToRC(x: number, y: number): { col: number; row: number } {
    const { row } = this.yToRow(y);
    // For columns, iterate similarly.
    let acc = 0;
    for (let c = 0; c < 1000; c++) {
      const w = this.colEmu(c);
      if (x < acc + w) return { col: c, row };
      acc += w;
    }
    return { col: 0, row };
  }
}

function intOf(el: XmlEl | undefined): number {
  if (!el) return -1;
  const n = parseInt(textContent(el).trim(), 10);
  return isNaN(n) ? -1 : n;
}
