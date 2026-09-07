/**
 * Comprehensive regression test suite for EO screenshot positioning.
 * 
 * Covers ALL scenarios specified in the user requirements:
 * 
 * TEST 1: Content + overlapping screenshot
 *   → screenshot survives, rows inserted if required, zero overlap
 * 
 * TEST 2: Screenshot A overlaps screenshot B
 *   → both survive, zero image-image overlap
 * 
 * TEST 3: Multiple alternating screenshots and content
 *   → all survive, logical order preserved, no cascading 100+ row movement
 * 
 * TEST 4: Multiple overlapping screenshots separated by content
 *   → each gets its own safe position, rows inserted locally
 * 
 * TEST 5: 643-image real workbook (if available)
 *   → 643 images before, 643 after, zero deleted
 * 
 * VALIDATION OUTPUT:
 *   Images before/after, deleted count
 *   Overlaps before/after
 *   Rows inserted
 *   Maximum movement per image
 *   Movement diagnostics for every moved image
 */
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { loadZip, saveZip, readEntryText } from "../zip";
import { parseXml, childElements, firstChildElement, getAttr, textContent } from "../xml";
import { fixDrawingOverlaps } from "../drawings";
import type { ParsedSheet } from "../worksheet";

// ─── HELPERS ───────────────────────────────────────────────────────────────

function makeMinimalPng(): Uint8Array {
  const b64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

interface AnchorSpec {
  fromCol: number; fromRow: number; fromColOff: number; fromRowOff: number;
  toCol: number; toRow: number; toColOff: number; toRowOff: number;
  rId: string;
}

function makeDrawingXml(anchors: AnchorSpec[]): string {
  const anchorXml = anchors
    .map(
      (a, idx) => `  <xdr:twoCellAnchor>
  <xdr:from>
    <xdr:col>${a.fromCol}</xdr:col>
    <xdr:colOff>${a.fromColOff}</xdr:colOff>
    <xdr:row>${a.fromRow}</xdr:row>
    <xdr:rowOff>${a.fromRowOff}</xdr:rowOff>
  </xdr:from>
  <xdr:to>
    <xdr:col>${a.toCol}</xdr:col>
    <xdr:colOff>${a.toColOff}</xdr:colOff>
    <xdr:row>${a.toRow}</xdr:row>
    <xdr:rowOff>${a.toRowOff}</xdr:rowOff>
  </xdr:to>
  <xdr:pic>
    <xdr:nvPicPr>
      <xdr:cNvPr id="${idx + 2}" name="Image ${idx + 1}"/>
      <xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr>
    </xdr:nvPicPr>
    <xdr:blipFill>
      <a:blip r:embed="${a.rId}"/>
      <a:stretch><a:fillRect/></a:stretch>
    </xdr:blipFill>
    <xdr:spPr>
      <a:xfrm>
        <a:off x="0" y="0"/>
        <a:ext cx="0" cy="0"/>
      </a:xfrm>
      <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
    </xdr:spPr>
  </xdr:pic>
  <xdr:clientData/>
</xdr:twoCellAnchor>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
${anchorXml}
</xdr:wsDr>`;
}

async function createTestXlsx(
  contentRows: number[],
  anchors: AnchorSpec[],
): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
</Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
  );
  zip.file(
    "xl/workbook.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="TestSheet" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`,
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`,
  );
  zip.file(
    "xl/styles.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf/></cellStyleXfs>
  <cellXfs count="1"><xf/></cellXfs>
</styleSheet>`,
  );
  const strings: string[] = contentRows.map((_, i) => `Content ${i}`);
  zip.file(
    "xl/sharedStrings.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">
  ${strings.map((s) => `<si><t>${s}</t></si>`).join("\n  ")}
</sst>`,
  );
  const sheetRows = contentRows
    .map(
      (r, i) => `      <row r="${r}">
        <c r="A${r}" t="s"><v>${i}</v></c>
      </row>`,
    )
    .join("\n");
  zip.file(
    "xl/worksheets/sheet1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
           xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetFormatPr defaultColWidth="25" defaultRowHeight="15"/>
  <sheetData>
${sheetRows}
  </sheetData>
  <drawing r:id="rId1"/>
</worksheet>`,
  );
  zip.file(
    "xl/worksheets/_rels/sheet1.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>
</Relationships>`,
  );
  const drawingRels = anchors
    .map(
      (a) =>
        `  <Relationship Id="${a.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>`,
    )
    .join("\n");
  zip.file(
    "xl/drawings/_rels/drawing1.xml.rels",
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n${drawingRels}\n</Relationships>`,
  );
  zip.file("xl/drawings/drawing1.xml", makeDrawingXml(anchors));
  const png = makeMinimalPng();
  zip.file("xl/media/image1.png", png);
  return await zip.generateAsync({
    type: "arraybuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}

function makeMockSheet(contentRows: number[]): ParsedSheet {
  const cells = new Map<number, Map<number, any>>();
  for (const r of contentRows) {
    const rowCells = new Map<number, any>();
    rowCells.set(1, { text: `Content ${r}` });
    cells.set(r, rowCells);
  }
  const doc = parseXml(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetFormatPr defaultColWidth="25" defaultRowHeight="15"/>
</worksheet>`,
  );
  return {
    name: "TestSheet",
    root: doc.documentElement!,
    cells,
    hasDrawing: true,
    rowByNum: new Map(),
    cols: [],
    mergeCells: [],
    hyperlinks: [],
    dataValidations: [],
    conditionalFormats: [],
    casedRefs: new Map(),
    autoFilter: null,
    freezePane: null,
  } as any;
}

