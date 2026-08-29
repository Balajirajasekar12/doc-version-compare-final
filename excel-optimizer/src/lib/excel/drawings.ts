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
import { ParsedSheet, parseSheet } from "./worksheet";
import { debugLog } from "./debug-log";

/**
 * Extracts the r:embed relationship ID from an anchor element.
 * This uniquely identifies the image associated with the anchor.
 *
 * The r:embed appears as an ATTRIBUTE on <a:blip> elements:
 *   <a:blip r:embed="rId1"/>
 *
 * We scan ALL descendant elements' attributes because getElementsByTagName("blip")
 * does not match namespace-prefixed <a:blip> in @xmldom/xmldom.
 */
function getAnchorEmbedId(anchor: XmlEl): string {
  const allElements = anchor.getElementsByTagName("*");
  for (let i = 0; i < allElements.length; i++) {
    const el = allElements[i] as XmlEl;
    for (let j = 0; j < el.attributes.length; j++) {
      const attr = el.attributes[j];
      if (attr.localName === "embed") return attr.value;
    }
  }
  return "";
}

/**
 * Discovers LOGICAL drawings in the drawing XML, correctly handling
 * mc:AlternateContent → mc:Choice / mc:Fallback.
 *
 * In OOXML, mc:AlternateContent provides version-compatible markup:
 *   - mc:Choice = preferred/newer markup (used when supported)
 *   - mc:Fallback = fallback/older markup (used when Choice unsupported)
 *
 * Both represent the SAME logical drawing with the SAME r:embed.
 * They must NOT be counted as two independent images.
 *
 * Returns one entry per unique r:embed (logical drawing), with:
 *   - all XML anchor elements for that drawing (Choice + Fallback + direct)
 *   - the preferred anchor (Choice > direct > Fallback)
 *   - the r:embed identity for structural matching
 */
function findLogicalDrawings(root: XmlEl): Array<{
  embedId: string;
  anchors: XmlEl[];
  preferred: XmlEl;
  index: number;
}> {
  // Step 1: Recursively find ALL anchor elements at any depth
  interface FoundAnchor {
    anchor: XmlEl;
    branch: "choice" | "fallback" | "direct";
  }

  function findAll(node: XmlEl): FoundAnchor[] {
    const result: FoundAnchor[] = [];
    for (let i = 0; i < node.childNodes.length; i++) {
      const child = node.childNodes[i];
      if (child.nodeType !== 1) continue;
      const el = child as XmlEl;
      const name = el.localName || el.nodeName;
      if (name === "twoCellAnchor" || name === "oneCellAnchor") {
        // Determine which mc: branch this anchor is in
        let branch: FoundAnchor["branch"] = "direct";
        let parent: XmlEl | null = el.parentNode as XmlEl | null;
        while (parent) {
          const pName = parent.localName || parent.nodeName;
          if (pName === "Choice") {
            branch = "choice";
            break;
          }
          if (pName === "Fallback") {
            branch = "fallback";
            break;
          }
          parent = parent.parentNode as XmlEl | null;
        }
        result.push({ anchor: el, branch });
      }
      result.push(...findAll(el));
    }
    return result;
  }

  const allFound = findAll(root);

  // Step 2: Group by r:embed — each unique embed = one logical drawing
  const byEmbed = new Map<string, FoundAnchor[]>();
  for (const found of allFound) {
    const embedId = getAnchorEmbedId(found.anchor);
    if (!embedId) continue;
    if (!byEmbed.has(embedId)) byEmbed.set(embedId, []);
    byEmbed.get(embedId)!.push(found);
  }

  // Step 3: For each logical drawing, select the preferred anchor
  const drawings: Array<{
    embedId: string;
    anchors: XmlEl[];
    preferred: XmlEl;
    index: number;
  }> = [];
  let idx = 0;
  for (const [embedId, entries] of byEmbed) {
    // Preference: Choice > direct > Fallback
    const preferred =
      entries.find((e) => e.branch === "choice")?.anchor ??
      entries.find((e) => e.branch === "direct")?.anchor ??
      entries.find((e) => e.branch === "fallback")?.anchor!;
    drawings.push({
      embedId,
      anchors: entries.map((e) => e.anchor),
      preferred,
      index: idx++,
    });
  }

  return drawings;
}


/** EMU per pixel (914400 EMU per inch / 96 px per inch). */
const EMU_PER_PX = 9525;  /** Pixels added between drawings that were pushed apart. */
const SPACING_PX = 1;
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
  /** Cell reference mapping due to row insertion (old ref -> new ref). */
  cellMapping?: Map<string, string>;
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
 * Inserts empty rows in the worksheet XML to push content down.
 * This creates space for images between content blocks.
 *
 * For each row element with row number >= insertAtRow, the row number
 * is incremented by rowsToInsert. Cell references are also updated.
 */
function insertRowsInWorksheet(
  worksheetXml: string,
  insertAtRow: number,
  rowsToInsert: number,
): { xml: string; cellMapping: Map<string, string> } {
  if (rowsToInsert <= 0) return { xml: worksheetXml, cellMapping: new Map() };

  const cellMapping = new Map<string, string>(); // old ref -> new ref
  let result = worksheetXml;

  // Helper: shift all cell references in a string by rowsToInsert if row >= insertAtRow.
  // Matches: A1, $A$1, $A1, A$1, A1:B5, $A$1:$B$5, etc.
  function shiftRefs(s: string): string {
    return s.replace(/(\$?)([A-Za-z]{1,3})(\$?)(\d+)/g, (match, d1, col, d2, rowNumStr) => {
      const rowNum = parseInt(rowNumStr);
      if (rowNum >= insertAtRow) {
        return `${d1}${col}${d2}${rowNum + rowsToInsert}`;
      }
      return match;
    });
  }

  // 1. Update row numbers: <row r="N"> where N >= insertAtRow -> N + rowsToInsert
  const rowRegex = /<row\s[^>]*\br="(\d+)"/g;
  const rowMatches: Array<{ start: number; end: number; rowNum: number }> = [];
  let m;
  while ((m = rowRegex.exec(result)) !== null) {
    const rowNum = parseInt(m[1]);
    if (rowNum >= insertAtRow) {
      rowMatches.push({ start: m.index, end: m.index + m[0].length, rowNum });
    }
  }
  for (let i = rowMatches.length - 1; i >= 0; i--) {
    const match = rowMatches[i];
    const newRowNum = match.rowNum + rowsToInsert;
    const oldTag = `r="${match.rowNum}"`;
    const newTag = `r="${newRowNum}"`;
    const originalSegment = result.substring(match.start, match.end);
    result = result.substring(0, match.start) +
      originalSegment.replace(oldTag, newTag) +
      result.substring(match.end);
  }

  // 2. Update cell references: <c r="A123"> where row >= insertAtRow
  const cellRegex = /<c\s[^>]*\br="([A-Z]+)(\d+)"/g;
  const cellMatches: Array<{ start: number; end: number; col: string; rowNum: number }> = [];
  while ((m = cellRegex.exec(result)) !== null) {
    const rowNum = parseInt(m[2]);
    if (rowNum >= insertAtRow) {
      cellMatches.push({ start: m.index, end: m.index + m[0].length, col: m[1], rowNum });
    }
  }
  for (let i = cellMatches.length - 1; i >= 0; i--) {
    const match = cellMatches[i];
    const newRowNum = match.rowNum + rowsToInsert;
    const oldRef = `${match.col}${match.rowNum}`;
    const newRef = `${match.col}${newRowNum}`;
    cellMapping.set(oldRef, newRef);
    const originalSegment = result.substring(match.start, match.end);
    result = result.substring(0, match.start) +
      originalSegment.replace(oldRef, newRef) +
      result.substring(match.end);
  }

  // 3. Update formula text inside <f> elements.
  // Formulas contain cell references like SUM(A1:A99) that must be shifted.
  result = result.replace(/(<f[^>]*>)(.*?)(<\/f>)/g, (_match, open, formulaText, close) => {
    return open + shiftRefs(formulaText) + close;
  });

  // 4. Update merge cell ranges: <mergeCell ref="A1:B5"/>
  result = result.replace(/(<mergeCell[^>]*ref=")(.*?)(")/g, (_match, prefix, ref, suffix) => {
    return prefix + shiftRefs(ref) + suffix;
  });

  // 5. Update data validation formulas: <dataValidation ...sqref="...">
  //    and <formula1>, <formula2> inside dataValidation.
  result = result.replace(/(<dataValidation[^>]*sqref=")(.*?)(")/g, (_match, prefix, sqref, suffix) => {
    return prefix + shiftRefs(sqref) + suffix;
  });
  result = result.replace(/(<formula[12]>)(.*?)(<\/formula[12]>)/g, (_match, open, formulaText, close) => {
    return open + shiftRefs(formulaText) + close;
  });

  // 6. Update conditional formatting sqref: <conditionalFormatting sqref="A1:B5">
  result = result.replace(/(<conditionalFormatting[^>]*sqref=")(.*?)(")/g, (_match, prefix, sqref, suffix) => {
    return prefix + shiftRefs(sqref) + suffix;
  });

  // 7. Update autoFilter ref: <autoFilter ref="A1:B100"/>
  result = result.replace(/(<autoFilter[^>]*ref=")(.*?)(")/g, (_match, prefix, ref, suffix) => {
    return prefix + shiftRefs(ref) + suffix;
  });

  debugLog.log("DRAWING", `insertRowsInWorksheet: inserted ${rowsToInsert} rows at row ${insertAtRow} (updated cells, formulas, merges, validations)`);
  return { xml: result, cellMapping };
}

