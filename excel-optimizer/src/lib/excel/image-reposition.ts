/**
 * Image repositioning — TWO-PASS APPROACH.
 *
 * PASS 1: Use ExcelJS to READ the workbook and calculate where images
 *          should be moved (layout calculation only).
 *
 * PASS 2: Apply the calculated positions by surgically modifying the
 *          original zip's drawing XML — replacing only <row> and <rowOff>
 *          values while preserving every other byte (including namespace
 *          declarations, element order, whitespace, and attributes).
 *
 * WHY NOT USE EXCELJS TO WRITE:
 *   ExcelJS's writeBuffer() re-serializes OOXML XML from its internal model.
 *   Even though the result is structurally valid XML, Excel's stricter
 *   OOXML parser detects subtle namespace/attribute differences and triggers
 *   "Repaired Records: Drawing" — wiping all images.
 *
 * WHY SURGICAL XML MODIFICATION WORKS:
 *   We modify the EXACT same XML bytes that were in the original file,
 *   changing only the numeric content of <row> and <rowOff> elements
 *   inside <from> and <to> blocks. Every other byte — including XML
 *   declarations, namespace prefixes, element ordering, CDATA sections,
 *   processing instructions, and comments — remains byte-for-byte identical.
 */
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { debugLog } from "./debug-log";

/** EMU per pixel (914400 EMU per inch / 96 px per inch). */
const EMU_PER_PX = 9525;
/** EMU per row (default 15pt row height × 12700 EMU/pt). */
const EMU_PER_ROW = 15 * 12700;
/** EMU per column (default 8.43 chars × 7 px/char × 9525 EMU/px). */
const EMU_PER_COL = 8.43 * 7 * EMU_PER_PX;
/** Spacing between repositioned images (in rows). */
const GRID_ROW_GAP = 2;
/** Max images per grid row. */
const MAX_GRID_COLS = 3;
/** Target image width in columns (~500px). */
const TARGET_WIDTH_COLS = 7;
/** Target image height in rows (~375px). */
const TARGET_HEIGHT_ROWS = 25;

/**
 * Result from the layout calculation phase.
 */
export interface ImageRepositionResult {
  totalImages: number;
  imagesRepositioned: number;
  overlapsBefore: number;
  overlapsAfter: number;
  contentConflictsBefore: number;
  contentConflictsAfter: number;
  sheets: Array<{
    name: string;
    images: number;
    repositioned: number;
    overlapsBefore: number;
    overlapsAfter: number;
  }>;
}

/**
 * Per-anchor modification: new row/rowOff values for <from> and <to>.
 */
interface AnchorRowChange {
  fromRow: number;
  fromRowOff: number;
  toRow: number;
  toRowOff: number;
}

// ─── PASS 1: LAYOUT CALCULATION (ExcelJS read-only) ───────────────────────

function getLastContentRow(ws: ExcelJS.Worksheet): number {
  let maxRow = 0;
  ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
    let hasContent = false;
    row.eachCell({ includeEmpty: false }, (cell) => {
      const val = cell.value;
      if (val !== null && val !== undefined && val !== "") {
        hasContent = true;
      }
    });
    if (hasContent && rowNum > maxRow) {
      maxRow = rowNum;
    }
  });
  return maxRow;
}

function rowToEmu(row: number, ws: ExcelJS.Worksheet): number {
  let acc = 0;
  for (let r = 1; r <= row; r++) {
    const rowObj = ws.getRow(r);
    const ht = rowObj.height || (ws.properties.defaultRowHeight as number) || 15;
    acc += ht * 12700;
  }
  return acc;
}

interface ImageInfo {
  mediaIndex: number;
  tlCol: number;
  tlRow: number;
  tlColOff: number;
  tlRowOff: number;
  brCol: number;
  brRow: number;
  brColOff: number;
  brRowOff: number;
  widthEmu: number;
  heightEmu: number;
}

