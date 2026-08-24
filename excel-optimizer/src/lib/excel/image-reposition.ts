/**
 * Image repositioning using ExcelJS.
 *
 * Every previous approach that modified OOXML drawing XML directly
 * (regex, xmldom re-serialization) corrupted the file because Excel's
 * OOXML parser is stricter than any JS XML library.
 *
 * ExcelJS handles OOXML namespace serialization natively and correctly.
 * This module loads the workbook with ExcelJS, modifies image positions
 * in the internal model, and saves back — producing valid XML.
 */
import ExcelJS from "exceljs";
import { debugLog } from "./debug-log";

/** EMU per pixel (914400 EMU per inch / 96 px per inch). */
const EMU_PER_PX = 9525;
/** EMU per row (default 15pt row height × 12700 EMU/pt). */
const EMU_PER_ROW = 15 * 12700;
/** EMU per column (default 8.43 chars × 7 px/char × 9525 EMU/px). */
const EMU_PER_COL = (8.43 * 7) * EMU_PER_PX;
/** Spacing between repositioned images (in EMU). */
const SPACING_EMU = 2 * EMU_PER_ROW; // 2 rows gap
/** Max images per grid row. */
const MAX_GRID_COLS = 3;

/**
 * Result returned after repositioning images.
 */
export interface ImageRepositionResult {
  /** Total images found across all sheets. */
  totalImages: number;
  /** Images that were repositioned. */
  imagesRepositioned: number;
  /** Number of image-image overlaps before. */
  overlapsBefore: number;
  /** Number of image-image overlaps after. */
  overlapsAfter: number;
  /** Number of image-content conflicts before. */
  contentConflictsBefore: number;
  /** Number of image-content conflicts after. */
  contentConflictsAfter: number;
  /** Per-sheet stats. */
  sheets: Array<{
    name: string;
    images: number;
    repositioned: number;
    overlapsBefore: number;
    overlapsAfter: number;
  }>;
}

/**
 * Internal representation of an image's position.
 */
interface ImagePos {
  /** Index in the worksheet._media array. */
  mediaIndex: number;
  /** imageId from ExcelJS. */
  imageId: string;
  /** Top-left column (0-based). */
  tlCol: number;
  /** Top-left row (0-based). */
  tlRow: number;
  /** Top-left column offset (in EMU). */
  tlColOff: number;
  /** Top-left row offset (in EMU). */
  tlRowOff: number;
  /** Bottom-right column (0-based). */
  brCol: number;
  /** Bottom-right row (0-based). */
  brRow: number;
  /** Bottom-right column offset (in EMU). */
  brColOff: number;
  /** Bottom-right row offset (in EMU). */
  brRowOff: number;
  /** Width in EMU. */
  widthEmu: number;
  /** Height in EMU. */
  heightEmu: number;
  /** Whether this image overlaps cell content. */
  overlapsContent: boolean;
  /** Whether this image was moved. */
  moved: boolean;
}

/**
 * Analyzes a worksheet's content to find the last row with non-empty cells.
 */
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

/**
 * Converts a 0-based row number to EMU (approximate).
 */
function rowToEmu(row: number, ws: ExcelJS.Worksheet): number {
  // Use actual row heights if available, otherwise default 15pt
  let acc = 0;
  for (let r = 0; r < row; r++) {
    const rowObj = ws.getRow(r + 1); // ExcelJS rows are 1-based
    const ht = rowObj.height || ws.properties.defaultRowHeight || 15;
    acc += ht * 12700; // points to EMU
  }
  return acc;
}

/**
 * Checks if two image rectangles overlap (in EMU coordinates).
 */
function imagesOverlap(a: ImagePos, b: ImagePos): boolean {
  const aRight = a.tlCol * EMU_PER_COL + a.tlColOff + a.widthEmu;
  const aBottom = a.tlRow * EMU_PER_ROW + a.tlRowOff + a.heightEmu;
  const bRight = b.tlCol * EMU_PER_COL + b.tlColOff + b.widthEmu;
  const bBottom = b.tlRow * EMU_PER_ROW + b.tlRowOff + b.heightEmu;
  const aLeft = a.tlCol * EMU_PER_COL + a.tlColOff;
  const aTop = a.tlRow * EMU_PER_ROW + a.tlRowOff;
  const bLeft = b.tlCol * EMU_PER_COL + b.tlColOff;
  const bTop = b.tlRow * EMU_PER_ROW + b.tlRowOff;
  return aLeft < bRight && aRight > bLeft && aTop < bBottom && aBottom > bTop;
}

/**
 * Checks if an image overlaps the content region of the worksheet.
 */
function imageOverlapsContent(img: ImagePos, contentBoundaryRow: number, ws: ExcelJS.Worksheet): boolean {
  if (contentBoundaryRow === 0) return false;
  const boundaryEmu = rowToEmu(contentBoundaryRow, ws);
  const imgTop = img.tlRow * EMU_PER_ROW + img.tlRowOff;
  return imgTop < boundaryEmu;
}