/**
 * Main entry point: repairs overlapping drawings on `sheet`.
 *
 * Returns detailed optimization statistics for the report.
 */
/**
 * Processes VML drawings to move images below content.
 * VML drawings use a different format than regular drawing XML:
 *   <x:Anchor>fromCol, fromColOff, fromRow, fromRowOff, toCol, toColOff, toRow, toRowOff</x:Anchor>
 *   style='...margin-left:LEFTpt;margin-top:TOPpt...'
 *
 * VML shapes reference images via o:relid="rIdN".
 */
async function processVmlDrawings(
  zip: Zip,
  sheetFile: string,
  sheet: ParsedSheet,
  contentBoundaryRow: number,
): Promise<number> {
  debugLog.log("DRAWING", `  processVmlDrawings: contentBoundaryRow=${contentBoundaryRow}`);
  // Find VML drawing from sheet rels.
  const rels = await resolveSheetRels(zip, sheetFile);
  let vmlTarget: string | null = null;
  for (const rel of rels.values()) {
    if (rel.type.includes("vmlDrawing")) {
      vmlTarget = rel.target;
      break;
    }
  }
  if (!vmlTarget) {
    debugLog.log("DRAWING", `  processVmlDrawings: no VML drawing rel found`);
    return 0;
  }
  debugLog.log("DRAWING", `  processVmlDrawings: vmlTarget=${vmlTarget}`);

  const vmlXml = await readEntryText(zip, vmlTarget);
  if (!vmlXml || typeof vmlXml !== "string") {
    debugLog.log("DRAWING", `  processVmlDrawings: VML XML is empty or not a string`);
    return 0;
  }
  debugLog.log("DRAWING", `  processVmlDrawings: VML XML length=${vmlXml.length}, hasImagedata=${vmlXml.includes('imagedata')}`);

  // Check if there are any shapes with imagedata.
  if (!vmlXml.includes("imagedata")) return 0;

  const geom = new DrawingGeometry(sheet);
  let moved = 0;

  // Find content boundary row (0-based for geometry).
  // contentBoundaryRow is 1-based XML row number.
  const boundaryY = geom.rowStart(contentBoundaryRow - 1);
  let nextAvailableY = boundaryY + SPACING_PX * EMU_PER_PX;

  // Process each <v:shape> with <v:imagedata>.
  // Use regex to find and update each shape individually.
  const shapeRegex = /(<v:shape[^>]*>)([\s\S]*?)(<\/v:shape>)/g;
  let result = vmlXml;
  let m;

  // Process shapes from bottom to top to avoid index invalidation.
  const shapes: Array<{ start: number; end: number; block: string }> = [];
  while ((m = shapeRegex.exec(vmlXml)) !== null) {
    const fullBlock = m[0];
    if (fullBlock.includes("imagedata")) {
      shapes.push({
        start: m.index,
        end: m.index + fullBlock.length,
        block: fullBlock,
      });
    }
  }

  // Sort bottom to top.
  shapes.sort((a, b) => b.start - a.start);

  for (const shape of shapes) {
    const block = shape.block;

    // Parse the <x:Anchor> values.
    const anchorMatch = block.match(/<x:Anchor>\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+)\s*<\/x:Anchor>/);
    if (!anchorMatch) continue;

    const fromCol = parseInt(anchorMatch[1]);
    const fromColOff = parseInt(anchorMatch[2]);
    const fromRow = parseInt(anchorMatch[3]);
    const fromRowOff = parseInt(anchorMatch[4]);
    const toCol = parseInt(anchorMatch[5]);
    const toColOff = parseInt(anchorMatch[6]);
    const toRow = parseInt(anchorMatch[7]);
    const toRowOff = parseInt(anchorMatch[8]);

    // Check if this shape's BOUNDING BOX overlaps content.
    // An image anchored below content but with large height can still
    // extend upward into the content area. We must check the full box.
    const fromY = geom.rowStart(fromRow - 1) + fromRowOff;
    const toY = geom.rowStart(toRow - 1) + toRowOff;
    const imageTop = Math.min(fromY, toY);
    const imageBottom = Math.max(fromY, toY);
    const imageHeight = imageBottom - imageTop;
    // Image overlaps content if its top is above the content boundary
    // (the bottom of the last content row).
    if (imageTop >= boundaryY) continue; // image starts below content

    // Calculate new position: place below content.

    // Place at next available Y.
    const newY1 = Math.max(fromY, nextAvailableY);
    const newY2 = newY1 + imageHeight;

    // Convert back to row/rowOff (1-based).
    const newPos1 = geom.yToRow(newY1);
    const newPos2 = geom.yToRow(newY2);

    // Column A: col=0, colOff=0.
    const newFromCol = 0;
    const newFromColOff = 0;
    const newToCol = 0;
    const newToColOff = 0; // approximate: toCol depends on width

    // Update the <x:Anchor> block using regex (whitespace may vary).
    const newAnchorStr = `${newFromCol}, ${newFromColOff}, ${newPos1.row}, ${Math.round(newPos1.off)}, ${newToCol}, ${newToColOff}, ${newPos2.row}, ${Math.round(newPos2.off)}`;
    let updatedBlock = block.replace(
      /<x:Anchor>[\s\S]*?<\/x:Anchor>/,
      `<x:Anchor>${newAnchorStr}</x:Anchor>`,
    );

    // Update CSS margin-top (in points).
    const newMarginTopPt = Math.round(newY1 / 12700); // EMU to points
    updatedBlock = updatedBlock.replace(
      /margin-top:[\d.]+pt/,
      `margin-top:${newMarginTopPt}pt`,
    );

    // Update CSS margin-left (column A = 0pt).
    updatedBlock = updatedBlock.replace(
      /margin-left:[\d.]+pt/,
      `margin-left:0pt`,
    );

    // Replace in result.
    result = result.substring(0, shape.start) + updatedBlock + result.substring(shape.end);

    nextAvailableY = newY2 + SPACING_PX * EMU_PER_PX;
    moved++;
  }

  if (moved > 0) {
    zip.file(vmlTarget, result);
    debugLog.log("DRAWING", `  processVmlDrawings: moved ${moved} VML shapes below content in ${vmlTarget}`);
  }

  return moved;
}

/**
 * A content block: a group of consecutive rows with non-empty cells.
 * Images overlapping this block should be placed just below it.
 */
interface ContentBlock {
  startRow: number; // 1-based
  endRow: number;   // 1-based
  startY: number;   // EMU — top of startRow
  endY: number;     // EMU — bottom of endRow
}