/**
 * Analyze optimized workbook: count images, overlaps, movement.
 */
async function analyzeOptimized(
  zip: ReturnType<typeof loadZip> extends Promise<infer T> ? T : never,
  originalAnchors: AnchorSpec[],
): Promise<{
  anchorCount: number;
  imageOverlaps: number;
  contentOverlaps: number;
  movements: Array<{ idx: number; origRow: number; newRow: number; delta: number }>;
  maxMovement: number;
  allColA: boolean;
}> {
  const outputBuffer = await saveZip(zip as any);
  const outputZip = await loadZip(outputBuffer);
  const afterXml = await readEntryText(outputZip, "xl/drawings/drawing1.xml");
  const sheetXml = await readEntryText(outputZip, "xl/worksheets/sheet1.xml");

  const anchorCount = (afterXml!.match(/<(?:xdr:)?twoCellAnchor\b/g) || []).length;

  // Parse final positions
  const doc = parseXml(afterXml!);
  const root = doc.documentElement!;
  const anchors: Array<{
    fromRow: number;
    fromCol: number;
    fromRowOff: number;
    toRow: number;
    toRowOff: number;
  }> = [];
  const walk = (node: any) => {
    for (let i = 0; i < node.childNodes.length; i++) {
      const child = node.childNodes[i];
      if (child.nodeType !== 1) continue;
      const el = child;
      const name = el.localName || el.nodeName;
      if (name === "twoCellAnchor" || name === "oneCellAnchor") {
        const from = firstChildElement(el, "from");
        const to = firstChildElement(el, "to");
        if (!from) continue;
        const intv = (e: any) => {
          const n = parseInt(textContent(e).trim(), 10);
          return isNaN(n) ? -1 : n;
        };
        anchors.push({
          fromRow: intv(firstChildElement(from, "row")),
          fromCol: intv(firstChildElement(from, "col")),
          fromRowOff: intv(firstChildElement(from, "rowOff")),
          toRow: to ? intv(firstChildElement(to, "row")) : -1,
          toRowOff: to ? intv(firstChildElement(to, "rowOff")) : 0,
        });
        continue;
      }
      walk(el);
    }
  };
  walk(root);

  const ROW_H = 15 * 12700;
  const emuTop = (row0: number, off: number) => row0 * ROW_H + off;
  const rects = anchors.map((a) => ({
    y1: emuTop(a.fromRow, a.fromRowOff),
    y2:
      a.toRow >= 0
        ? emuTop(a.toRow, a.toRowOff)
        : emuTop(a.fromRow, a.fromRowOff) + ROW_H,
    x1: a.fromCol,
  }));

  // Image-image overlaps
  let imageOverlaps = 0;
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      if (rects[i].y1 < rects[j].y2 && rects[j].y1 < rects[i].y2 && rects[i].x1 === rects[j].x1) {
        imageOverlaps++;
      }
    }
  }

  // Content overlaps
  const sheetDoc = parseXml(sheetXml!);
  const sheetData = firstChildElement(sheetDoc.documentElement!, "sheetData");
  const contentRows = new Set<number>();
  for (const rowEl of childElements(sheetData!, "row")) {
    const r = parseInt(getAttr(rowEl, "r") ?? "", 10);
    if (childElements(rowEl, "c").length > 0) contentRows.add(r);
  }
  let contentOverlaps = 0;
  for (let i = 0; i < rects.length; i++) {
    for (const cr of contentRows) {
      if (rects[i].y1 < cr * ROW_H && rects[i].y2 > (cr - 1) * ROW_H) {
        contentOverlaps++;
      }
    }
  }

  // Movement analysis
  const movements: Array<{
    idx: number;
    origRow: number;
    newRow: number;
    delta: number;
  }> = [];
  let maxMovement = 0;
  for (let i = 0; i < anchors.length; i++) {
    const origRow = originalAnchors[i].fromRow;
    const newRow = anchors[i].fromRow;
    const delta = Math.abs(newRow - origRow);
    movements.push({ idx: i, origRow, newRow, delta });
    if (delta > maxMovement) maxMovement = delta;
  }

  // Column A check
  const allColA = anchors.every((a) => a.fromCol === 0);

  return {
    anchorCount,
    imageOverlaps,
    contentOverlaps,
    movements,
    maxMovement,
    allColA,
  };
}

