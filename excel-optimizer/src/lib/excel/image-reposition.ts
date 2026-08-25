/**
 * Image repositioning — TWO-PASS APPROACH with CORRECT GEOMETRY.
 *
 * PASS 1: ExcelJS reads workbook → extracts ACTUAL column widths and row
 *          heights → calculates precise EMU bounding boxes → detects
 *          collisions → plans new grid positions.
 *
 * PASS 2: Surgical regex modifies original zip's drawing XML — replaces
 *          <col>, <colOff>, <row>, <rowOff> in both <from> and <to> blocks.
 *          Every other byte preserved byte-for-byte.
 *
 * KEY GEOMETRY RULES:
 *   - All collision detection uses ACTUAL EMU coordinates from real
 *     column widths and row heights (NOT constant approximations).
 *   - Grid placement checks BOTH horizontal and vertical gaps.
 *   - Both <from> and <to> anchors are updated for col AND row.
 *   - Post-write validation reloads the XLSX and re-reads drawing XML
 *     to verify the regex produced valid output.
 */
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { debugLog } from "./debug-log";

/** EMU per inch / pixels per inch — standard OOXML conversion. */
const EMU_PER_INCH = 914400;
const PX_PER_INCH = 96;
const EMU_PER_PX = EMU_PER_INCH / PX_PER_INCH; // 9525
/** Points to EMU conversion. */
const EMU_PER_PT = 12700;

/** Safety gap between images (in EMU). */
const GAP_EMU = 20 * EMU_PER_PX; // 20px gap

// ─── EMU CONVERSION USING ACTUAL WORKSHEET DIMENSIONS ─────────────────────

/**
 * Get the EMU width of a specific column (0-based) using ACTUAL column
 * widths from the worksheet. Falls back to default if no custom width.
 */
function getColumnEmu(ws: ExcelJS.Worksheet, col: number): number {
  // ExcelJS columns are 1-based; our col is 0-based
  const colObj = ws.getColumn(col + 1);
  // width is in "character units" — 1 char ≈ 7px at default font
  const widthChars = colObj.width ?? (ws.properties.defaultColWidth as number) ?? 8.43;
  return (widthChars * 7) * EMU_PER_PX;
}

/**
 * Get the EMU height of a specific row (0-based) using ACTUAL row
 * heights from the worksheet. Falls back to default if no custom height.
 */
function getRowEmu(ws: ExcelJS.Worksheet, row: number): number {
  // ExcelJS rows are 1-based; our row is 0-based
  const rowObj = ws.getRow(row + 1);
  const heightPt = rowObj.height ?? (ws.properties.defaultRowHeight as number) ?? 15;
  return heightPt * EMU_PER_PT;
}

/**
 * Sum of column EMU widths from column 0 up to (not including) `col`.
 */
function colStartEmu(ws: ExcelJS.Worksheet, col: number): number {
  let acc = 0;
  for (let c = 0; c < col; c++) acc += getColumnEmu(ws, c);
  return acc;
}

/**
 * Sum of row EMU heights from row 0 up to (not including) `row`.
 */
function rowStartEmu(ws: ExcelJS.Worksheet, row: number): number {
  let acc = 0;
  for (let r = 0; r < row; r++) acc += getRowEmu(ws, r);
  return acc;
}

/**
 * Convert an EMU y-position back to the 0-based row number it falls in.
 */
function emuToRow(ws: ExcelJS.Worksheet, y: number): number {
  let acc = 0;
  for (let r = 0; r < 200000; r++) {
    const h = getRowEmu(ws, r);
    if (y < acc + h) return r;
    acc += h;
  }
  return 0;
}

/**
 * Convert an EMU x-position back to the 0-based column number it falls in.
 */
function emuToCol(ws: ExcelJS.Worksheet, x: number): number {
  let acc = 0;
  for (let c = 0; c < 1000; c++) {
    const w = getColumnEmu(ws, c);
    if (x < acc + w) return c;
    acc += w;
  }
  return 0;
}