/**
 * Finds all content blocks in a worksheet using adaptive gap detection.
 * 
 * Strategy:
 *   1. Collect all rows with content
 *   2. Compute the median content density (content rows per unit)
 *   3. Use adaptive gap: max(3, medianGap * 2) where medianGap is the
 *      median distance between consecutive content rows
 *   4. For documents with many scattered rows (low density), use a
 *      tighter threshold; for sparse documents, use a wider one.
 *   5. Always cap at a minimum of 3 to avoid splitting table rows.
 */
function findAllContentBlocks(sheet: ParsedSheet, geom: DrawingGeometry): ContentBlock[] {
  const contentRows = new Set<number>();
  for (const [row, cells] of sheet.cells) {
    for (const cell of cells.values()) {
      // Count rows with ANY non-empty cell: strings (text), numbers (value),
      // booleans, formulas — not just text-only cells.  Numeric cells like
      // "$4,684.73" have text=undefined but value="4684.73" and must be
      // detected as content so images aren't placed on top of them.
      if (cell.text?.trim() || (cell.value != null && String(cell.value).trim())) {
        contentRows.add(row);
        break;
      }
    }
  }
  // Fallback: scan rowByNum for rows that have <c> children but weren't
  // captured by the cell parser (e.g. table cells, special types, etc.).
  // These rows exist in the XML and likely contain visible content.
  for (const [rowNum, rowEl] of sheet.rowByNum) {
    if (!contentRows.has(rowNum)) {
      const cellEls = childElements(rowEl, "c");
      if (cellEls.length > 0) {
        contentRows.add(rowNum);
      }
    }
  }
  const sorted = Array.from(contentRows).sort((a, b) => a - b);
  if (sorted.length === 0) return [];
  if (sorted.length === 1) {
    return [{
      startRow: sorted[0],
      endRow: sorted[0],
      startY: geom.rowStart(sorted[0] - 1),
      endY: geom.rowStart(sorted[0]),
    }];
  }

  // Compute gaps between consecutive content rows.
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    gaps.push(sorted[i] - sorted[i - 1]);
  }

  // Adaptive gap threshold: use median gap × 1.5, clamped to [3, 20].
  // This handles:
  //   - Dense tables (median gap = 1): threshold = 3 (min)
  //   - Mixed content (median gap = 5): threshold = 7-8
  //   - Sparse documents (median gap = 15): threshold = 20 (max)
  const sortedGaps = [...gaps].sort((a, b) => a - b);
  const medianGap = sortedGaps[Math.floor(sortedGaps.length / 2)];
  const adaptiveGap = Math.max(3, Math.min(20, Math.ceil(medianGap * 1.5)));

  debugLog.log("DRAWING", `findAllContentBlocks: ${sorted.length} content rows, medianGap=${medianGap}, adaptiveGap=${adaptiveGap}`);

  const blocks: ContentBlock[] = [];
  let blockStart = sorted[0];
  let blockEnd = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - blockEnd > adaptiveGap) {
      blocks.push({
        startRow: blockStart,
        endRow: blockEnd,
        startY: geom.rowStart(blockStart - 1),
        endY: geom.rowStart(blockEnd),
      });
      blockStart = sorted[i];
    }
    blockEnd = sorted[i];
  }
  blocks.push({
    startRow: blockStart,
    endRow: blockEnd,
    startY: geom.rowStart(blockStart - 1),
    endY: geom.rowStart(blockEnd),
  });

  debugLog.log("DRAWING", `findAllContentBlocks: ${blocks.length} blocks detected`);
  return blocks;
}

/**
 * Assigns each image to the content block it overlaps, then places each
 * group of images immediately after its respective block.
 *
 * If images for a block extend into the next block, rows are inserted to
 * push subsequent content down, preserving document flow:
 *
 *   Block A → Images A → Block B → Images B → Block C → ...
 *
 * Returns the number of images that were repositioned.
 */
async function placeImagesByBlock(
  rects: AnchorRect[],
  blocks: ContentBlock[],
  geom: DrawingGeometry,
  sheet: ParsedSheet,
  zip: Zip,
  sheetFile: string,
  cellMapping: Map<string, string>,
): Promise<number> {
  if (rects.length === 0 || blocks.length === 0) return 0;

  // Step 1: Classify each image as overlapping a block, or already safe.
  // An image is "safe" if it's below ALL content blocks and not overlapping anything.
  const blockImages: AnchorRect[][] = blocks.map(() => []);
  const unassigned: AnchorRect[] = [];
  const alreadySafe: AnchorRect[] = [];

  const lastBlockEndY = blocks.length > 0 ? blocks[blocks.length - 1].endY : 0;

  for (const r of rects) {
    const imgStartY = r.y1;
    const imgEndY = r.y1 + r.h;

    // Check if image overlaps any content block.
    let overlapsBlock = false;
    for (let b = 0; b < blocks.length; b++) {
      const block = blocks[b];
      // Strict overlap: image must actually intersect the block's vertical range.
      // Use image midpoint for assignment — the block whose range contains the
      // image's center gets the image.
      const imgMidY = (imgStartY + imgEndY) / 2;
      if (imgMidY >= block.startY && imgMidY <= block.endY + SPACING_PX * EMU_PER_PX) {
        blockImages[b].push(r);
        overlapsBlock = true;
        break;
      }
    }

    if (!overlapsBlock) {
      // Image doesn't midpoint-overlap any block.
      // Check if the FULL image intersects ANY block.
      let fullOverlapBlock = -1;
      for (let b = 0; b < blocks.length; b++) {
        const block = blocks[b];
        // Full overlap: image's vertical extent intersects block's range.
        if (imgStartY <= block.endY && imgEndY >= block.startY) {
          fullOverlapBlock = b;
          break;
        }
      }
      if (fullOverlapBlock >= 0) {
        // Image overlaps a block — assign to it.
        blockImages[fullOverlapBlock].push(r);
      } else {
        // Image doesn't overlap ANY block — it's already safe, leave it alone.
        alreadySafe.push(r);
      }
    }
  }

  debugLog.log("DRAWING", `  placeImagesByBlock: ${rects.length - alreadySafe.length} images overlap blocks, ${alreadySafe.length} already safe`);

  // Step 2: Place each block's images right after that block, in document flow.
  // Block A → Images A → Block B → Images B → ...
  // When images extend into or are too close to the next block, rows are
  // inserted to push content down, preserving document flow.
  //
  // GLOBAL RULE: there must always be at least MIN_GAP_ROWS empty rows
  // between the last image's visual bottom and the next content block.
  // insertRowsInWorksheet now properly updates formulas, merge cells,
  // data validation, and conditional formatting so no "Value lost" errors occur.
  const MIN_GAP_ROWS = 2;
  let moved = 0;
  let currentGeom = geom;
  const avgRowH = geom.defaultRowHeight * 12700; // EMU

  for (let b = 0; b < blocks.length; b++) {
    const images = blockImages[b];
    if (images.length === 0) continue;

    // Sort images by original Y position.
    images.sort((a, c) => a.y1 - c.y1 || a.x1 - c.x1);

    // Calculate where this block ends (row number) using current geometry.
    const blockEndRow = blocks[b].endRow;
    // First image starts 1 row below the block's last content row.
    let nextImageRow = blockEndRow + 1;

    // Place images stacked vertically at column A, tracking row positions.
    let lastImageBottomRow = nextImageRow; // row where the last image ends
    for (const img of images) {
      // Calculate image height in rows (rounded up to ensure full coverage).
      const imgHeightRows = Math.max(1, Math.ceil(img.h / avgRowH));

      if (img.newY1 !== currentGeom.rowStart(nextImageRow - 1) || img.x1 !== 0) {
        img.newY1 = currentGeom.rowStart(nextImageRow - 1);
        const originalWidth = img.x2 - img.x1;
        img.x1 = 0;
        img.x2 = originalWidth;
        moved++;
      }
      lastImageBottomRow = nextImageRow + imgHeightRows - 1;
      nextImageRow = lastImageBottomRow + 1;
    }
    debugLog.log("DRAWING", `  block ${b}: placed ${images.length} images after rows ${blockEndRow}, last image ends at row ${lastImageBottomRow}`);

    // Check gap to the next content block.
    if (b + 1 < blocks.length) {
      const nextBlockTopRow = blocks[b + 1].startRow;
      const gapRows = nextBlockTopRow - lastImageBottomRow - 1;

      if (gapRows < MIN_GAP_ROWS) {
        const insertAtRow = lastImageBottomRow + 1 + MIN_GAP_ROWS;
        const rowsNeeded = insertAtRow - nextBlockTopRow;
        if (rowsNeeded > 0) {
          const { xml: newSheetXml, cellMapping: newMapping } = insertRowsInWorksheet(
            await readEntryText(zip, sheetFile) || '',
            nextBlockTopRow,
            rowsNeeded,
          );
          for (const [k, v] of newMapping) cellMapping.set(k, v);
          zip.file(sheetFile, newSheetXml);

          for (let j = b + 1; j < blocks.length; j++) {
            blocks[j].startRow += rowsNeeded;
            blocks[j].endRow += rowsNeeded;
          }

          const modifiedSheetXml = await readEntryText(zip, sheetFile);
          if (modifiedSheetXml && typeof modifiedSheetXml === "string") {
            try {
              const modifiedSheet = parseSheet(modifiedSheetXml, []);
              currentGeom = new DrawingGeometry(modifiedSheet);
            } catch { /* fall back */ }
          }

          debugLog.log("DRAWING", `  inserted ${rowsNeeded} rows at row ${nextBlockTopRow} (gap was ${gapRows}, needed ${MIN_GAP_ROWS})`);
        }
      }
    }
  }

  // Also place unassigned images (those not assigned to any block) after the last block.
  if (unassigned.length > 0) {
    const lastBlock = blocks[blocks.length - 1];
    let currentY = currentGeom.rowStart(lastBlock.endRow) + EMU_PER_PX;
    unassigned.sort((a, c) => a.y1 - c.y1 || a.x1 - c.x1);
    for (const img of unassigned) {
      if (img.newY1 !== currentY || img.x1 !== 0) {
        img.newY1 = currentY;
        const originalWidth = img.x2 - img.x1;
        img.x1 = 0;
        img.x2 = originalWidth;
        moved++;
      }
      currentY += img.h + EMU_PER_PX;
    }
  }

  return moved;
}