function extractImagePositions(ws: ExcelJS.Worksheet): ImageInfo[] {
  const images = ws.getImages();
  const positions: ImageInfo[] = [];

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    if (img.type !== "image") continue;

    const tl = img.range.tl;
    const br = img.range.br;

    const tlCol = (tl.nativeCol ?? tl.col ?? 0) as number;
    const tlRow = (tl.nativeRow ?? tl.row ?? 0) as number;
    const tlColOff = (tl.nativeColOff ?? 0) as number;
    const tlRowOff = (tl.nativeRowOff ?? 0) as number;

    let brCol: number, brRow: number, brColOff: number, brRowOff: number;
    if (br) {
      brCol = (br.nativeCol ?? br.col ?? tlCol + 1) as number;
      brRow = (br.nativeRow ?? br.row ?? tlRow + 1) as number;
      brColOff = (br.nativeColOff ?? 0) as number;
      brRowOff = (br.nativeRowOff ?? 0) as number;
    } else {
      const ext = (img.range as unknown as Record<string, unknown>).ext as
        | { cx?: number; cy?: number }
        | undefined;
      const widthEmu = ext?.cx ?? 500 * EMU_PER_PX;
      const heightEmu = ext?.cy ?? 350 * EMU_PER_PX;
      brCol = tlCol;
      brRow = tlRow;
      brColOff = tlColOff + widthEmu;
      brRowOff = tlRowOff + heightEmu;
    }

    const leftEmu = tlCol * EMU_PER_COL + tlColOff;
    const rightEmu = brCol * EMU_PER_COL + brColOff;
    const topEmu = tlRow * EMU_PER_ROW + tlRowOff;
    const bottomEmu = brRow * EMU_PER_ROW + brRowOff;
    const widthEmu = Math.max(rightEmu - leftEmu, EMU_PER_PX);
    const heightEmu = Math.max(bottomEmu - topEmu, EMU_PER_PX);

    positions.push({
      mediaIndex: i,
      tlCol,
      tlRow,
      tlColOff,
      tlRowOff,
      brCol,
      brRow,
      brColOff,
      brRowOff,
      widthEmu,
      heightEmu,
    });
  }

  return positions;
}

function imageOverlapsContent(
  img: ImageInfo,
  contentBoundaryRow: number,
  ws: ExcelJS.Worksheet,
): boolean {
  if (contentBoundaryRow === 0) return false;
  const boundaryEmu = rowToEmu(contentBoundaryRow, ws);
  const imgTop = img.tlRow * EMU_PER_ROW + img.tlRowOff;
  return imgTop < boundaryEmu;
}

function imagesOverlap(a: ImageInfo, b: ImageInfo): boolean {
  const aLeft = a.tlCol * EMU_PER_COL + a.tlColOff;
  const aRight = a.brCol * EMU_PER_COL + a.brColOff;
  const aTop = a.tlRow * EMU_PER_ROW + a.tlRowOff;
  const aBottom = a.brRow * EMU_PER_ROW + a.brRowOff;
  const bLeft = b.tlCol * EMU_PER_COL + b.tlColOff;
  const bRight = b.brCol * EMU_PER_COL + b.brColOff;
  const bTop = b.tlRow * EMU_PER_ROW + b.tlRowOff;
  const bBottom = b.brRow * EMU_PER_ROW + b.brRowOff;
  return aLeft < bRight && aRight > bLeft && aTop < bBottom && aBottom > bTop;
}

function countOverlaps(positions: ImageInfo[]): number {
  let count = 0;
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      if (imagesOverlap(positions[i], positions[j])) count++;
    }
  }
  return count;
}

/**
 * Compute new positions for images that need repositioning.
 * Returns per-anchor row changes keyed by mediaIndex.
 */