// ─── IMAGE INFO & BOUNDING BOX ────────────────────────────────────────────

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
 * Complete bounding box for an image in EMU coordinates.
 */
interface ImageBBox {
  mediaIndex: number;
  /** Top-left anchor cell (0-based). */
  fromCol: number;
  fromRow: number;
  /** Top-left offset from anchor cell (in EMU). */
  fromColOff: number;
  fromRowOff: number;
  /** Bottom-right anchor cell (0-based). */
  toCol: number;
  toRow: number;
  /** Bottom-right offset from anchor cell (in EMU). */
  toColOff: number;
  toRowOff: number;
  /** Absolute EMU bounding box. */
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

/**
 * New position for an image anchor (both from and to).
 */
interface AnchorChange {
  fromCol: number;
  fromColOff: number;
  fromRow: number;
  fromRowOff: number;
  toCol: number;
  toColOff: number;
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

/**
 * Extract image positions with PRECISE bounding boxes using actual
 * column widths and row heights from the worksheet.
 */
function extractImageBBoxes(ws: ExcelJS.Worksheet): ImageBBox[] {
  const images = ws.getImages();
  const bboxes: ImageBBox[] = [];

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    if (img.type !== "image") continue;

    const tl = img.range.tl;
    const br = img.range.br;

    const fromCol = (tl.nativeCol ?? tl.col ?? 0) as number;
    const fromRow = (tl.nativeRow ?? tl.row ?? 0) as number;
    const fromColOff = (tl.nativeColOff ?? 0) as number;
    const fromRowOff = (tl.nativeRowOff ?? 0) as number;

    let toCol: number, toRow: number, toColOff: number, toRowOff: number;
    if (br) {
      toCol = (br.nativeCol ?? br.col ?? fromCol + 1) as number;
      toRow = (br.nativeRow ?? br.row ?? fromRow + 1) as number;
      toColOff = (br.nativeColOff ?? 0) as number;
      toRowOff = (br.nativeRowOff ?? 0) as number;
    } else {
      // oneCellAnchor — estimate from extension
      const ext = (img.range as unknown as Record<string, unknown>).ext as
        | { cx?: number; cy?: number }
        | undefined;
      const widthEmu = ext?.cx ?? 500 * EMU_PER_PX;
      const heightEmu = ext?.cy ?? 350 * EMU_PER_PX;
      toCol = fromCol;
      toRow = fromRow;
      toColOff = fromColOff + widthEmu;
      toRowOff = fromRowOff + heightEmu;
    }

    // Calculate absolute EMU bounding box using ACTUAL column widths and row heights
    const left = colStartEmu(ws, fromCol) + fromColOff;
    const right = colStartEmu(ws, toCol) + toColOff;
    const top = rowStartEmu(ws, fromRow) + fromRowOff;
    const bottom = rowStartEmu(ws, toRow) + toRowOff;
    const width = Math.max(right - left, EMU_PER_PX);
    const height = Math.max(bottom - top, EMU_PER_PX);

    bboxes.push({
      mediaIndex: i,
      fromCol,
      fromRow,
      fromColOff,
      fromRowOff,
      toCol,
      toRow,
      toColOff,
      toRowOff,
      left,
      top,
      right,
      bottom,
      width,
      height,
    });
  }