export async function fixDrawingOverlaps(
  zip: Zip,
  sheet: ParsedSheet,
  sheetFile: string,
): Promise<ImageOptimizationStats> {
  debugLog.log("DRAWING", `fixDrawingOverlaps START: sheet=${sheetFile}, hasDrawing=${sheet.hasDrawing}, cells=${sheet.cells.size}, maxRow=${sheet.maxRow}`);

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

  if (!sheet.hasDrawing) {
    debugLog.log("DRAWING", `  SKIP: hasDrawing=false — no <drawing> or <legacyDrawing> in sheet XML`);
    return emptyStats;
  }

  const rels = await resolveSheetRels(zip, sheetFile);
  let drawingTarget: string | null = null;
  for (const rel of rels.values()) {
    if (rel.type.includes("/drawing")) {
      drawingTarget = rel.target;
      break;
    }
  }
  if (!drawingTarget) {
    debugLog.log("DRAWING", `  SKIP: no drawing rel found. Available rels: ${Array.from(rels.values()).map(r => r.type.split('/').pop()).join(', ')}`);
    return emptyStats;
  }
  debugLog.log("DRAWING", `  drawingTarget=${drawingTarget}`);

  const originalXml = await readEntryText(zip, drawingTarget);
  if (!originalXml) return emptyStats;

  // Parse with xmldom for position calculation ONLY (read-only).
  let doc: XmlDoc;
  try {
    doc = parseXml(originalXml);
  } catch (err) {
    debugLog.log("DRAWING", `  SKIP: XML parse failed: ${err}`);
    return emptyStats;
  }
  const root = doc.documentElement!;
  debugLog.log("DRAWING", `  XML parsed OK. Root tag: ${root.localName || root.nodeName}`);

  // Find ALL anchor elements, deduplicating mc:Choice/mc:Fallback pairs
  // but keeping distinct anchors that share the same r:embed.
  interface FoundAnchor {
    anchor: XmlEl;
    embedId: string;
  }
  function findAllAnchors(node: XmlEl): FoundAnchor[] {
    const result: FoundAnchor[] = [];
    for (let i = 0; i < node.childNodes.length; i++) {
      const child = node.childNodes[i];
      if (child.nodeType !== 1) continue;
      const el = child as XmlEl;
      const name = el.localName || el.nodeName;
      if (name === "Choice" || name === "Fallback") {
        // For mc:Choice/mc:Fallback, only process Choice (skip Fallback)
        if (name === "Fallback") continue;
        result.push(...findAllAnchors(el));
        continue;
      }
      if (name === "AlternateContent") {
        result.push(...findAllAnchors(el));
        continue;
      }
      if (name === "twoCellAnchor" || name === "oneCellAnchor") {
        const embedId = getAnchorEmbedId(el);
        if (embedId) result.push({ anchor: el, embedId });
      }
    }
    return result;
  }
  const allAnchors = findAllAnchors(root);
  debugLog.log("DRAWING", `  Found ${allAnchors.length} anchors with embed IDs in drawing XML`);
  if (allAnchors.length === 0) {
    // Log what top-level elements exist for debugging
    const topTags: string[] = [];
    for (let i = 0; i < root.childNodes.length; i++) {
      const child = root.childNodes[i];
      if (child.nodeType === 1) {
        const el = child as XmlEl;
        topTags.push(el.localName || el.nodeName);
      }
    }
    debugLog.log("DRAWING", `  Drawing XML top-level elements: [${topTags.join(', ')}]`);
    return emptyStats;
  }

  const geom = new DrawingGeometry(sheet);
  const rects: AnchorRect[] = [];
  for (let i = 0; i < allAnchors.length; i++) {
    const r = geom.parseAnchor(allAnchors[i].anchor);
    if (r) {
      r.index = i;
      rects.push(r);
    } else {
      debugLog.log("DRAWING", `  Anchor #${i} (embed=${allAnchors[i].embedId}): FAILED to parse`);
    }
  }
  debugLog.log("DRAWING", `  Parsed ${rects.length} valid rects from ${allAnchors.length} anchors`);
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

  // Find ALL content blocks (groups of consecutive content rows).
  const blocks = findAllContentBlocks(sheet, geom);
  debugLog.log("DRAWING", `fixDrawingOverlaps: found ${blocks.length} content blocks`);
  for (const b of blocks) {
    debugLog.log("DRAWING", `  Block: rows ${b.startRow}-${b.endRow}`);
  }

  // Content boundary = bottom of ALL content (for overlap/conflict stats).
  const contentBoundaryY = blocks.length > 0 ? blocks[blocks.length - 1].endY : 0;
  stats.contentConflictsBefore = countContentConflicts(rects, blocks);

  // Cell mapping: tracks how cell references shift due to row insertions.
  let cellMapping = new Map<string, string>();

  // Phase 2: Place each image after the content block it overlaps.
  // This is per-block placement: images overlapping Block A go after Block A,
  // images overlapping Block B go after Block B, etc.
  const movedByContentPush = await placeImagesByBlock(rects, blocks, geom, sheet, zip, sheetFile, cellMapping);
  debugLog.log("DRAWING", `  placeImagesByBlock: ${movedByContentPush} images placed after their content blocks`);

  // Mark which anchors overlap content (using actual block intersection).
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    const imgTop = r.y1;
    const imgBottom = r.y1 + r.h;
    anchorInfos[i].overlapsContent = blocks.some((block) => {
      return imgTop < block.endY && imgBottom > block.startY;
    });
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

  debugLog.log("DRAWING", `fixDrawingOverlaps: ${rects.length} images, overlapsBefore=${stats.overlapsBefore}, contentConflictsBefore=${stats.contentConflictsBefore}`);
  debugLog.log("DRAWING", `  contentBoundaryY=${contentBoundaryY}, blocks=${blocks.length}`);
  for (const b of blocks) {
    debugLog.log("DRAWING", `  Block: rows ${b.startRow}-${b.endRow} (Y ${b.startY}-${b.endY})`);
  }
  // Log detailed per-anchor info with overlap analysis.
  for (const ai of anchorInfos) {
    const r = rects[ai.index];
    const imgBottom = r ? Math.round(r.y1 + r.h) : 0;
    const contentOverlap = r ? blocks.some((block) => r.y1 < block.endY && (r.y1 + r.h) > block.startY) : false;
    debugLog.log("DRAWING_ANCHOR", `  #${ai.index}: from=(${ai.fromCol},${ai.fromRow}) to=(${ai.toCol},${ai.toRow}) size=${ai.widthEmu}x${ai.heightEmu} topY=${r ? Math.round(r.y1) : '?'} bottomY=${imgBottom} overlapsContent=${contentOverlap} overlapsWith=[${ai.overlapsWith.join(",")}]`);
  }

  // Phase 3: Resolve any remaining image-image overlaps.
  // After placeImagesByBlock, some overlaps may remain between:
  //   - images placed by per-block logic and already-safe images
  //   - images within the same block that weren't separated
  //   - test cases without content blocks
  // Run the safety pass on ALL images to ensure no overlaps remain.
  const remainingOverlaps = countOverlaps(rects);
  if (remainingOverlaps > 0) {
    debugLog.log("DRAWING", `  ${remainingOverlaps} overlaps remain after placement, running safety pass`);
    spreadRects(rects);
  }
  // Final safety pass: push any remaining overlapping images down.
  const finalOverlapCheck = countOverlaps(rects);
  if (finalOverlapCheck > 0) {
    const ordered = [...rects].sort((a, b) => a.newY1 - b.newY1 || a.x1 - b.x1);
    const placed: AnchorRect[] = [];
    for (const r of ordered) {
      let y = r.newY1;
      for (let attempt = 0; attempt < 50; attempt++) {
        const blockers = placed.filter(
          (p) => p.x1 < r.x2 && p.x2 > r.x1 && p.newY1 < y + r.h && p.newY1 + p.h > y,
        );
        if (blockers.length === 0) break;
        y = Math.max(...blockers.map((p) => p.newY1 + p.h)) + SPACING_PX * EMU_PER_PX;
      }
      r.newY1 = y;
      placed.push(r);
    }
  }

  // Phase 5: Count final stats.
  stats.overlapsAfter = countOverlaps(rects);
  const finalBlocks = findAllContentBlocks(sheet, geom);
  stats.contentConflictsAfter = countContentConflicts(rects, finalBlocks);
  // Track whether x position changed too (for column A migration).
  stats.imagesRepositioned = rects.filter((r) => r.newY1 !== r.y1 || r.x1 !== (r.x2 - r.w)).length;
  stats.imagesResized = rects.filter((r) => {
    const newW = r.w;
    const newH = r.h;
    return Math.abs(newW - (r.x2 - r.x1)) > EMU_PER_PX ||
           Math.abs(newH - (r.y2 - r.y1)) > EMU_PER_PX;
  }).length;    debugLog.log("DRAWING", `  final: overlapsAfter=${stats.overlapsAfter}, contentConflictsAfter=${stats.contentConflictsAfter}, repositioned=${stats.imagesRepositioned}`);
  for (const ai of anchorInfos) {
    const r = rects[ai.index];
    const moved = r ? Math.abs(r.newY1 - r.y1) > EMU_PER_PX : false;
    debugLog.log("DRAWING_RESULT", `  #${ai.index}: moved=${moved} fromY=${r ? Math.round(r.y1) : '?'} toY=${r ? Math.round(r.newY1) : '?'} diff=${r ? Math.round(r.newY1 - r.y1) : '?'} px`);
  }

  // ── Write corrected positions back to the drawing XML ──
  // Uses STRING-based modification on the original XML.
  // DOM re-serialization (serializeXml) produces subtly different XML
  // that Excel rejects — so we never serialize. Instead, we find each
  // anchor's <from>/<to> blocks in the original string and replace
  // only the <row>/<rowOff> values.
  if (stats.imagesRepositioned > 0) {
    // After row insertions, re-read the modified worksheet to get a fresh
    // geometry that reflects the actual row layout. The original `geom` was
    // built from the pre-insertion sheet and doesn't account for shifted rows.
    let writeBackGeom = geom;
    const modifiedSheetXml = await readEntryText(zip, sheetFile);
    if (modifiedSheetXml && typeof modifiedSheetXml === "string") {
      try {
        const modifiedSheet = parseSheet(modifiedSheetXml, []);
        writeBackGeom = new DrawingGeometry(modifiedSheet);
      } catch {
        // Fall back to original geom if re-parsing fails.
      }
    }

    // Build position map: each anchor is identified by its embedId + fromRow/col
    // to handle multiple anchors sharing the same r:embed.
    const embedIdToNewPos = new Map<string, { fromRow: number; fromRowOff: number; toRow: number; toRowOff: number; newY: number; fromCol: number; fromColOff: number }>();
    for (const rect of rects) {
      const originalX1 = rect.x2 - rect.w;
      if (rect.newY1 === rect.y1 && rect.x1 === originalX1) continue;
      const anchor = allAnchors[rect.index];
      if (!anchor) continue;
      const fromPos = writeBackGeom.yToRow(rect.newY1);
      const fromRowOff = Math.max(0, Math.round(fromPos.off));
      const newY2 = rect.newY1 + rect.h;
      const toPos = writeBackGeom.yToRow(newY2);
      const toRowOff = Math.max(0, Math.round(toPos.off));
      // Use embedId + original row as unique key to handle multiple anchors
      // sharing the same r:embed.
      const origRow = intOf(firstChildElement(firstChildElement(allAnchors[rect.index].anchor, 'from')!, 'row')!);
      const key = `${anchor.embedId}@r${origRow}`;
      embedIdToNewPos.set(key, {
        fromRow: fromPos.row, fromRowOff,
        toRow: toPos.row, toRowOff,
        newY: Math.round(rect.newY1),
        fromCol: 0, fromColOff: 0,
      });
    }
    debugLog.log("DRAWING", `  embedIdToNewPos size=${embedIdToNewPos.size}`);
    const modifiedXml = updateAnchorsString(originalXml, embedIdToNewPos);
    if (modifiedXml !== originalXml) {
      zip.file(drawingTarget, modifiedXml);
      debugLog.log("DRAWING", `  Wrote corrected drawing XML to ${drawingTarget} (${embedIdToNewPos.size} anchors updated)`);
    }
  }

  // Phase 6: Process VML drawings to move their images below content too.
  // VML drawings (vmlDrawingN.vml) contain additional image shapes that
  // are separate from the regular drawing XML. These also need repositioning.
  // Find the last content row to pass as the content boundary.
  let maxContentRow = 0;
  for (const [row, cells] of sheet.cells) {
    for (const cell of cells.values()) {
      if ((cell.text ?? "").trim()) {
        if (row > maxContentRow) maxContentRow = row;
        break;
      }
    }
  }
  debugLog.log("DRAWING", `  VML check: maxContentRow=${maxContentRow}, blocks=${blocks.length}`);
  if (maxContentRow > 0) {
    // Use the content block end row for VML boundary (most accurate)
    const vmlBoundary = blocks.length > 0 ? blocks[blocks.length - 1].endRow + 1 : maxContentRow + 1;
    debugLog.log("DRAWING", `  VML boundary: ${vmlBoundary}`);
    const vmlMoved = await processVmlDrawings(zip, sheetFile, sheet, vmlBoundary);
    debugLog.log("DRAWING", `  VML result: ${vmlMoved} shapes moved`);
  }

  stats.cellMapping = cellMapping;

  return stats;
}