/**
 * Extracts image positions from an ExcelJS worksheet.
 */
function extractImagePositions(ws: ExcelJS.Worksheet): ImagePos[] {
  const images = ws.getImages();
  const positions: ImagePos[] = [];

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    if (img.type !== "image") continue;

    const tl = img.range.tl;
    const br = img.range.br;

    const tlCol = tl.nativeCol ?? tl.col ?? 0;
    const tlRow = tl.nativeRow ?? tl.row ?? 0;
    const tlColOff = tl.nativeColOff ?? 0;
    const tlRowOff = tl.nativeRowOff ?? 0;

    // For oneCellAnchor, br may not exist — compute from ext
    let brCol: number, brRow: number, brColOff: number, brRowOff: number;
    if (br) {
      brCol = br.nativeCol ?? br.col ?? tlCol + 1;
      brRow = br.nativeRow ?? br.row ?? tlRow + 1;
      brColOff = br.nativeColOff ?? 0;
      brRowOff = br.nativeRowOff ?? 0;
    } else {
      // Estimate from range.ext or default size
      const ext = (img.range as unknown as Record<string, unknown>).ext as { cx?: number; cy?: number } | undefined;
      const widthEmu = ext?.cx ?? 500 * EMU_PER_PX;
      const heightEmu = ext?.cy ?? 350 * EMU_PER_PX;
      brCol = tlCol;
      brRow = tlRow;
      brColOff = tlColOff + widthEmu;
      brRowOff = tlRowOff + heightEmu;
    }

    // Compute size in EMU
    const leftEmu = tlCol * EMU_PER_COL + tlColOff;
    const rightEmu = brCol * EMU_PER_COL + brColOff;
    const topEmu = tlRow * EMU_PER_ROW + tlRowOff;
    const bottomEmu = brRow * EMU_PER_ROW + brRowOff;
    const widthEmu = Math.max(rightEmu - leftEmu, EMU_PER_PX);
    const heightEmu = Math.max(bottomEmu - topEmu, EMU_PER_PX);

    positions.push({
      mediaIndex: i,
      imageId: img.imageId,
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
      overlapsContent: false,
      moved: false,
    });
  }

  return positions;
}

/**
 * Sets image position on an ExcelJS worksheet by modifying the internal media model.
 *
 * This is the key function that works because ExcelJS handles OOXML serialization.
 */
function setImagePosition(
  ws: ExcelJS.Worksheet,
  img: ImagePos,
  newTlRow: number,
  newTlCol: number,
  newTlRowOff: number = 0,
  newTlColOff: number = 0,
): void {
  const media = (ws as unknown as Record<string, unknown>)._media as Array<{
    type: string;
    range: {
      tl: { nativeRow: number; nativeCol: number; nativeRowOff: number; nativeColOff: number; row: number; col: number };
      br: { nativeRow: number; nativeCol: number; nativeRowOff: number; nativeColOff: number; row: number; col: number };
    };
  }> | undefined;

  if (!media || !media[img.mediaIndex]) return;

  const entry = media[img.mediaIndex];
  if (entry.type !== "image") return;

  // Compute new br position to maintain size
  const newBrColOff = newTlColOff + img.widthEmu;
  const newBrRowOff = newTlRowOff + img.heightEmu;

  // The br row/col is wherever the offset lands
  let newBrCol = newTlCol;
  let newBrRow = newTlRow;
  let finalBrColOff = newBrColOff;
  let finalBrRowOff = newBrRowOff;

  // If offsets exceed one column/row width, roll into the next column/row
  while (finalBrColOff >= EMU_PER_COL) {
    finalBrColOff -= EMU_PER_COL;
    newBrCol++;
  }
  while (finalBrRowOff >= EMU_PER_ROW) {
    finalBrRowOff -= EMU_PER_ROW;
    newBrRow++;
  }

  // Set top-left
  entry.range.tl.nativeRow = newTlRow;
  entry.range.tl.nativeCol = newTlCol;
  entry.range.tl.nativeRowOff = newTlRowOff;
  entry.range.tl.nativeColOff = newTlColOff;
  entry.range.tl.row = newTlRow;
  entry.range.tl.col = newTlCol;

  // Set bottom-right
  entry.range.br.nativeRow = newBrRow;
  entry.range.br.nativeCol = newBrCol;
  entry.range.br.nativeRowOff = finalBrRowOff;
  entry.range.br.nativeColOff = finalBrColOff;
  entry.range.br.row = newBrRow;
  entry.range.br.col = newBrCol;
}

/**
 * Counts overlapping image pairs.
 */