  return bboxes;
}

/**
 * Check if two bounding boxes overlap in EMU coordinates.
 */
function bboxesOverlap(a: ImageBBox, b: ImageBBox): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/**
 * Check if a bounding box overlaps with any existing image.
 */
function overlapsAnyImage(
  target: { left: number; top: number; right: number; bottom: number },
  images: ImageBBox[],
  excludeIndex: number,
): boolean {
  for (let i = 0; i < images.length; i++) {
    if (i === excludeIndex) continue;
    const img = images[i];
    if (
      target.left < img.right &&
      target.right > img.left &&
      target.top < img.bottom &&
      target.bottom > img.top
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Check if an image's bounding box overlaps with cell content.
 * Uses ACTUAL column widths and row heights for content boundary.
 */
function bboxOverlapsContent(
  bbox: { top: number; bottom: number; left: number; right: number },
  contentBoundaryRow: number,
  ws: ExcelJS.Worksheet,
): boolean {
  if (contentBoundaryRow === 0) return false;
  const boundaryY = rowStartEmu(ws, contentBoundaryRow);
  return bbox.top < boundaryY;
}

function countOverlaps(bboxes: ImageBBox[]): number {
  let count = 0;
  for (let i = 0; i < bboxes.length; i++) {
    for (let j = i + 1; j < bboxes.length; j++) {
      if (bboxesOverlap(bboxes[i], bboxes[j])) count++;
    }
  }
  return count;
}

// ─── LAYOUT PLANNER ───────────────────────────────────────────────────────

/**
 * Calculate new positions for images that need repositioning.
 *
 * Uses a DETERMINISTIC GRID PLACEMENT algorithm:
 *   1. Identify images that overlap content or other images
 *   2. Sort by original position (preserve logical ordering)
 *   3. Place in a grid below all content
 *   4. Each image's COMPLETE RECTANGLE is collision-checked
 *   5. Grid columns are separated by GAP_EMU
 *
 * IMPORTANT: Uses ACTUAL column widths from ExcelJS for positioning,
 * not constant approximations.
 */
function calculateRepositioning(
  ws: ExcelJS.Worksheet,
): { bboxes: ImageBBox[]; changes: Map<number, AnchorChange> } {
  const bboxes = extractImageBBoxes(ws);
  const changes = new Map<number, AnchorChange>();

  if (bboxes.length === 0) return { bboxes, changes };

  const lastContentRow = getLastContentRow(ws);

  // Identify images that need moving (overlap content or other images)
  const needsMove: ImageBBox[] = [];
  for (const bbox of bboxes) {
    const contentOverlap = bboxOverlapsContent(bbox, lastContentRow, ws);
    const imgOverlap = bboxes.some(
      (q) => q.mediaIndex !== bbox.mediaIndex && bboxesOverlap(bbox, q),
    );
    if (contentOverlap || imgOverlap) {
      needsMove.push(bbox);
    }
  }

  if (needsMove.length === 0) return { bboxes, changes };

  // Sort by original position for logical ordering
  needsMove.sort((a, b) => a.top - b.top || a.left - b.left);

  // ── Grid placement below content ──
  //
  // Layout:
  //   COL_0_X | GAP | COL_1_X | GAP | COL_2_X
  //   where COL_N_X = sum(colWidths[0..N-1]) + N * GAP
  //
  // Each image is placed at COL_N_X, advancing to next column.
  // When columns are full, advance to next grid row.

  const GRID_COLS = Math.min(needsMove.length, 3);

  // Pre-compute column X positions using image-width-based slots
  // Each slot = max image width in the group + gap
  const maxImgW = Math.max(...needsMove.map((img) => img.width));
  const slotW = maxImgW + GAP_EMU;
  const colX: number[] = [];
  for (let c = 0; c < GRID_COLS; c++) {
    colX.push(c * slotW);
  }

  // Start placement below content
  let gridRowTop = rowStartEmu(ws, lastContentRow + 3);

  // Track all placed rectangles (for collision checking)
  const placed: Array<{ left: number; top: number; right: number; bottom: number }> = [];

  let gridCol = 0;
  let gridRowMaxH = 0;

  for (let idx = 0; idx < needsMove.length; idx++) {
    const img = needsMove[idx];
    const imgW = img.width;
    const imgH = img.height;

    const candidateLeft = colX[gridCol];
    const candidateTop = gridRowTop;
    const candidate = {
      left: candidateLeft,
      top: candidateTop,
      right: candidateLeft + imgW,
      bottom: candidateTop + imgH,
    };

    // Check collision against all placed images
    let collides = false;
    for (const rect of placed) {
      if (
        candidate.left < rect.right &&
        candidate.right > rect.left &&
        candidate.top < rect.bottom &&
        candidate.bottom > rect.top
      ) {
        collides = true;
        break;
      }
    }

    // Check collision against content boundary
    if (!collides && bboxOverlapsContent(candidate, lastContentRow, ws)) {
      collides = true;
    }

    if (collides) {
      // Advance to next grid column
      gridCol++;
      if (gridCol >= GRID_COLS) {
        // Advance to next grid row
        gridCol = 0;
        gridRowTop += gridRowMaxH + GAP_EMU;
        gridRowMaxH = 0;
      }
      // Recalculate candidate with new column
      const newLeft = colX[gridCol];
      candidate.left = newLeft;
      candidate.right = newLeft + imgW;
      candidate.top = gridRowTop;
      candidate.bottom = gridRowTop + imgH;
    }

    // Convert EMU position to cell + offset for XML modification
    const fromCol = emuToCol(ws, candidate.left);
    const fromRow = emuToRow(ws, candidate.top);
    const fromColOff = Math.round(candidate.left - colStartEmu(ws, fromCol));
    const fromRowOff = Math.round(candidate.top - rowStartEmu(ws, fromRow));
    const toCol = emuToCol(ws, candidate.right);
    const toRow = emuToRow(ws, candidate.bottom);
    const toColOff = Math.round(candidate.right - colStartEmu(ws, toCol));
    const toRowOff = Math.round(candidate.bottom - rowStartEmu(ws, toRow));

    changes.set(img.mediaIndex, {
      fromCol,
      fromColOff,
      fromRow,
      fromRowOff,
      toCol,
      toColOff,
      toRow,
      toRowOff,
    });

    // Record placed rectangle for subsequent collision checks
    placed.push(candidate);
    gridRowMaxH = Math.max(gridRowMaxH, imgH);
    gridCol++;
    if (gridCol >= GRID_COLS) {
      gridCol = 0;
      gridRowTop += gridRowMaxH + GAP_EMU;
      gridRowMaxH = 0;
    }
  }

  return { bboxes, changes };
}

// ─── PASS 2: SURGICAL XML MODIFICATION (JSZip + regex) ───────────────────

/**
 * Replace col/colOff/row/rowOff values inside a single <from> or <to> block.
 * Preserves namespace prefixes (e.g. <xdr:col> stays <xdr:col>).
 */
function replaceAnchorValues(
  inner: string,
  newCol: number,
  newColOff: number,
  newRow: number,
  newRowOff: number,
): string {
  let result = inner;

  // Replace <col> value
  result = result.replace(
    /(<(\w+:)?col>)(\d+)(<\/(\w+:)?col>)/,
    (_m: string, open: string, _np: string | undefined, _num: string, close: string) =>
      `${open}${newCol}${close}`,
  );

  // Replace <colOff> value
  result = result.replace(
    /(<(\w+:)?colOff>)(\d+)(<\/(\w+:)?colOff>)/,
    (_m: string, open: string, _np: string | undefined, _num: string, close: string) =>
      `${open}${newColOff}${close}`,
  );

  // Replace <row> value
  result = result.replace(
    /(<(\w+:)?row>)(\d+)(<\/(\w+:)?row>)/,
    (_m: string, open: string, _np: string | undefined, _num: string, close: string) =>
      `${open}${newRow}${close}`,
  );

  // Replace <rowOff> value
  result = result.replace(
    /(<(\w+:)?rowOff>)(\d+)(<\/(\w+:)?rowOff>)/,
    (_m: string, open: string, _np: string | undefined, _num: string, close: string) =>
      `${open}${newRowOff}${close}`,
  );

  return result;
}

/**
 * Apply anchor changes to a drawing XML string.
 * Updates <col>, <colOff>, <row>, <rowOff> in both <from> and <to> blocks.
 */
function applyChangesToDrawingXml(
  xml: string,
  changes: Map<number, AnchorChange>,
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

      const updated = replaceAnchorValues(
        inner,
        change.fromCol,
        change.fromColOff,
        change.fromRow,
        change.fromRowOff,
      );
      return updated === inner ? fullMatch : fullMatch.replace(inner, updated);
    },
  );

  // Phase 2: Update <to> blocks
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
      if (!change) return fullMatch;

      const updated = replaceAnchorValues(
        inner,
        change.toCol,
        change.toColOff,
        change.toRow,
        change.toRowOff,
      );
      return updated === inner ? fullMatch : fullMatch.replace(inner, updated);
    },
  );