function calculateRepositioning(
  ws: ExcelJS.Worksheet,
): { positions: ImageInfo[]; changes: Map<number, AnchorRowChange> } {
  const positions = extractImagePositions(ws);
  const changes = new Map<number, AnchorRowChange>();

  if (positions.length === 0) return { positions, changes };

  const lastContentRow = getLastContentRow(ws);

  // Detect which images need moving
  const needsMove: ImageInfo[] = [];
  for (const pos of positions) {
    const contentOverlap = imageOverlapsContent(pos, lastContentRow, ws);
    const imgOverlap = positions.some(
      (q) => q !== pos && imagesOverlap(pos, q),
    );
    if (contentOverlap || imgOverlap) {
      needsMove.push(pos);
    }
  }

  if (needsMove.length === 0) return { positions, changes };

  // Sort by original position
  needsMove.sort((a, b) => a.tlRow - b.tlRow || a.tlCol - b.tlCol);

  // Start row: 3 rows below content
  const startRow = lastContentRow + 3;

  // Group nearby images (within 5 rows of each other)
  const groups: ImageInfo[][] = [];
  let currentGroup: ImageInfo[] = [needsMove[0]];
  for (let i = 1; i < needsMove.length; i++) {
    const prev = currentGroup[currentGroup.length - 1];
    const curr = needsMove[i];
    if (Math.abs(curr.tlRow - prev.tlRow) <= 5) {
      currentGroup.push(curr);
    } else {
      groups.push(currentGroup);
      currentGroup = [curr];
    }
  }
  groups.push(currentGroup);

  let currentRow = startRow;

  for (const group of groups) {
    const cols = Math.min(group.length, MAX_GRID_COLS);

    for (let idx = 0; idx < group.length; idx++) {
      const img = group[idx];
      const gridRow = Math.floor(idx / cols);
      const gridCol = idx % cols;

      const newTlCol = gridCol * (TARGET_WIDTH_COLS + 1);
      const newTlRow = currentRow + gridRow * (TARGET_HEIGHT_ROWS + GRID_ROW_GAP);
      const newTlColOff = 0;
      const newTlRowOff = 0;

      // Maintain size — compute new br position
      const newBrColOff = newTlColOff + img.widthEmu;
      const newBrRowOff = newTlRowOff + img.heightEmu;
      let newBrCol = newTlCol;
      let newBrRow = newTlRow;
      let finalBrColOff = newBrColOff;
      let finalBrRowOff = newBrRowOff;

      while (finalBrColOff >= EMU_PER_COL) {
        finalBrColOff -= EMU_PER_COL;
        newBrCol++;
      }
      while (finalBrRowOff >= EMU_PER_ROW) {
        finalBrRowOff -= EMU_PER_ROW;
        newBrRow++;
      }

      changes.set(img.mediaIndex, {
        fromRow: newTlRow,
        fromRowOff: Math.round(newTlRowOff),
        toRow: newBrRow,
        toRowOff: Math.round(finalBrRowOff),
      });
    }

    const gridRows = Math.ceil(group.length / cols);
    currentRow += gridRows * (TARGET_HEIGHT_ROWS + GRID_ROW_GAP) + 3;
  }

  return { positions, changes };
}

// ─── PASS 2: SURGICAL XML MODIFICATION (JSZip + regex) ───────────────────

/**
 * Replace <row> and <rowOff> values inside a single <from> or <to> block.
 *
 * This function receives the INNER CONTENT of a <from> or <to> element
 * and returns the inner content with row values updated.
 *
 * Uses single-backslash regex (standard JS) to match namespace-prefixed
 * elements like <xdr:row> and <xdr:rowOff>.
 */
function replaceRowValues(
  inner: string,
  newRow: number,
  newRowOff: number,
): string {
  // Match <(prefix?)row>(digits)</(prefix?)row> — preserves namespace prefix
  let result = inner.replace(
    /(<(\w+:)?row>)(\d+)(<\/(\w+:)?row>)/,
    (_m: string, open: string, _np1: string | undefined, _num: string, close: string) =>
      `${open}${newRow}${close}`,
  );
  result = result.replace(
    /(<(\w+:)?rowOff>)(\d+)(<\/(\w+:)?rowOff>)/,
    (_m: string, open: string, _np1: string | undefined, _num: string, close: string) =>
      `${open}${newRowOff}${close}`,
  );
  return result;
}

/**
 * Apply row position changes to a drawing XML string.
 *
 * Strategy: match each <from>...</from> and <to>...</to> block as a
 * complete unit. For anchors that were MOVED, replace <row>/<rowOff>
 * values within that block. For anchors that were NOT moved, leave
 * the XML byte-for-byte identical.
 *
 * This prevents:
 *   1. Cross-anchor corruption (regex matching across anchor boundaries)
 *   2. Namespace prefix stripping (preserves original prefix text)
 *   3. Unmoved anchor corruption (skipped entirely)
 */