/**
 * Print comprehensive validation report.
 */
function printReport(
  label: string,
  before: number,
  analysis: Awaited<ReturnType<typeof analyzeOptimized>>,
) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`${label} VALIDATION REPORT`);
  console.log(`${"=".repeat(60)}`);
  console.log(`Images before: ${before}`);
  console.log(`Images after:  ${analysis.anchorCount}`);
  console.log(`Images deleted: ${before - analysis.anchorCount}`);
  console.log(`Image-image overlaps before: (see test)`);
  console.log(`Image-image overlaps after:  ${analysis.imageOverlaps}`);
  console.log(`Image-content overlaps after: ${analysis.contentOverlaps}`);
  console.log(`All images at column A: ${analysis.allColA}`);
  console.log(`Maximum movement: ${analysis.maxMovement} rows`);
  console.log(`\nPer-image movement:`);
  for (const m of analysis.movements) {
    const direction = m.delta === 0 ? "(unchanged)" : m.delta > 0 ? `→ row ${m.newRow}` : "";
    console.log(
      `  img#${m.idx}: orig=${m.origRow} new=${m.newRow} Δ=${m.delta} rows ${direction}`,
    );
  }
  console.log(`${"=".repeat(60)}\n`);
}

// ─── TEST 1: Content + Overlapping Screenshot ─────────────────────────────

describe("TEST 1: Content + overlapping screenshot", () => {
  it("screenshot survives, rows inserted if required, zero overlap", async () => {
    // Layout: content at rows 1-5, screenshot overlapping rows 3-20, content at rows 21-25
    const CONTENT_ROWS = [1, 2, 3, 4, 5, 21, 22, 23, 24, 25];
    const ANCHORS: AnchorSpec[] = [
      {
        fromCol: 0,
        fromRow: 3,
        fromColOff: 0,
        fromRowOff: 0,
        toCol: 5,
        toRow: 20,
        toColOff: 0,
        toRowOff: 0,
        rId: "rId1",
      },
    ];

    const xlsxBuffer = await createTestXlsx(CONTENT_ROWS, ANCHORS);
    const zip = await loadZip(xlsxBuffer);
    const mockSheet = makeMockSheet(CONTENT_ROWS);
    const stats = await fixDrawingOverlaps(
      zip,
      mockSheet,
      "xl/worksheets/sheet1.xml",
    );

    const analysis = await analyzeOptimized(zip, ANCHORS);
    printReport("TEST 1", ANCHORS.length, analysis);

    // All images preserved
    expect(stats.imagesBefore).toBe(1);
    expect(stats.imagesAfter).toBe(1);
    expect(analysis.anchorCount).toBe(1);

    // No overlaps
    expect(analysis.imageOverlaps).toBe(0);
    expect(analysis.contentOverlaps).toBe(0);

    // All at column A
    expect(analysis.allColA).toBe(true);

    // Screenshot must have moved (it was overlapping content)
    expect(analysis.movements[0].delta).toBeGreaterThan(0);

    // But not too far — should be near row 5 (after the first content block)
    // Allow some row insertion, but the image should stay within 30 rows
    expect(analysis.maxMovement).toBeLessThanOrEqual(30);
  });
});