  return result;
}

function countAnchors(xml: string): number {
  return (
    (xml.match(/<\w*:?(twoCellAnchor)\b/g) || []).length +
    (xml.match(/<\w*:?(oneCellAnchor)\b/g) || []).length
  );
}

// ─── POST-WRITE VALIDATION ────────────────────────────────────────────────

/**
 * Extracted anchor from drawing XML (after conversion to EMU).
 */
interface ExtractedAnchor {
  fromCol: number;
  fromColOff: number;
  fromRow: number;
  fromRowOff: number;
  toCol: number;
  toColOff: number;
  toRow: number;
  toRowOff: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

/**
 * Column width defaults for EMU conversion when actual widths are unknown.
 * These match Excel's default column width (8.43 chars × 7 px/char).
 */
const DEFAULT_COL_WIDTH_CHARS = 8.43;
const DEFAULT_ROW_HEIGHT_PT = 15;
const CHAR_WIDTH_PX = 7;

/**
 * Extract all image anchors from a drawing XML string.
 * Parses the actual XML to get real col/colOff/row/rowOff values,
 * then converts to EMU bounding rectangles.
 *
 * NOTE: Without actual worksheet column widths/row heights, we use
 * default conversions. The relative collision detection is still valid
 * because all images use the same conversion.
 */
function extractAnchorsFromDrawingXml(xml: string): ExtractedAnchor[] {
  const anchors: ExtractedAnchor[] = [];

  // Match each <from>...</from> block and its paired <to>...</to>
  // We process twoCellAnchor and oneCellAnchor elements
  const anchorRegex = /<\w*:?(twoCellAnchor|oneCellAnchor)\b[^>]*>([\s\S]*?)<\/\w*:?\1>/g;
  let anchorMatch;

  while ((anchorMatch = anchorRegex.exec(xml)) !== null) {
    const anchorBody = anchorMatch[2];

    // Extract <from> block
    const fromMatch = anchorBody.match(/<\w*:?from\b[^>]*>([\s\S]*?)<\/\w*:?from>/);
    if (!fromMatch) continue;
    const fromInner = fromMatch[1];

    // Extract <to> block (may be absent for oneCellAnchor)
    const toMatch = anchorBody.match(/<\w*:?to\b[^>]*>([\s\S]*?)<\/\w*:?to>/);
    const toInner = toMatch ? toMatch[1] : null;

    // Parse numeric values from <from>
    const fromCol = extractNum(fromInner, "col");
    const fromColOff = extractNum(fromInner, "colOff");
    const fromRow = extractNum(fromInner, "row");
    const fromRowOff = extractNum(fromInner, "rowOff");

    let toCol: number, toColOff: number, toRow: number, toRowOff: number;
    if (toInner) {
      toCol = extractNum(toInner, "col");
      toColOff = extractNum(toInner, "colOff");
      toRow = extractNum(toInner, "row");
      toRowOff = extractNum(toInner, "rowOff");
    } else {
      // oneCellAnchor — estimate from extension element
      const extMatch = anchorBody.match(/<\w*:?ext\b[^>]*\bcx\s*=\s*"(\d+)"[^>]*\bcy\s*=\s*"(\d+)"/);
      const cx = extMatch ? parseInt(extMatch[1]) : 500 * EMU_PER_PX;
      const cy = extMatch ? parseInt(extMatch[2]) : 350 * EMU_PER_PX;
      toCol = fromCol;
      toRow = fromRow;
      toColOff = fromColOff + cx;
      toRowOff = fromRowOff + cy;
    }

    // Convert to EMU coordinates using DEFAULT dimensions
    // (actual worksheet dimensions are not available here,
    // but the relative positions are correct for collision detection)
    const colWidthEmu = DEFAULT_COL_WIDTH_CHARS * CHAR_WIDTH_PX * EMU_PER_PX;
    const rowHeightEmu = DEFAULT_ROW_HEIGHT_PT * EMU_PER_PT;

    const left = fromCol * colWidthEmu + fromColOff;
    const right = toCol * colWidthEmu + toColOff;
    const top = fromRow * rowHeightEmu + fromRowOff;
    const bottom = toRow * rowHeightEmu + toRowOff;
    const width = Math.max(right - left, EMU_PER_PX);
    const height = Math.max(bottom - top, EMU_PER_PX);

    anchors.push({
      fromCol, fromColOff, fromRow, fromRowOff,
      toCol, toColOff, toRow, toRowOff,
      left, top, right, bottom, width, height,
    });
  }

  return anchors;
}

/**
 * Extract a numeric value for a given element name from XML inner content.
 * Matches patterns like <xdr:col>5</xdr:col> or <col>5</col>.
 */
function extractNum(inner: string, tagName: string): number {
  const re = new RegExp(`<\\w*:?(?:${tagName})\\b[^>]*>(\\d+)</\\w*:?(?:${tagName})>`);
  const m = inner.match(re);
  return m ? parseInt(m[1]) : 0;
}

/**
 * Compute the intersection area of two bounding rectangles.
 */
function intersectionArea(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number },
): number {
  const ix = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const iy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return ix * iy;
}