/**
 * Counts the number of overlapping image pairs.
 * Uses sweep-line algorithm for O(n log n) performance on large datasets.
 */
function countOverlaps(rects: AnchorRect[]): number {
  const n = rects.length;
  if (n <= 1) return 0;
  if (n <= 50) {
    // For small counts, brute-force is faster due to lower overhead
    let count = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
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

  // Sweep-line: sort by Y start, use active set for X overlap check
  let count = 0;
  const indexed = rects.map((r, i) => ({ r, i }));
  indexed.sort((a, b) => a.r.newY1 - b.r.newY1);
  const active: typeof indexed = [];
  for (const item of indexed) {
    const yTop = item.r.newY1;
    const yBottom = yTop + item.r.h;
    // Remove items that end before this one starts
    while (active.length > 0 && active[0].r.newY1 + active[0].r.h <= yTop) {
      active.shift();
    }
    // Check X overlap against active items
    for (const a of active) {
      if (a.r.x1 < item.r.x2 && a.r.x2 > item.r.x1) {
        count++;
      }
    }
    active.push(item);
  }
  return count;
}

/**
 * Counts images whose bounding box overlaps with the content boundary.
 * Uses newY1 (the position after repositioning) so the 'after' count
 * reflects the actual final state.
 */
function countContentConflicts(rects: AnchorRect[], blocks: ContentBlock[]): number {
  // Count images that ACTUALLY overlap a content block (AABB intersection).
  // Previous version used contentBoundaryY (bottom of last block), which
  // falsely counted images in gaps between blocks as conflicts.
  return rects.filter((r) => {
    const imgTop = r.newY1;
    const imgBottom = r.newY1 + r.h;
    return blocks.some((block) => {
      // Vertical overlap: image top < block bottom AND image bottom > block top
      return imgTop < block.endY && imgBottom > block.startY;
    });
  }).length;
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
 * Finds the first content gap (empty rows between two content blocks).
 * Returns the Y position where images should start, and the gap info.
 * If no gap exists, returns the position after the last content row.
 */
function findFirstContentGap(
  sheet: ParsedSheet,
  geom: DrawingGeometry,
): { startY: number; gapStartRow: number; gapRows: number } {
  // Find all content rows.
  const contentRows = new Set<number>();
  for (const [row, cells] of sheet.cells) {
    for (const cell of cells.values()) {
      if (cell.text?.trim()) {
        contentRows.add(row);
        break;
      }
    }
  }

  // Sort content rows.
  const sorted = Array.from(contentRows).sort((a, b) => a - b);
  if (sorted.length === 0) return { startY: 0, gapStartRow: 1, gapRows: 0 };

  // Find first USABLE gap between content blocks.
  // A gap must be at least 3 rows to be useful for placing images.
  // Small gaps (1-2 rows between header and data) are not usable.
  for (let i = 0; i < sorted.length - 1; i++) {
    const currentRow = sorted[i];
    const nextRow = sorted[i + 1];
    if (nextRow - currentRow > 3) {
      // Found a usable gap.
      const gapStartRow = currentRow + 1;
      const gapEndRow = nextRow - 1;
      const gapRows = gapEndRow - gapStartRow + 1;
      const startY = geom.rowStart(gapStartRow - 1);
      debugLog.log("DRAWING", `findFirstContentGap: gap at rows ${gapStartRow}-${gapEndRow} (${gapRows} rows), startY=${startY}`);
      return { startY, gapStartRow, gapRows };
    }
  }

  // No usable gap found — use position after ALL content.
  // This ensures images are placed below all content, not inside it.
  const lastRow = sorted[sorted.length - 1];
  const startY = geom.rowStart(lastRow);
  debugLog.log("DRAWING", `findFirstContentGap: no usable gap, placing below row ${lastRow}, startY=${startY}`);
  return { startY, gapStartRow: lastRow + 1, gapRows: 0 };
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
 * Smart push below content: pushes images that overlap content below
 * the first content gap in document-flow order.
 *
 * Algorithm:
 *   1. Find the first content gap (space between two content blocks)
 *   2. Sort images by original Y position (top-to-bottom)
 *   3. Move ALL images to column A (col=0)
 *   4. Place images in the gap, stacked vertically
 *   5. If gap is too small, images extend beyond (caller inserts rows)
 *
 * This preserves relative ordering and ensures no image overlaps content.
 */
function pushBelowContentSmart(
  rects: AnchorRect[],
  contentBoundaryY: number,
  geom: DrawingGeometry,
): number {
  if (rects.length === 0 || contentBoundaryY === 0) return 0;

  // Sort by original Y position (top-to-bottom).
  const sorted = [...rects].sort((a, b) => a.y1 - b.y1 || a.x1 - b.x1);

  let moved = 0;
  // Place images starting at the content boundary (first gap position).
  let nextAvailableY = contentBoundaryY + SPACING_PX * EMU_PER_PX;

  for (const r of sorted) {
    // Move ALL images to the gap area, starting at column A.
    // Place at next available Y position, stacked vertically.
    const candidateY = Math.max(r.y1, nextAvailableY);
    if (candidateY !== r.y1 || r.x1 !== 0) {
      r.newY1 = candidateY;
      // Force column A: set x1 to 0, x2 to width (preserving original width).
      const originalWidth = r.x2 - r.x1;
      r.x1 = 0;
      r.x2 = originalWidth;
      moved++;
    }
    // The next image must start below this one.
    nextAvailableY = r.newY1 + r.h + SPACING_PX * EMU_PER_PX;
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
    // Start at the current position of the first image in the group.
    // Do NOT use contentBoundaryY — screenshots may intentionally overlap content.
    let startY = Infinity;
    for (const r of group) {
      startY = Math.min(startY, r.newY1);
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
  const placed: AnchorRect[] = [];
  let moved = 0;
  for (const r of ordered) {
    let y = r.newY1;
    for (;;) {
      const blockers = placed.filter(
        (p) => p.x1 < r.x2 && p.x2 > r.x1 && p.newY1 < y + r.h && p.newY1 + p.h > y,
      );
      if (blockers.length === 0) break;
      y = Math.max(...blockers.map((p) => p.newY1 + p.h)) + SPACING_PX * EMU_PER_PX;

    }
    if (y !== r.y1) moved++;
    r.newY1 = y;
    placed.push(r);
  }
  return moved;
}

/**
 * Updates <row>/<rowOff> values using STRING-based replacement on the
 * original XML. This avoids DOM re-serialization which corrupts the XML.
 *
 * For each anchor identified by its r:embed ID:
 *   1. Finds the anchor block in the original XML string
 *   2. Extracts the <from>...</from> block
 *   3. Replaces <row>/<rowOff> values within it using regex
 *   4. Does the same for <to>...</to> if present
 *   5. Writes back the modified string (never re-serializes)
 *
 * This approach preserves the original XML byte-for-byte except for
 * the specific row/rowOff values that need to change.
 */
function updateAnchorsString(
  originalXml: string,
  embedIdToNewPos: Map<string, { fromRow: number; fromRowOff: number; toRow: number; toRowOff: number; newY: number; fromCol: number; fromColOff: number }>,
): string {
  if (embedIdToNewPos.size === 0) return originalXml;

  // Detect the namespace prefix used for drawing elements (xdr:, a:, or none).
  let pfx = "xdr:";
  if (/<a:from>|<a:row>/i.test(originalXml)) pfx = "a:";
  else if (/<from>|<row>/i.test(originalXml)) pfx = "";

  // Helper to build a tag name with the detected prefix.
  const tag = (name: string) => pfx ? `${pfx}${name}` : name;

  // ── Phase 1: Collect ALL anchor blocks and their embed IDs ──
  // We do this on the ORIGINAL string (no modifications yet) so all
  // indices are stable.
  interface AnchorBlock {
    open: number;       // absolute start in originalXml
    close: number;      // absolute end (exclusive) in originalXml
    embedId: string;
    isTwoCell: boolean;
  }
  const blocks: AnchorBlock[] = [];
  {
    const twoTag = `<${tag("twoCellAnchor")}`;
    const oneTag = `<${tag("oneCellAnchor")}`;
    const twoClose = `</${tag("twoCellAnchor")}>`;
    const oneClose = `</${tag("oneCellAnchor")}>`;
    let pos = 0;
    while (pos < originalXml.length) {
      const twoIdx = originalXml.indexOf(twoTag, pos);
      const oneIdx = originalXml.indexOf(oneTag, pos);
      let anchorOpen = -1;
      let closeTag = "";
      let isTwoCell = false;
      if (twoIdx >= 0 && (oneIdx < 0 || twoIdx < oneIdx)) {
        anchorOpen = twoIdx; closeTag = twoClose; isTwoCell = true;
      } else if (oneIdx >= 0) {
        anchorOpen = oneIdx; closeTag = oneClose; isTwoCell = false;
      }
      if (anchorOpen === -1) break;

      const anchorClose = originalXml.indexOf(closeTag, anchorOpen);
      if (anchorClose === -1) break;

      // Find embed ID and from-row within this anchor block.
      const blockStr = originalXml.substring(anchorOpen, anchorClose + closeTag.length);
      const embedMatch = blockStr.match(/r:embed="([^"]+)"/);
      // Use detected prefix to match the row element correctly.
      const rowTag = tag("row");
      const rowRegex = new RegExp(`<${rowTag}>(\\d+)<\/${rowTag}>`);
      const fromRowMatch = blockStr.match(rowRegex);
      if (embedMatch && fromRowMatch) {
        // Build unique key: embedId@rROW to handle multiple anchors sharing r:embed
        const key = `${embedMatch[1]}@r${fromRowMatch[1]}`;
        if (embedIdToNewPos.has(key)) {
          blocks.push({
            open: anchorOpen,
            close: anchorClose + closeTag.length,
            embedId: key,
            isTwoCell,
          });
        } else if (embedIdToNewPos.has(embedMatch[1])) {
          // Fallback: old-style key (single anchor per embed)
          blocks.push({
            open: anchorOpen,
            close: anchorClose + closeTag.length,
            embedId: embedMatch[1],
            isTwoCell,
          });
        }
      }
      pos = anchorClose + closeTag.length;
    }
  }

  if (blocks.length === 0) return originalXml;

  // ── Phase 2: Process blocks from bottom to top ──
  // By processing highest-index blocks first, earlier indices remain valid.
  let result = originalXml;
  let anchorsUpdated = 0;

  // Sort blocks by open position descending (bottom to top).
  blocks.sort((a, b) => b.open - a.open);

  for (const block of blocks) {
    const newPos = embedIdToNewPos.get(block.embedId);
    if (!newPos) continue;

    const anchorBlock = result.substring(block.open, block.close);

    // Update <from> block.
    const fromOpenTag = `<${tag("from")}>`;
    const fromCloseTag = `</${tag("from")}>`;
    const fromOpen = anchorBlock.indexOf(fromOpenTag);
    const fromClose = anchorBlock.indexOf(fromCloseTag, fromOpen);
    let updatedBlock = anchorBlock;

    if (fromOpen !== -1 && fromClose !== -1) {
      const fromBlock = anchorBlock.substring(fromOpen, fromClose + fromCloseTag.length);
      let updatedFrom = fromBlock;
      const rowOpen = `<${tag("row")}>`;
      const rowClose = `</${tag("row")}>`;
      const rowOffOpen = `<${tag("rowOff")}>`;
      const rowOffClose = `</${tag("rowOff")}>`;

      const rowIdx = updatedFrom.indexOf(rowOpen);
      if (rowIdx !== -1) {
        const rowEnd = updatedFrom.indexOf(rowClose, rowIdx);
        if (rowEnd !== -1) {
          updatedFrom = updatedFrom.substring(0, rowIdx + rowOpen.length) +
            String(newPos.fromRow) + updatedFrom.substring(rowEnd);
        }
      }
      const rowOffIdx = updatedFrom.indexOf(rowOffOpen);
      if (rowOffIdx !== -1) {
        const rowOffEnd = updatedFrom.indexOf(rowOffClose, rowOffIdx);
        if (rowOffEnd !== -1) {
          updatedFrom = updatedFrom.substring(0, rowOffIdx + rowOffOpen.length) +
            String(newPos.fromRowOff) + updatedFrom.substring(rowOffEnd);
        }
      }
      // Update <col>/<colOff> to move image to column A.
      const colOpen = `<${tag("col")}>`;
      const colClose = `</${tag("col")}>`;
      const colOffOpen = `<${tag("colOff")}>`;
      const colOffClose = `</${tag("colOff")}>`;
      const colIdx = updatedFrom.indexOf(colOpen);
      if (colIdx !== -1) {
        const colEnd = updatedFrom.indexOf(colClose, colIdx);
        if (colEnd !== -1) {
          updatedFrom = updatedFrom.substring(0, colIdx + colOpen.length) +
            String(newPos.fromCol) + updatedFrom.substring(colEnd);
        }
      }
      const colOffIdx = updatedFrom.indexOf(colOffOpen);
      if (colOffIdx !== -1) {
        const colOffEnd = updatedFrom.indexOf(colOffClose, colOffIdx);
        if (colOffEnd !== -1) {
          updatedFrom = updatedFrom.substring(0, colOffIdx + colOffOpen.length) +
            String(newPos.fromColOff) + updatedFrom.substring(colOffEnd);
        }
      }
      updatedBlock = anchorBlock.substring(0, fromOpen) +
        updatedFrom + anchorBlock.substring(fromClose + fromCloseTag.length);
    }

    // Update <to> block (only for twoCellAnchor).
    if (block.isTwoCell) {
      const toOpenTag = `<${tag("to")}>`;
      const toCloseTag = `</${tag("to")}>`;
      const toOpen = updatedBlock.indexOf(toOpenTag);
      const toClose = updatedBlock.indexOf(toCloseTag, toOpen);
      if (toOpen !== -1 && toClose !== -1) {
        const toBlock = updatedBlock.substring(toOpen, toClose + toCloseTag.length);
        let updatedTo = toBlock;
        const rowOpen = `<${tag("row")}>`;
        const rowClose = `</${tag("row")}>`;
        const rowOffOpen = `<${tag("rowOff")}>`;
        const rowOffClose = `</${tag("rowOff")}>`;
        const rowIdx = updatedTo.indexOf(rowOpen);
        if (rowIdx !== -1) {
          const rowEnd = updatedTo.indexOf(rowClose, rowIdx);
          if (rowEnd !== -1) {
            updatedTo = updatedTo.substring(0, rowIdx + rowOpen.length) +
              String(newPos.toRow) + updatedTo.substring(rowEnd);
          }
        }
        const rowOffIdx = updatedTo.indexOf(rowOffOpen);
        if (rowOffIdx !== -1) {
          const rowOffEnd = updatedTo.indexOf(rowOffClose, rowOffIdx);
          if (rowOffEnd !== -1) {
            updatedTo = updatedTo.substring(0, rowOffIdx + rowOffOpen.length) +
              String(newPos.toRowOff) + updatedTo.substring(rowOffEnd);
          }
        }
        updatedBlock = updatedBlock.substring(0, toOpen) +
          updatedTo + updatedBlock.substring(toClose + toCloseTag.length);
      }
    }

    // Update <a:off x> and <a:off y> inside <xdr:spPr><a:xfrm> to match the new anchor position.
    // Some viewers/renderers use this absolute position independently of <xdr:from>.
    // NOTE: spPr may have attributes like bwMode="auto" so search without closing >.
    const spPrOpen = `<${tag("spPr")}`;
    const xfrmTag = `<a:xfrm>`;
    const offTag = `<a:off`;
    const spPrIdx = updatedBlock.indexOf(spPrOpen);
    if (spPrIdx !== -1) {
      const xfrmIdx = updatedBlock.indexOf(xfrmTag, spPrIdx);
      if (xfrmIdx !== -1) {
        const offIdx = updatedBlock.indexOf(offTag, xfrmIdx);
        if (offIdx !== -1) {
          // Update x="..." attribute (column A = 0 EMU).
          const xAttrRegex = /x="([^"]+)"/;
          const xMatch = updatedBlock.substring(offIdx).match(xAttrRegex);
          if (xMatch) {
            const xAttrStart = offIdx + xMatch.index!;
            const xValueStart = xAttrStart + 3;
            const xValueEnd = xValueStart + xMatch[1].length;
            updatedBlock = updatedBlock.substring(0, xValueStart) +
              "0" + updatedBlock.substring(xValueEnd);
          }
          // Update y="..." attribute.
          const yAttrRegex = /y="([^"]+)"/;
          const yMatch = updatedBlock.substring(offIdx).match(yAttrRegex);
          if (yMatch) {
            const yAttrStart = offIdx + yMatch.index!;
            const yValueStart = yAttrStart + 3;
            const yValueEnd = yValueStart + yMatch[1].length;
            updatedBlock = updatedBlock.substring(0, yValueStart) +
              String(newPos.newY) + updatedBlock.substring(yValueEnd);
          }
        }
      }
    }

    // Replace this block in the result.
    result = result.substring(0, block.open) + updatedBlock + result.substring(block.close);
    anchorsUpdated++;
  }

  debugLog.log("DRAWING", `  updateAnchorsString: ${anchorsUpdated} anchor blocks updated (prefix="${pfx || '(none)'}")`);
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
  public defaultRowHeight: number;

  // Performance caches: precomputed prefix sums for O(1) lookups.
  private _rowEmuCache: number[] = [];
  private _rowStartCache: number[] = []; // prefix sum: _rowStartCache[i] = sum of rowEmu(0..i-1)
  private _maxCachedRow = 0;
  private _colEmuCache: number[] = [];
  private _colStartCache: number[] = [];
  private _maxCachedCol = 0;

  constructor(sheet: ParsedSheet) {
    this.sheet = sheet;
    const fmt = firstChildElement(sheet.root, "sheetFormatPr");
    const dcw = fmt ? parseFloat(getAttr(fmt, "defaultColWidth") ?? "") : NaN;
    const drh = fmt ? parseFloat(getAttr(fmt, "defaultRowHeight") ?? "") : NaN;
    this.defaultColWidth = isNaN(dcw) ? DEFAULT_COL_WIDTH : dcw;
    this.defaultRowHeight = isNaN(drh) ? DEFAULT_ROW_HEIGHT : drh;
    // Precompute caches up to maxRow + 200 (buffer for image heights).
    // Handle undefined/NaN maxRow (e.g. from mock sheets in tests).
    const maxRow = sheet.maxRow || sheet.cells.size || 200;
    const limit = Math.min(maxRow + 200, 50_000);
    this._ensureRowCache(limit);
    this._ensureColCache(256); // 256 columns covers all practical sheets
  }

  private _ensureRowCache(upTo: number): void {
    if (upTo <= this._maxCachedRow) return;
    const start = this._maxCachedRow;
    if (start === 0) {
      this._rowEmuCache = [];
      this._rowStartCache = [0]; // _rowStartCache[0] = 0 (sum of 0 rows)
    }
    let acc = this._rowStartCache[this._rowStartCache.length - 1] ?? 0;
    for (let r = start; r < upTo; r++) {
      const rowEl = this.sheet.rowByNum.get(r + 1);
      let pt = this.defaultRowHeight;
      if (rowEl) {
        const ht = parseFloat(getAttr(rowEl, "ht") ?? "");
        if (!isNaN(ht) && ht > 0) pt = ht;
      }
      const emu = pt * 12700;
      this._rowEmuCache.push(emu);
      acc += emu;
      this._rowStartCache.push(acc);
    }
    this._maxCachedRow = upTo;
  }

  private _ensureColCache(upTo: number): void {
    if (upTo <= this._maxCachedCol) return;
    const start = this._maxCachedCol;
    if (start === 0) {
      this._colEmuCache = [];
      this._colStartCache = [0];
    }
    let acc = this._colStartCache[this._colStartCache.length - 1] ?? 0;
    for (let c = start; c < upTo; c++) {
      let width = this.defaultColWidth;
      for (const spec of this.sheet.cols) {
        if (c + 1 >= spec.min && c + 1 <= spec.max) {
          if (spec.width !== undefined) width = spec.width;
          break;
        }
      }
      const emu = (width * 7 + 5) * EMU_PER_PX;
      this._colEmuCache.push(emu);
      acc += emu;
      this._colStartCache.push(acc);
    }
    this._maxCachedCol = upTo;
  }

  parseAnchor(el: XmlEl): AnchorRect | null {
    const from = firstChildElement(el, "from");
    if (!from) return null;
    // XML row/col values are 1-based; geometry functions use 0-based
    // indices internally so that rowStart(0) = 0 and rowStart(N)
    // equals the EMU position of XML row N+1.
    const rawCol1 = intOf(firstChildElement(from, "col"));
    const off1 = intOf(firstChildElement(from, "colOff"));
    const rawRow1 = intOf(firstChildElement(from, "row"));
    const roff1 = intOf(firstChildElement(from, "rowOff"));
    if (rawCol1 < 0 || rawRow1 < 0) return null;
    const col1 = rawCol1 - 1;
    const row1 = rawRow1 - 1;
    const x1 = this.colStart(col1) + off1;
    const y1 = this.rowStart(row1) + roff1;

    const to = firstChildElement(el, "to");
    if (to) {
      const rawCol2 = intOf(firstChildElement(to, "col"));
      const off2 = intOf(firstChildElement(to, "colOff"));
      const rawRow2 = intOf(firstChildElement(to, "row"));
      const roff2 = intOf(firstChildElement(to, "rowOff"));
      if (rawCol2 < 0 || rawRow2 < 0) return null;
      const col2 = rawCol2 - 1;
      const row2 = rawRow2 - 1;
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

  /** EMU width of column `col` (0-based). Uses cached prefix sum. */
  private colEmu(col: number): number {
    this._ensureColCache(col + 1);
    return this._colEmuCache[col] ?? (this.defaultColWidth * 7 + 5) * EMU_PER_PX;
  }

  /** EMU height of row `row` (0-based). Uses cached prefix sum. */
  public rowEmu(row: number): number {
    this._ensureRowCache(row + 1);
    return this._rowEmuCache[row] ?? this.defaultRowHeight * 12700;
  }

  private colStart(col: number): number {
    this._ensureColCache(col + 1);
    return this._colStartCache[col] ?? 0;
  }

  public rowStart(row: number): number {
    this._ensureRowCache(row + 1);
    return this._rowStartCache[row] ?? 0;
  }

  /** Converts an EMU y position back to (row, rowOff) with rowOff ≥ 0.
   *  Returns 1-based row number suitable for writing to OOXML.
   *  Uses binary search on cached prefix sums for O(log n) performance. */
  public yToRow(y: number): { row: number; off: number } {
    // Ensure cache covers enough rows. Estimate: y / minRowHeight.
    const estimatedRow = Math.ceil(y / (10 * 12700)) + 100;
    this._ensureRowCache(Math.max(estimatedRow, this._maxCachedRow));
    // Binary search: find the LARGEST index where _rowStartCache[idx] <= y.
    let lo = 0;
    let hi = this._rowStartCache.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1; // upper mid to avoid infinite loop
      if (this._rowStartCache[mid] <= y) lo = mid;
      else hi = mid - 1;
    }
    return { row: lo + 1, off: Math.max(0, y - this._rowStartCache[lo]) };
  }

  /** Converts EMU (x, y) back to (col, row) for diagnostics. */
  public emuToRC(x: number, y: number): { col: number; row: number } {
    const { row } = this.yToRow(y);
    this._ensureColCache(256);
    let lo = 0;
    let hi = this._colStartCache.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this._colStartCache[mid] <= x) lo = mid;
      else hi = mid - 1;
    }
    return { col: lo, row };
  }
}

function intOf(el: XmlEl | undefined): number {
  if (!el) return -1;
  const n = parseInt(textContent(el).trim(), 10);
  return isNaN(n) ? -1 : n;
}