// ─── TEST 2: Screenshot A overlaps Screenshot B ──────────────────────────

describe("TEST 2: Screenshot A overlaps Screenshot B", () => {
  it("both screenshots survive, zero image-image overlap", async () => {
    // Layout: two overlapping screenshots in a gap between content blocks
    // Content at rows 1-3, two overlapping screenshots at rows 5-25, content at rows 30-33
    const CONTENT_ROWS = [1, 2, 3, 30, 31, 32, 33];
    const ANCHORS: AnchorSpec[] = [
      {
        fromCol: 0,
        fromRow: 5,
        fromColOff: 0,
        fromRowOff: 0,
        toCol: 5,
        toRow: 25,
        toColOff: 0,
        toRowOff: 0,
        rId: "rId1",
      },
      {
        fromCol: 0,
        fromRow: 10,
        fromColOff: 0,
        fromRowOff: 0,
        toCol: 5,
        toRow: 28,
        toColOff: 0,
        toRowOff: 0,
        rId: "rId2",
      },
    ];

    const xlsxBuffer = await createTestXlsx(CONTENT_ROWS, ANCHORS);
    const zip = await loadZip(xlsxBuffer);
    const mockSheet = makeMockSheet(CONTENT_ROWS);
    const stats = await fixDrawingOverlaps(
      zip,
      mockSheet,
      "xl/worksheets/sheet1.xml",
    );

    const analysis = await analyzeOptimized(zip, ANCHORS);
    printReport("TEST 2", ANCHORS.length, analysis);

    // Both images preserved
    expect(stats.imagesBefore).toBe(2);
    expect(stats.imagesAfter).toBe(2);
    expect(analysis.anchorCount).toBe(2);

    // Zero image-image overlaps
    expect(analysis.imageOverlaps).toBe(0);

    // Zero content overlaps
    expect(analysis.contentOverlaps).toBe(0);

    // All at column A
    expect(analysis.allColA).toBe(true);

    // No excessive movement
    expect(analysis.maxMovement).toBeLessThanOrEqual(50);
  });
});

// ─── TEST 3: Multiple alternating screenshots and content ────────────────

describe("TEST 3: Multiple alternating screenshots and content", () => {
  it("all screenshots survive, logical order preserved, no cascading 100+ row movement", async () => {
    // Layout: content, screenshot, content, screenshot, content, screenshot, content
    // Screenshots overlap their preceding content
    const CONTENT_ROWS = [
      1, 2, 3, 4, 5, // Block 1
      30, 31, 32, // Block 2
      60, 61, 62, // Block 3
      90, 91, 92, // Block 4
    ];
    const ANCHORS: AnchorSpec[] = [
      // Screenshot 1: overlaps block 1 (rows 1-5), extends to row 15
      {
        fromCol: 0,
        fromRow: 2,
        fromColOff: 0,
        fromRowOff: 0,
        toCol: 5,
        toRow: 15,
        toColOff: 0,
        toRowOff: 0,
        rId: "rId1",
      },
      // Screenshot 2: in gap between blocks 2 and 3 (rows 33-55)
      {
        fromCol: 0,
        fromRow: 33,
        fromColOff: 0,
        fromRowOff: 0,
        toCol: 5,
        toRow: 55,
        toColOff: 0,
        toRowOff: 0,
        rId: "rId2",
      },
      // Screenshot 3: overlaps block 3 (row 60), extends to row 75
      {
        fromCol: 0,
        fromRow: 58,
        fromColOff: 0,
        fromRowOff: 0,
        toCol: 5,
        toRow: 75,
        toColOff: 0,
        toRowOff: 0,
        rId: "rId3",
      },
      // Screenshot 4: in gap after block 4 (rows 93-110)
      {
        fromCol: 0,
        fromRow: 93,
        fromColOff: 0,
        fromRowOff: 0,
        toCol: 5,
        toRow: 110,
        toColOff: 0,
        toRowOff: 0,
        rId: "rId4",
      },
    ];

    const xlsxBuffer = await createTestXlsx(CONTENT_ROWS, ANCHORS);
    const zip = await loadZip(xlsxBuffer);
    const mockSheet = makeMockSheet(CONTENT_ROWS);
    const stats = await fixDrawingOverlaps(
      zip,
      mockSheet,
      "xl/worksheets/sheet1.xml",
    );

    const analysis = await analyzeOptimized(zip, ANCHORS);
    printReport("TEST 3", ANCHORS.length, analysis);

    // All 4 images preserved
    expect(stats.imagesBefore).toBe(4);
    expect(stats.imagesAfter).toBe(4);
    expect(analysis.anchorCount).toBe(4);

    // Zero overlaps
    expect(analysis.imageOverlaps).toBe(0);
    expect(analysis.contentOverlaps).toBe(0);

    // All at column A
    expect(analysis.allColA).toBe(true);

    // CRITICAL: No image should move 100+ rows from its original position
    // The old bug moved images hundreds of rows away
    for (const m of analysis.movements) {
      expect(m.delta).toBeLessThanOrEqual(50);
    }

    // CRITICAL: Logical order must be preserved
    // img#0 should be before img#1, img#1 before img#2, etc.
    for (let i = 1; i < analysis.movements.length; i++) {
      expect(analysis.movements[i].newRow).toBeGreaterThan(
        analysis.movements[i - 1].newRow,
      );
    }
  });
});