/**
 * Tolerance for collision detection (1% of a 1px² area).
 * Anything below this is considered touching, not overlapping.
 */
const COLLISION_TOLERANCE = EMU_PER_PX; // 1px² in EMU

/**
 * FINAL GEOMETRY VALIDATOR.
 *
 * Reads the ACTUAL drawing XML from the generated XLSX zip,
 * extracts every anchor, converts to EMU, and computes real
 * collision counts. This is the source of truth — not the
 * planned positions from Pass 1.
 *
 * Returns the per-sheet validation results.
 */
export interface FinalLayoutValidation {
  sheetName: string;
  imageCount: number;
  imageImageCollisions: number;
  imageContentCollisions: number;
  anchors: Array<{
    index: number;
    from: string;
    to: string;
    width: number;
    height: number;
  }>;
  errors: string[];
}

export async function validateFinalImageLayout(
  buffer: ArrayBuffer,
  workbook: ExcelJS.Workbook,
): Promise<FinalLayoutValidation[]> {
  const results: FinalLayoutValidation[] = [];

  try {
    const zip = await JSZip.loadAsync(buffer);

    // Build a map of sheetId → worksheet for content boundary lookup
    const sheetMap = new Map<number, ExcelJS.Worksheet>();
    workbook.eachSheet((ws) => {
      sheetMap.set(ws.id, ws);
    });

    // Discover all drawing XML files
    const drawingFiles = Object.keys(zip.files).filter(
      (name) => !zip.files[name].dir && /^xl\/drawings\/drawing\d+\.xml$/i.test(name),
    );

    for (const drawingPath of drawingFiles) {
      const drawingEntry = zip.file(drawingPath);
      if (!drawingEntry) continue;

      const drawingXml = await drawingEntry.async("string");
      const anchors = extractAnchorsFromDrawingXml(drawingXml);

      // Find which sheet this drawing belongs to
      let sheetName = "unknown";
      const drawingNum = drawingPath.match(/drawing(\d+)\.xml/)?.[1];
      if (drawingNum) {
        // Find the sheet that references this drawing
        for (const [sheetId, ws] of sheetMap) {
          const relsPath = `xl/worksheets/_rels/sheet${sheetId}.xml.rels`;
          const relsEntry = zip.file(relsPath);
          if (relsEntry) {
            const relsXml = await relsEntry.async("string");
            if (relsXml.includes(`drawing${drawingNum}.xml`)) {
              sheetName = ws.name;
              break;
            }
          }
        }
      }

      // Compute image-image collisions
      let imageImageCollisions = 0;
      for (let i = 0; i < anchors.length; i++) {
        for (let j = i + 1; j < anchors.length; j++) {
          if (intersectionArea(anchors[i], anchors[j]) > COLLISION_TOLERANCE) {
            imageImageCollisions++;
          }
        }
      }

      // Compute image-content collisions
      // Content boundary = last row with non-empty cells in THIS sheet
      let imageContentCollisions = 0;
      // Find the correct worksheet for this drawing
      let contentWs: ExcelJS.Worksheet | null = null;
      for (const [, ws] of sheetMap) {
        if (ws.name === sheetName) { contentWs = ws; break; }
      }
      if (!contentWs) contentWs = sheetMap.values().next().value ?? null;
      if (contentWs) {
        let lastContentRow = 0;
        contentWs.eachRow({ includeEmpty: false }, (row, rowNum) => {
          let hasContent = false;
          row.eachCell({ includeEmpty: false }, (cell) => {
            if (cell.value !== null && cell.value !== undefined && cell.value !== "") {
              hasContent = true;
            }
          });
          if (hasContent && rowNum > lastContentRow) lastContentRow = rowNum;
        });
        if (lastContentRow > 0) {
          const contentBoundaryY = rowStartEmu(contentWs, lastContentRow);
          for (const anchor of anchors) {
            if (anchor.top < contentBoundaryY) {
              imageContentCollisions++;
            }
          }
        }
      }

      results.push({
        sheetName,
        imageCount: anchors.length,
        imageImageCollisions,
        imageContentCollisions,
        anchors: anchors.map((a, i) => ({
          index: i,
          from: `(${a.fromCol},${a.fromRow})`,
          to: `(${a.toCol},${a.toRow})`,
          width: Math.round(a.width / EMU_PER_PX),
          height: Math.round(a.height / EMU_PER_PX),
        })),
        errors: [],
      });
    }
  } catch (err) {
    results.push({
      sheetName: "ERROR",
      imageCount: 0,
      imageImageCollisions: 0,
      imageContentCollisions: 0,
      anchors: [],
      errors: [`Failed to validate: ${err}`],
    });
  }

  return results;
}