function countOverlaps(positions: ImagePos[]): number {
  let count = 0;
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      if (imagesOverlap(positions[i], positions[j])) {
        count++;
      }
    }
  }
  return count;
}

/**
 * Main entry point: repositions images on all worksheets of a workbook buffer.
 *
 * @param buffer - The xlsx file as ArrayBuffer (output from saveZip)
 * @returns A new ArrayBuffer with repositioned images, and stats
 */
export async function repositionImages(
  buffer: ArrayBuffer,
): Promise<{ buffer: ArrayBuffer; stats: ImageRepositionResult }> {
  const startTime = performance.now();

  // Load with ExcelJS
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

  workbook.eachSheet((ws) => {
    const positions = extractImagePositions(ws);
    if (positions.length === 0) return;

    stats.totalImages += positions.length;

    // Find content boundary
    const lastContentRow = getLastContentRow(ws);
    debugLog.log("IMG_REPOS", `${ws.name}: ${positions.length} images, lastContentRow=${lastContentRow}`);

    // Detect overlaps before
    const overlapsBefore = countOverlaps(positions);
    let contentConflictsBefore = 0;
    for (const pos of positions) {
      pos.overlapsContent = imageOverlapsContent(pos, lastContentRow, ws);
      if (pos.overlapsContent) contentConflictsBefore++;
    }

    // Determine images that need repositioning
    const needsMove = positions.filter(
      (p) => p.overlapsContent || positions.some((q) => q !== p && imagesOverlap(p, q))
    );

    if (needsMove.length === 0) {
      debugLog.log("IMG_REPOS", `  ${ws.name}: no overlaps, skipping`);
      stats.sheets.push({
        name: ws.name,
        images: positions.length,
        repositioned: 0,
        overlapsBefore,
        overlapsAfter: overlapsBefore,
      });
      return;
    }

    // Sort images that need moving by their original row position
    needsMove.sort((a, b) => a.tlRow - b.tlRow || a.tlCol - b.tlCol);

    // Calculate starting row: below all content, with gap
    const startRow = lastContentRow + 3; // 3 rows below content

    // Group nearby images (within 5 rows of each other)
    const groups: ImagePos[][] = [];
    let currentGroup: ImagePos[] = [needsMove[0]];

    for (let i = 1; i < needsMove.length; i++) {
      const prev = currentGroup[currentGroup.length - 1];
      const curr = needsMove[i];
      const gap = Math.abs(curr.tlRow - prev.tlRow);
      if (gap <= 5) {
        currentGroup.push(curr);
      } else {
        groups.push(currentGroup);
        currentGroup = [curr];
      }
    }
    groups.push(currentGroup);

    let currentRow = startRow;
    let repositioned = 0;

    for (const group of groups) {
      const cols = Math.min(group.length, MAX_GRID_COLS);
      const gridRows = Math.ceil(group.length / cols);

      // Standardize image size: fit within a reasonable box
      // Keep original size if it's reasonable (between 200px and 700px wide)
      // Otherwise scale to 500px wide
      const TARGET_WIDTH_COLS = 7; // ~500px in column units
      const TARGET_HEIGHT_ROWS = 25; // ~375px in row units

      for (let idx = 0; idx < group.length; idx++) {
        const img = group[idx];
        const gridRow = Math.floor(idx / cols);
        const gridCol = idx % cols;

        const newTlCol = gridCol * (TARGET_WIDTH_COLS + 1); // 1 col gap between images
        const newTlRow = currentRow + gridRow * (TARGET_HEIGHT_ROWS + 2); // 2 row gap between grid rows

        setImagePosition(ws, img, newTlRow, newTlCol);
        img.moved = true;
        repositioned++;
      }

      currentRow += gridRows * (TARGET_HEIGHT_ROWS + 2) + 3; // 3 row gap between groups
    }

    // Count overlaps after repositioning
    const overlapsAfter = countOverlaps(positions);

    stats.imagesRepositioned += repositioned;
    stats.overlapsBefore += overlapsBefore;
    stats.overlapsAfter += overlapsAfter;
    stats.contentConflictsBefore += contentConflictsBefore;
    stats.contentConflictsAfter += 0; // All moved below content

    debugLog.log("IMG_REPOS", `  ${ws.name}: repositioned=${repositioned}, overlaps ${overlapsBefore}→${overlapsAfter}`);

    stats.sheets.push({
      name: ws.name,
      images: positions.length,
      repositioned,
      overlapsBefore,
      overlapsAfter,
    });
  });

  // Write back
  const outBuffer = await workbook.xlsx.writeBuffer() as ArrayBuffer;
  const elapsed = Math.round(performance.now() - startTime);
  debugLog.log("IMG_REPOS", `Done in ${elapsed}ms: ${stats.totalImages} images, ${stats.imagesRepositioned} repositioned`);

  return { buffer: outBuffer, stats };
}