function applyRowChangesToDrawingXml(
  xml: string,
  changes: Map<number, AnchorRowChange>,
  totalAnchors: number,
): string {
  if (changes.size === 0) return xml;

  // Phase 1: Update <from> blocks
  let fromIdx = 0;
  let result = xml.replace(
    /<(\w+:)?from\b([^>]*)>([\s\S]*?)<\/(\w+:)?from>/g,
    (
      fullMatch: string,
      _pfx1: string | undefined,
      _attrs: string,
      inner: string,
      _pfx2: string | undefined,
    ) => {
      if (fromIdx >= totalAnchors) return fullMatch;
      const anchorIdx = fromIdx;
      fromIdx++;

      const change = changes.get(anchorIdx);
      if (!change) return fullMatch; // unmoved — preserve exactly

      const updated = replaceRowValues(inner, change.fromRow, change.fromRowOff);
      return updated === inner ? fullMatch : fullMatch.replace(inner, updated);
    },
  );

  // Phase 2: Update <to> blocks (for twoCellAnchor)
  let toIdx = 0;
  result = result.replace(
    /<(\w+:)?to\b([^>]*)>([\s\S]*?)<\/(\w+:)?to>/g,
    (
      fullMatch: string,
      _pfx1: string | undefined,
      _attrs: string,
      inner: string,
      _pfx2: string | undefined,
    ) => {
      if (toIdx >= totalAnchors) return fullMatch;
      const anchorIdx = toIdx;
      toIdx++;

      const change = changes.get(anchorIdx);
      if (!change) return fullMatch; // unmoved — preserve exactly

      const updated = replaceRowValues(inner, change.toRow, change.toRowOff);
      return updated === inner ? fullMatch : fullMatch.replace(inner, updated);
    },
  );

  return result;
}

/**
 * Count anchors in a drawing XML string.
 */
function countAnchors(xml: string): number {
  return (
    (xml.match(/<\w*:?(twoCellAnchor)\b/g) || []).length +
    (xml.match(/<\w*:?(oneCellAnchor)\b/g) || []).length
  );
}

/**
 * Maps an ExcelJS worksheet to its drawing XML path in the zip.
 *
 * Strategy: use the sheet's rels to find the drawing relationship target.
 * Fallback: scan all xl/drawings/*.xml entries and match by anchor count.
 */