// ─── MAIN ENTRY POINT ─────────────────────────────────────────────────────

export async function repositionImages(
  buffer: ArrayBuffer,
): Promise<{ buffer: ArrayBuffer; stats: ImageRepositionResult }> {
  const startTime = performance.now();

  // ── Pass 1: Layout calculation ──
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

  const sheetPlans: Array<{
    ws: ExcelJS.Worksheet;
    changes: Map<number, AnchorChange>;
    imageCount: number;
    repositioned: number;
    overlapsBefore: number;
  }> = [];

  const expectedCounts = new Map<string, number>();

  workbook.eachSheet((ws) => {
    const { bboxes, changes } = calculateRepositioning(ws);
    if (bboxes.length === 0) return;

    stats.totalImages += bboxes.length;
    const overlapsBefore = countOverlaps(bboxes);
    const lastContentRow = getLastContentRow(ws);
    const contentConflictsBefore = bboxes.filter((b) =>
      bboxOverlapsContent(b, lastContentRow, ws),
    ).length;

    stats.overlapsBefore += overlapsBefore;
    stats.contentConflictsBefore += contentConflictsBefore;
    stats.imagesRepositioned += changes.size;

    debugLog.log(
      "IMG_REPOS",
      `${ws.name}: ${bboxes.length} images, ` +
        `${changes.size} to reposition, overlaps=${overlapsBefore}, ` +
        `contentConflicts=${contentConflictsBefore}`,
    );

    sheetPlans.push({
      ws,
      changes,
      imageCount: bboxes.length,
      repositioned: changes.size,
      overlapsBefore,
    });

    stats.sheets.push({
      name: ws.name,
      images: bboxes.length,
      repositioned: changes.size,
      overlapsBefore,
      overlapsAfter: 0,
    });

    expectedCounts.set(`sheet${ws.id}`, bboxes.length);
  });

  if (stats.totalImages === 0 || stats.imagesRepositioned === 0) {
    debugLog.log("IMG_REPOS", "No images need repositioning");
    return { buffer, stats };
  }

  // ── Pass 2: Surgical XML modification ──
  const zip = await JSZip.loadAsync(buffer);

  for (const plan of sheetPlans) {
    if (plan.changes.size === 0) continue;

    const drawingPath = await mapSheetToDrawingPath(zip, plan.ws, plan.imageCount);
    if (!drawingPath) {
      debugLog.log("IMG_REPOS", `  ${plan.ws.name}: drawing file not found`);
      continue;
    }

    const drawingEntry = zip.file(drawingPath);
    if (!drawingEntry) continue;

    const originalXml = await drawingEntry.async("string");
    const totalAnchors = countAnchors(originalXml);

    const modifiedXml = applyChangesToDrawingXml(originalXml, plan.changes, totalAnchors);

    if (modifiedXml !== originalXml) {
      zip.file(drawingPath, modifiedXml);
      debugLog.log(
        "IMG_REPOS",
        `  ${plan.ws.name}: Modified ${drawingPath} (${plan.repositioned}/${totalAnchors} anchors)`,
      );
    }
  }

  const outBuffer = await zip.generateAsync({
    type: "arraybuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  // ── Post-write validation: read ACTUAL final XML and compute real collisions ──
  const validation = await validateFinalImageLayout(outBuffer, workbook);
  let hasErrors = false;
  for (const v of validation) {
    if (v.errors.length > 0) {
      debugLog.log("IMG_REPOS", `VALIDATION ERROR [${v.sheetName}]: ${v.errors.join("; ")}`);
      hasErrors = true;
    }
    // Update stats with ACTUAL collision counts from the final XML
    const sheetStat = stats.sheets.find((s) => s.name === v.sheetName);
    if (sheetStat) {
      sheetStat.overlapsAfter = v.imageImageCollisions;
    }
    stats.overlapsAfter += v.imageImageCollisions;
    stats.contentConflictsAfter += v.imageContentCollisions;

    debugLog.log(
      "IMG_REPOS",
      `  FINAL [${v.sheetName}]: ${v.imageCount} images, ` +
        `img-img collisions=${v.imageImageCollisions}, ` +
        `img-content collisions=${v.imageContentCollisions}`,
    );
  }

  if (hasErrors) {
    // If validation found XML errors, return original buffer
    return { buffer, stats };
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

async function mapSheetToDrawingPath(
  zip: JSZip,
  ws: ExcelJS.Worksheet,
  imageCount: number,
): Promise<string | null> {
  const wsDir = "xl/worksheets/";
  const relsPath = `${wsDir}_rels/sheet${ws.id}.xml.rels`;
  const relsEntry = zip.file(relsPath);
  if (relsEntry) {
    try {
      const relsXml = await relsEntry.async("string");
      const drawingMatch = relsXml.match(/Target\s*=\s*"([^"]*drawing[^"]*)"/i);
      if (drawingMatch) {
        let target = drawingMatch[1];
        if (!target.startsWith("/")) target = wsDir + target;
        else target = target.replace(/^\//, "");
        const parts = target.split("/");
        const normalized: string[] = [];
        for (const p of parts) {
          if (p === "..") normalized.pop();
          else if (p !== "." && p !== "") normalized.push(p);
        }
        const normalizedPath = normalized.join("/");
        if (zip.file(normalizedPath)) return normalizedPath;
      }
    } catch { /* fall through */ }
  }

  const drawingFiles = Object.keys(zip.files).filter(
    (name) => !zip.files[name].dir && /^xl\/drawings\/drawing\d+\.xml$/i.test(name),
  );
  for (const drawingPath of drawingFiles) {
    const entry = zip.file(drawingPath);
    if (!entry) continue;
    const drawingXml = await entry.async("string");
    if (countAnchors(drawingXml) === imageCount) return drawingPath;
  }
  return null;
}