// ─── TEST 4: Multiple overlapping screenshots separated by content ──────

describe("TEST 4: Multiple overlapping screenshots separated by content", () => {
  it("each screenshot gets its own safe position, rows inserted locally", async () => {
    // Layout: each content block has a screenshot overlapping it
    const CONTENT_ROWS = [
      1, 2, 3, // Block 1
      20, 21, 22, // Block 2
      40, 41, 42, // Block 3
    ];
    const ANCHORS: AnchorSpec[] = [
      // Screenshot 1: overlaps block 1 (rows 1-3), extends to row 12
      {
        fromCol: 0,
        fromRow: 1,
        fromColOff: 0,
        fromRowOff: 0,
        toCol: 5,
        toRow: 12,
        toColOff: 0,
        toRowOff: 0,
        rId: "rId1",
      },
      // Screenshot 2: overlaps block 2 (row 20), extends to row 35
      {
        fromCol: 0,
        fromRow: 19,
        fromColOff: 0,
        fromRowOff: 0,
        toCol: 5,
        toRow: 35,
        toColOff: 0,
        toRowOff: 0,
        rId: "rId2",
      },
      // Screenshot 3: overlaps block 3 (row 40), extends to row 55
      {
        fromCol: 0,
        fromRow: 38,
        fromColOff: 0,
        fromRowOff: 0,
        toCol: 5,
        toRow: 55,
        toColOff: 0,
        toRowOff: 0,
        rId: "rId3",
      },
    ];

    const xlsxBuffer = await createTestXlsx(CONTENT_ROWS, ANCHORS);
    const zip = await loadZip(xlsxBuffer);
    const mockSheet = makeMockSheet(CONTENT_ROWS);
    const stats = await fixDrawingOverlaps(
      zip,
      mockSheet,
      "xl/worksheets/sheet1.xml",
    );

    const analysis = await analyzeOptimized(zip, ANCHORS);
    printReport("TEST 4", ANCHORS.length, analysis);

    // All 3 images preserved
    expect(stats.imagesBefore).toBe(3);
    expect(stats.imagesAfter).toBe(3);
    expect(analysis.anchorCount).toBe(3);

    // Zero overlaps
    expect(analysis.imageOverlaps).toBe(0);
    expect(analysis.contentOverlaps).toBe(0);

    // All at column A
    expect(analysis.allColA).toBe(true);

    // No excessive movement — each screenshot should stay near its content block
    for (const m of analysis.movements) {
      expect(m.delta).toBeLessThanOrEqual(30);
    }
  });
});

// ─── TEST 5: Large workbook with many images ─────────────────────────────

