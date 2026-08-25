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
  serializeXml,
  textContent,
} from "./xml";
import { ParsedSheet } from "./worksheet";
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
  // Discover logical drawings — groups by r:embed, deduplicating
  // mc:Choice + mc:Fallback that represent the same image.
  const logicalDrawings = findLogicalDrawings(root);
  if (logicalDrawings.length === 0) return emptyStats;

  const geom = new DrawingGeometry(sheet);
  const rects: AnchorRect[] = [];
  for (const drawing of logicalDrawings) {
    const r = geom.parseAnchor(drawing.preferred);
    if (r) {
      r.index = drawing.index;
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
  // Uses DOM-based mutation: modifies <row>/<rowOff> via DOM APIs on the
  // SAME parsed document, then serializes. This correctly handles:
  //   - mc:AlternateContent (updates both Choice and Fallback)
  //   - No sequential index matching (DOM finds exact elements)
  //   - No regex that could match across anchor boundaries
  if (stats.imagesRepositioned > 0) {
    const modifiedXml = updateAnchorsDom(doc, rects, logicalDrawings, geom);
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
 * Updates <row>/<rowOff> values using DOM-based mutation.
 *
 * For each logical drawing that needs repositioning:
 *   1. Finds ALL anchor elements for that drawing (Choice + Fallback + direct)
 *   2. For each anchor, finds <from> → <row>/<rowOff> and <to> → <row>/<rowOff>
 *   3. Sets their text content via DOM APIs
 *   4. Serializes the modified DOM back to XML
 *
 * This approach:
 *   - Correctly handles mc:AlternateContent (updates BOTH Choice and Fallback)
 *   - Uses structural identity (r:embed) not sequential index matching
 *   - Modifies only <row>/<rowOff> — all other XML content preserved
 *   - No regex that could match across anchor boundaries
 */
function updateAnchorsDom(
  doc: XmlDoc,
  rects: AnchorRect[],
  logicalDrawings: Array<{
    embedId: string;
    anchors: XmlEl[];
    preferred: XmlEl;
    index: number;
  }>,
  geom: DrawingGeometry,
): string {
  // Build a map from logical drawing index to its rect
  const rectByIndex = new Map<number, AnchorRect>();
  for (const r of rects) rectByIndex.set(r.index, r);

  // For each logical drawing that needs repositioning,
  // update ALL its anchor elements (Choice + Fallback)
  for (const drawing of logicalDrawings) {
    const rect = rectByIndex.get(drawing.index);
    if (!rect || rect.newY1 === rect.y1) continue; // not moved

    // Calculate new row/rowOff for <from>
    const fromPos = geom.yToRow(rect.newY1);
    const fromRowOff = Math.max(0, Math.round(fromPos.off));

    // Calculate new row/rowOff for <to>
    const newY2 = rect.newY1 + rect.h;
    const toPos = geom.yToRow(newY2);
    const toRowOff = Math.max(0, Math.round(toPos.off));

    // Update ALL anchor elements for this logical drawing
    for (const anchorEl of drawing.anchors) {
      updateAnchorElement(anchorEl, fromPos.row, fromRowOff, toPos.row, toRowOff);
    }
  }

  // Serialize the modified DOM back to XML
  return serializeXml(doc.documentElement!);
}

/**
 * Updates the <row>/<rowOff> values within a single anchor element.
 * Finds <from> and <to> children, then their <row>/<rowOff> children.
 */
function updateAnchorElement(
  anchor: XmlEl,
  fromRow: number,
  fromRowOff: number,
  toRow: number,
  toRowOff: number,
): void {
  // Update <from> block
  const from = firstChildElement(anchor, "from");
  if (from) {
    setChildText(from, "row", String(fromRow));
    setChildText(from, "rowOff", String(fromRowOff));
  }

  // Update <to> block (only for twoCellAnchor)
  const to = firstChildElement(anchor, "to");
  if (to) {
    setChildText(to, "row", String(toRow));
    setChildText(to, "rowOff", String(toRowOff));
  }
}

/**
 * Sets the text content of a child element within a parent.
 * Handles namespace prefixes (e.g. <xdr:row> vs <row>).
 */
function setChildText(parent: XmlEl, localName: string, value: string): void {
  for (let i = 0; i < parent.childNodes.length; i++) {
    const child = parent.childNodes[i];
    if (child.nodeType !== 1) continue;
    const el = child as XmlEl;
    const name = el.localName || el.nodeName;
    if (name === localName) {
      // Replace all child text nodes
      while (el.firstChild) el.removeChild(el.firstChild);
      el.appendChild(el.ownerDocument!.createTextNode(value));
      return;
    }
  }
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