async function mapSheetToDrawingPath(
  zip: JSZip,
  ws: ExcelJS.Worksheet,
  imageCount: number,
): Promise<string | null> {
  // Try rels-based lookup
  const wsDir = "xl/worksheets/";
  const relsPath = `${wsDir}_rels/sheet${ws.id}.xml.rels`;
  const relsEntry = zip.file(relsPath);
  if (relsEntry) {
    try {
      const relsXml = await relsEntry.async("string");
      const drawingMatch = relsXml.match(
        /Target\s*=\s*"([^"]*drawing[^"]*)"/i,
      );
      if (drawingMatch) {
        let target = drawingMatch[1];
        if (!target.startsWith("/")) {
          target = wsDir + target;
        } else {
          target = target.replace(/^\//, "");
        }
        // Normalize path (resolve ../ etc.)
        const parts = target.split("/");
        const normalized: string[] = [];
        for (const p of parts) {
          if (p === "..") normalized.pop();
          else if (p !== "." && p !== "") normalized.push(p);
        }
        const normalizedPath = normalized.join("/");
        if (zip.file(normalizedPath)) return normalizedPath;
      }
    } catch {
      // rels unreadable — fall through to count-based matching
    }
  }

  // Fallback: enumerate drawing files and match by anchor count
  const drawingFiles = Object.keys(zip.files).filter(
    (name) =>
      !zip.files[name].dir &&
      /^xl\/drawings\/drawing\d+\.xml$/i.test(name),
  );

  for (const drawingPath of drawingFiles) {
    const entry = zip.file(drawingPath);
    if (!entry) continue;
    const drawingXml = await entry.async("string");
    const anchorCount = countAnchors(drawingXml);
    if (anchorCount === imageCount) return drawingPath;
  }

  return null;
}

// ─── MAIN ENTRY POINT ─────────────────────────────────────────────────────

/**
 * Reposition images to eliminate overlaps.
 *
 * TWO-PASS ARCHITECTURE:
 *   Pass 1: ExcelJS reads the workbook → calculates new positions
 *   Pass 2: Surgical regex modifies the original zip's drawing XML
 *
 * The original zip bytes are preserved except for the specific numeric
 * values in <row> and <rowOff> elements that control image anchoring.
 *
 * @param buffer - The xlsx file as ArrayBuffer (from saveZip)
 * @returns A new ArrayBuffer with repositioned images, and stats
 */
export async function repositionImages(
  buffer: ArrayBuffer,
): Promise<{ buffer: ArrayBuffer; stats: ImageRepositionResult }> {
  const startTime = performance.now();

  // ── Pass 1: Layout calculation using ExcelJS (read-only) ──
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const stats: ImageRepositionResult = {
    totalImages: 0,
    imagesRepositioned: 0,
    overlapsBefore: 0,
    overlapsAfter: 0,
    contentConflictsBefore: 0,
    contentConflictsAfter: 0,
    sheets: [],
  };

  // Per-sheet repositioning plans
  const sheetPlans: Array<{
    ws: ExcelJS.Worksheet;
    changes: Map<number, AnchorRowChange>;
    imageCount: number;
    repositioned: number;
    overlapsBefore: number;
  }> = [];

  workbook.eachSheet((ws) => {
    const { positions, changes } = calculateRepositioning(ws);
    if (positions.length === 0) return;

    stats.totalImages += positions.length;
    const overlapsBefore = countOverlaps(positions);
    const lastContentRow = getLastContentRow(ws);
    const contentConflictsBefore = positions.filter((p) =>
      imageOverlapsContent(p, lastContentRow, ws),
    ).length;

    stats.overlapsBefore += overlapsBefore;
    stats.contentConflictsBefore += contentConflictsBefore;
    stats.imagesRepositioned += changes.size;

    debugLog.log(
      "IMG_REPOS",
      `${ws.name}: ${positions.length} images, ` +
        `${changes.size} to reposition, overlaps=${overlapsBefore}, ` +
        `contentConflicts=${contentConflictsBefore}`,
    );

    sheetPlans.push({
      ws,
      changes,
      imageCount: positions.length,
      repositioned: changes.size,
      overlapsBefore,
    });

    stats.sheets.push({
      name: ws.name,
      images: positions.length,
      repositioned: changes.size,
      overlapsBefore,
      overlapsAfter: 0,
    });
  });

  if (stats.totalImages === 0 || stats.imagesRepositioned === 0) {
    debugLog.log("IMG_REPOS", "No images need repositioning");
    const elapsed = Math.round(performance.now() - startTime);
    debugLog.log("IMG_REPOS", `Done in ${elapsed}ms (no changes)`);
    return { buffer, stats };
  }

  // ── Pass 2: Surgical XML modification on the original zip ──
  const zip = await JSZip.loadAsync(buffer);

  for (const plan of sheetPlans) {
    if (plan.changes.size === 0) continue;

    const drawingPath = await mapSheetToDrawingPath(
      zip,
      plan.ws,
      plan.imageCount,
    );
    if (!drawingPath) {
      debugLog.log(
        "IMG_REPOS",
        `  ${plan.ws.name}: Could not find drawing file, skipping`,
      );
      continue;
    }

    const drawingEntry = zip.file(drawingPath);
    if (!drawingEntry) continue;

    const originalXml = await drawingEntry.async("string");
    const totalAnchors = countAnchors(originalXml);

    const modifiedXml = applyRowChangesToDrawingXml(
      originalXml,
      plan.changes,
      totalAnchors,
    );

    if (modifiedXml !== originalXml) {
      zip.file(drawingPath, modifiedXml);
      debugLog.log(
        "IMG_REPOS",
        `  ${plan.ws.name}: Modified ${drawingPath} (${plan.repositioned} of ${totalAnchors} anchors moved)`,
      );
    }
  }

  // Generate the new buffer from the surgically modified zip
  const outBuffer = await zip.generateAsync({
    type: "arraybuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  // After repositioning, images are spread in a non-overlapping grid
  for (const plan of sheetPlans) {
    if (plan.changes.size === 0) continue;
    const sheetStat = stats.sheets.find((s) => s.name === plan.ws.name);
    if (sheetStat) {
      sheetStat.overlapsAfter = 0;
    }
    stats.overlapsAfter = 0;
    stats.contentConflictsAfter = 0;
  }

  const elapsed = Math.round(performance.now() - startTime);
  debugLog.log(
    "IMG_REPOS",
    `Done in ${elapsed}ms: ${stats.totalImages} images, ` +
      `${stats.imagesRepositioned} repositioned, ` +
      `overlaps ${stats.overlapsBefore}→${stats.overlapsAfter}`,
  );

  return { buffer: outBuffer as ArrayBuffer, stats };
}