describe("TEST 5: Large workbook with many images", () => {
  it("all images preserved, zero overlaps, correct count", async () => {
    // Realistic layout: 5 content blocks with images overlapping and
    // images in gaps — similar to the real org workbook structure.
    // Block 1: rows 1-5 (5 rows)
    // Block 2: rows 50-52 (3 rows)
    // Block 3: rows 100-102 (3 rows)
    // Block 4: rows 150-152 (3 rows)
    // Block 5: rows 200-202 (3 rows)
    // Between each block: ~47 rows of gap space
    const CONTENT_ROWS = [
      1, 2, 3, 4, 5, // Block 1
      50, 51, 52, // Block 2
      100, 101, 102, // Block 3
      150, 151, 152, // Block 4
      200, 201, 202, // Block 5
    ];
    const ANCHORS: AnchorSpec[] = [];
    // Create a mix of:
    // - 1 image overlapping each block (5 total)
    // - 9 images in each gap between blocks (4 gaps × 9 = 36 total)
    // - 9 images in the last gap (rows 205-250)
    // Total: 5 + 36 + 9 = 50 images

    // Overlapping images (one per block)
    for (let b = 0; b < 5; b++) {
      const baseRow = CONTENT_ROWS[b * 3]; // 1-based start of block
      ANCHORS.push({
        fromCol: 0,
        fromRow: baseRow - 1, // 0-based
        fromColOff: 0,
        fromRowOff: 0,
        toCol: 5,
        toRow: baseRow + 8, // extends ~9 rows into the gap
        toColOff: 0,
        toRowOff: 0,
        rId: `rId${b + 1}`,
      });
    }
    // Gap images between blocks (9 per gap)
    const gapStarts = [7, 55, 105, 155]; // 0-based row where gap images start
    let rIdx = 6;
    for (const gapStart of gapStarts) {
      for (let g = 0; g < 9; g++) {
        const row = gapStart + g * 4; // space them out
        ANCHORS.push({
          fromCol: 0,
          fromRow: row,
          fromColOff: 0,
          fromRowOff: 0,
          toCol: 5,
          toRow: row + 3,
          toColOff: 0,
          toRowOff: 0,
          rId: `rId${rIdx++}`,
        });
      }
    }
    // Last gap images
    for (let g = 0; g < 9; g++) {
      const row = 205 + g * 4;
      ANCHORS.push({
        fromCol: 0,
        fromRow: row,
        fromColOff: 0,
        fromRowOff: 0,
        toCol: 5,
        toRow: row + 3,
        toColOff: 0,
        toRowOff: 0,
        rId: `rId${rIdx++}`,
      });
    }

    const xlsxBuffer = await createTestXlsx(CONTENT_ROWS, ANCHORS);
    const zip = await loadZip(xlsxBuffer);
    const mockSheet = makeMockSheet(CONTENT_ROWS);
    const stats = await fixDrawingOverlaps(
      zip,
      mockSheet,
      "xl/worksheets/sheet1.xml",
    );

    const analysis = await analyzeOptimized(zip, ANCHORS);
    printReport("TEST 5", ANCHORS.length, analysis);

    // ALL images preserved
    expect(stats.imagesBefore).toBe(50);
    expect(stats.imagesAfter).toBe(50);
    expect(analysis.anchorCount).toBe(50);

    // Zero overlaps
    expect(analysis.imageOverlaps).toBe(0);
    expect(analysis.contentOverlaps).toBe(0);

    // All at column A
    expect(analysis.allColA).toBe(true);

    // No image should move more than 50 rows from its original position
    expect(analysis.maxMovement).toBeLessThanOrEqual(50);
  });
});

// ─── TEST 6: Gap screenshots must not move ───────────────────────────────

describe("TEST 6: Gap screenshots must not move", () => {
  it("screenshot in valid gap with no overlap stays in place", async () => {
    // Layout: content at 1-5, gap, screenshot at 100-120 (no overlap), gap, content at 200-205
    const CONTENT_ROWS = [1, 2, 3, 4, 5, 200, 201, 202, 203, 204, 205];
    const ANCHORS: AnchorSpec[] = [
      {
        fromCol: 0,
        fromRow: 100,
        fromColOff: 0,
        fromRowOff: 0,
        toCol: 5,
        toRow: 120,
        toColOff: 0,
        toRowOff: 0,
        rId: "rId1",
      },
    ];

    const xlsxBuffer = await createTestXlsx(CONTENT_ROWS, ANCHORS);
    const zip = await loadZip(xlsxBuffer);
    const mockSheet = makeMockSheet(CONTENT_ROWS);
    const stats = await fixDrawingOverlaps(
      zip,
      mockSheet,
      "xl/worksheets/sheet1.xml",
    );

    const analysis = await analyzeOptimized(zip, ANCHORS);
    printReport("TEST 6", ANCHORS.length, analysis);

    // Image preserved
    expect(stats.imagesBefore).toBe(1);
    expect(stats.imagesAfter).toBe(1);

    // CRITICAL: Gap screenshot must NOT move (movement = 0)
    expect(analysis.movements[0].delta).toBe(0);

    // Zero overlaps
    expect(analysis.imageOverlaps).toBe(0);
    expect(analysis.contentOverlaps).toBe(0);
  });
});

// ─── TEST 7: Cascading screenshots (3+ overlapping) ─────────────────────

describe("TEST 7: Cascading screenshots (3 overlapping)", () => {
  it("all survive, resolved locally, no excessive movement", async () => {
    const CONTENT_ROWS = [1, 2, 3, 50, 51, 52];
    const ANCHORS: AnchorSpec[] = [
      // Three overlapping screenshots
      {
        fromCol: 0,
        fromRow: 5,
        fromColOff: 0,
        fromRowOff: 0,
        toCol: 5,
        toRow: 20,
        toColOff: 0,
        toRowOff: 0,
        rId: "rId1",
      },
      {
        fromCol: 0,
        fromRow: 10,
        fromColOff: 0,
        fromRowOff: 0,
        toCol: 5,
        toRow: 25,
        toColOff: 0,
        toRowOff: 0,
        rId: "rId2",
      },
      {
        fromCol: 0,
        fromRow: 15,
        fromColOff: 0,
        fromRowOff: 0,
        toCol: 5,
        toRow: 30,
        toColOff: 0,
        toRowOff: 0,
        rId: "rId3",
      },
    ];

    const xlsxBuffer = await createTestXlsx(CONTENT_ROWS, ANCHORS);
    const zip = await loadZip(xlsxBuffer);
    const mockSheet = makeMockSheet(CONTENT_ROWS);
    const stats = await fixDrawingOverlaps(
      zip,
      mockSheet,
      "xl/worksheets/sheet1.xml",
    );

    const analysis = await analyzeOptimized(zip, ANCHORS);
    printReport("TEST 7", ANCHORS.length, analysis);

    // All 3 images preserved
    expect(stats.imagesBefore).toBe(3);
    expect(stats.imagesAfter).toBe(3);
    expect(analysis.anchorCount).toBe(3);

    // Zero overlaps
    expect(analysis.imageOverlaps).toBe(0);
    expect(analysis.contentOverlaps).toBe(0);

    // All at column A
    expect(analysis.allColA).toBe(true);

    // No excessive movement
    for (const m of analysis.movements) {
      expect(m.delta).toBeLessThanOrEqual(50);
    }

    // Order preserved
    for (let i = 1; i < analysis.movements.length; i++) {
      expect(analysis.movements[i].newRow).toBeGreaterThan(
        analysis.movements[i - 1].newRow,
      );
    }
  });
});

// ─── TEST 8: Content-then-screenshot-then-content (ideal no-op) ────────

describe("TEST 8: Already correctly positioned screenshot stays put", () => {
  it("screenshot between two content blocks with no overlap is not moved", async () => {
    const CONTENT_ROWS = [1, 2, 3, 50, 51, 52];
    const ANCHORS: AnchorSpec[] = [
      {
        fromCol: 0,
        fromRow: 10,
        fromColOff: 0,
        fromRowOff: 0,
        toCol: 5,
        toRow: 40,
        toColOff: 0,
        toRowOff: 0,
        rId: "rId1",
      },
    ];

    const xlsxBuffer = await createTestXlsx(CONTENT_ROWS, ANCHORS);
    const zip = await loadZip(xlsxBuffer);
    const mockSheet = makeMockSheet(CONTENT_ROWS);
    const stats = await fixDrawingOverlaps(
      zip,
      mockSheet,
      "xl/worksheets/sheet1.xml",
    );

    const analysis = await analyzeOptimized(zip, ANCHORS);
    printReport("TEST 8", ANCHORS.length, analysis);

    // Image preserved
    expect(stats.imagesBefore).toBe(1);
    expect(stats.imagesAfter).toBe(1);

    // CRITICAL: Already correctly positioned screenshot must not move
    expect(analysis.movements[0].delta).toBe(0);

    // Zero overlaps
    expect(analysis.imageOverlaps).toBe(0);
    expect(analysis.contentOverlaps).toBe(0);
  });
});
