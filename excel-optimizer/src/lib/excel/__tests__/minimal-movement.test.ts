/**
 * Test: Minimum Movement Principle
 *
 * When a screenshot overlaps content, it should be moved the MINIMUM
 * distance required to resolve the overlap, not hundreds of rows away.
 *
 * This test reproduces the exact issue the user reported:
 * - Content at rows 1-6 (metadata)
 * - Content at rows 7-9 (actual content)
 * - Screenshot overlapping rows 7-20 (overlapping content)
 * - Next content at rows 21-40
 *
 * Expected result:
 * - Content at rows 1-9 preserved
 * - Screenshot moved to row 10 (minimum movement)
 * - Next content at rows 21-40 (unchanged)
 *
 * NOT expected:
 * - Screenshot moved to row 100+
 */
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { loadZip, saveZip, readEntryText } from "../zip";
import { parseXml, childElements, firstChildElement, getAttr, textContent } from "../xml";
import { fixDrawingOverlaps } from "../drawings";
import type { ParsedSheet } from "../worksheet";

function makeMinimalPng(): Uint8Array {
  const b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";
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
    .map((r, i) => `      <row r="${r}">
        <c r="A${r}" t="s"><v>${i}</v></c>
      </row>`)
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
    .map((a) => `  <Relationship Id="${a.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>`)
    .join("\n");
  zip.file(
    "xl/drawings/_rels/drawing1.xml.rels",
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n${drawingRels}\n</Relationships>`,
  );
  zip.file("xl/drawings/drawing1.xml", makeDrawingXml(anchors));
  const png = makeMinimalPng();
  zip.file("xl/media/image1.png", png);
  return await zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
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

describe("Minimum Movement Principle", () => {
  it("TEST 1: Screenshot overlapping content should move minimum distance", async () => {
    // Scenario:
    // Rows 1-6: Test case metadata
    // Rows 7-9: Content
    // Rows 7-20: Screenshot overlapping content (overlaps rows 7-9)
    // Rows 21-40: Next content
    //
    // Expected:
    // - Content at rows 1-9 preserved
    // - Screenshot moved to row 10 (minimum movement to avoid overlap)
    // - Next content at rows 21-40 (unchanged)
    //
    // NOT expected:
    // - Screenshot moved to row 100+

    const CONTENT_ROWS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40];
    
    // Screenshot: from row 7 to row 20 (overlapping content at rows 7-9)
    const ANCHORS: AnchorSpec[] = [
      { fromCol: 0, fromRow: 7, fromColOff: 0, fromRowOff: 0, toCol: 5, toRow: 20, toColOff: 0, toRowOff: 0, rId: "rId1" },
    ];

    const xlsxBuffer = await createTestXlsx(CONTENT_ROWS, ANCHORS);
    const zip = await loadZip(xlsxBuffer);
    const mockSheet = makeMockSheet(CONTENT_ROWS);
    const stats = await fixDrawingOverlaps(zip, mockSheet, "xl/worksheets/sheet1.xml");

    console.log("TEST 1 STATS:", JSON.stringify({
      imagesBefore: stats.imagesBefore,
      imagesAfter: stats.imagesAfter,
      overlapsBefore: stats.overlapsBefore,
      overlapsAfter: stats.overlapsAfter,
      contentConflictsBefore: stats.contentConflictsBefore,
      contentConflictsAfter: stats.contentConflictsAfter,
      repositioned: stats.imagesRepositioned,
    }));

    // Verify: All images preserved
    expect(stats.imagesBefore).toBe(1);
    expect(stats.imagesAfter).toBe(1);

    // Verify: No overlaps after optimization
    expect(stats.overlapsAfter).toBe(0);
    expect(stats.contentConflictsAfter).toBe(0);

    // Verify: Image moved minimum distance
    // Original: from row 7 to row 20
    // Expected: moved to row 10 (just after content at row 9)
    // Maximum allowed: row 20 (should not move past the original end)
    const outputBuffer = await saveZip(zip);
    const outputZip = await loadZip(outputBuffer);
    const afterXml = await readEntryText(outputZip, "xl/drawings/drawing1.xml");
    const sheetXml = await readEntryText(outputZip, "xl/worksheets/sheet1.xml");

    // Parse final position
    const doc = parseXml(afterXml!);
    const root = doc.documentElement!;
    const anchors: Array<{ fromRow: number; fromRowOff: number; toRow: number; toRowOff: number }> = [];
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
          const intv = (e: any) => { const n = parseInt(textContent(e).trim(), 10); return isNaN(n) ? -1 : n; };
          anchors.push({
            fromRow: intv(firstChildElement(from, "row")),
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

    console.log("TEST 1 ANCHORS:", anchors.map((a) => `from=${a.fromRow} to=${a.toRow}`).join(", "));

    // The screenshot should be moved to row 10 (minimum movement)
    // NOT to row 100+ (excessive movement)
    const imageFromRow = anchors[0].fromRow;
    console.log(`TEST 1: Image moved from row 7 to row ${imageFromRow}`);

    // Image should be at row 10 (just after content at row 9)
    // Allow some tolerance but it should NOT be far away
    expect(imageFromRow).toBeGreaterThanOrEqual(10); // After content at row 9
    expect(imageFromRow).toBeLessThanOrEqual(15); // Should not be far away

    // Verify: All images at column A
    const cols = (afterXml!.match(/<xdr:from>[\s\S]*?<xdr:col>(\d+)<\/xdr:col>/g) || []).map((m) => parseInt(m.match(/<xdr:col>(\d+)/)![1], 10));
    for (const c of cols) expect(c).toBe(0);

    // Verify: No image-content overlap
    const ROW_H = 15 * 12700;
    const emuTop = (row0: number, off: number) => row0 * ROW_H + off;
    const rects = anchors.map((a) => ({
      y1: emuTop(a.fromRow, a.fromRowOff),
      y2: a.toRow >= 0 ? emuTop(a.toRow, a.toRowOff) : emuTop(a.fromRow, a.fromRowOff) + ROW_H,
    }));

    const sheetDoc = parseXml(sheetXml!);
    const sheetData = firstChildElement(sheetDoc.documentElement!, "sheetData");
    const contentRowsSet = new Set<number>();
    for (const rowEl of childElements(sheetData!, "row")) {
      const r = parseInt(getAttr(rowEl, "r") ?? "", 10);
      if (childElements(rowEl, "c").length > 0) contentRowsSet.add(r);
    }
    let contentOverlaps = 0;
    for (let i = 0; i < rects.length; i++) {
      for (const cr of contentRowsSet) {
        if (rects[i].y1 < cr * ROW_H && rects[i].y2 > (cr - 1) * ROW_H) {
          contentOverlaps++;
          console.log(`  CONTENT OVERLAP img#${i} rows ${Math.floor(rects[i].y1 / ROW_H)}-${Math.ceil(rects[i].y2 / ROW_H)} vs content row ${cr}`);
        }
      }
    }
    expect(contentOverlaps).toBe(0);

    console.log("TEST 1 PASS: Screenshot moved minimum distance, no overlaps");
  });

  it("TEST 2: Screenshot not overlapping content should stay in place", async () => {
    // Scenario:
    // Rows 1-6: Content
    // Rows 7-20: Screenshot in gap (not overlapping content)
    // Rows 21-40: Next content
    //
    // Expected:
    // - Screenshot stays at row 7 (no movement)
    // - Content unchanged

    const CONTENT_ROWS = [1, 2, 3, 4, 5, 6, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40];
    
    // Screenshot: from row 7 to row 20 (in gap, not overlapping content)
    const ANCHORS: AnchorSpec[] = [
      { fromCol: 0, fromRow: 7, fromColOff: 0, fromRowOff: 0, toCol: 5, toRow: 20, toColOff: 0, toRowOff: 0, rId: "rId1" },
    ];

    const xlsxBuffer = await createTestXlsx(CONTENT_ROWS, ANCHORS);
    const zip = await loadZip(xlsxBuffer);
    const mockSheet = makeMockSheet(CONTENT_ROWS);
    const stats = await fixDrawingOverlaps(zip, mockSheet, "xl/worksheets/sheet1.xml");

    console.log("TEST 2 STATS:", JSON.stringify({
      imagesBefore: stats.imagesBefore,
      imagesAfter: stats.imagesAfter,
      overlapsBefore: stats.overlapsBefore,
      overlapsAfter: stats.overlapsAfter,
      contentConflictsBefore: stats.contentConflictsBefore,
      contentConflictsAfter: stats.contentConflictsAfter,
      repositioned: stats.imagesRepositioned,
    }));

    // Verify: All images preserved
    expect(stats.imagesBefore).toBe(1);
    expect(stats.imagesAfter).toBe(1);

    // Verify: No overlaps after optimization
    expect(stats.overlapsAfter).toBe(0);
    expect(stats.contentConflictsAfter).toBe(0);

    // Verify: Image stayed in place (not moved)
    const outputBuffer = await saveZip(zip);
    const outputZip = await loadZip(outputBuffer);
    const afterXml = await readEntryText(outputZip, "xl/drawings/drawing1.xml");

    // Parse final position
    const doc = parseXml(afterXml!);
    const root = doc.documentElement!;
    const anchors: Array<{ fromRow: number; fromRowOff: number; toRow: number; toRowOff: number }> = [];
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
          const intv = (e: any) => { const n = parseInt(textContent(e).trim(), 10); return isNaN(n) ? -1 : n; };
          anchors.push({
            fromRow: intv(firstChildElement(from, "row")),
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

    console.log("TEST 2 ANCHORS:", anchors.map((a) => `from=${a.fromRow} to=${a.toRow}`).join(", "));

    // The screenshot should stay at row 7 (not moved)
    const imageFromRow = anchors[0].fromRow;
    console.log(`TEST 2: Image stayed at row ${imageFromRow} (original was row 7)`);

    // Image should stay at row 7 (no movement)
    expect(imageFromRow).toBe(7);

    // Verify: All images at column A
    const cols = (afterXml!.match(/<xdr:from>[\s\S]*?<xdr:col>(\d+)<\/xdr:col>/g) || []).map((m) => parseInt(m.match(/<xdr:col>(\d+)/)![1], 10));
    for (const c of cols) expect(c).toBe(0);

    console.log("TEST 2 PASS: Screenshot stayed in place, no overlaps");
  });

  it("TEST 3: Multiple screenshots - cascading should be local", async () => {
    // Scenario:
    // Rows 1-6: Content A
    // Rows 7-20: Screenshot A (overlapping content A)
    // Rows 21-34: Screenshot B (overlapping content A)
    // Rows 35-48: Screenshot C (overlapping content A)
    // Rows 49-60: Content B
    //
    // Expected:
    // - Content A preserved
    // - Screenshot A moved to row 7 (minimum movement)
    // - Screenshot B moved to row 21 (after Screenshot A)
    // - Screenshot C moved to row 35 (after Screenshot B)
    // - Content B preserved
    //
    // NOT expected:
    // - Screenshots moved to row 100+ (cascading far away)

    const CONTENT_ROWS = [1, 2, 3, 4, 5, 6, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60];
    
    // Three screenshots, all overlapping content A
    const ANCHORS: AnchorSpec[] = [
      { fromCol: 0, fromRow: 7, fromColOff: 0, fromRowOff: 0, toCol: 5, toRow: 20, toColOff: 0, toRowOff: 0, rId: "rId1" },
      { fromCol: 0, fromRow: 21, fromColOff: 0, fromRowOff: 0, toCol: 5, toRow: 34, toColOff: 0, toRowOff: 0, rId: "rId2" },
      { fromCol: 0, fromRow: 35, fromColOff: 0, fromRowOff: 0, toCol: 5, toRow: 48, toColOff: 0, toRowOff: 0, rId: "rId3" },
    ];

    const xlsxBuffer = await createTestXlsx(CONTENT_ROWS, ANCHORS);
    const zip = await loadZip(xlsxBuffer);
    const mockSheet = makeMockSheet(CONTENT_ROWS);
    const stats = await fixDrawingOverlaps(zip, mockSheet, "xl/worksheets/sheet1.xml");

    console.log("TEST 3 STATS:", JSON.stringify({
      imagesBefore: stats.imagesBefore,
      imagesAfter: stats.imagesAfter,
      overlapsBefore: stats.overlapsBefore,
      overlapsAfter: stats.overlapsAfter,
      contentConflictsBefore: stats.contentConflictsBefore,
      contentConflictsAfter: stats.contentConflictsAfter,
      repositioned: stats.imagesRepositioned,
    }));

    // Verify: All images preserved
    expect(stats.imagesBefore).toBe(3);
    expect(stats.imagesAfter).toBe(3);

    // Verify: No overlaps after optimization
    expect(stats.overlapsAfter).toBe(0);
    expect(stats.contentConflictsAfter).toBe(0);

    // Verify: Images moved minimum distance
    const outputBuffer = await saveZip(zip);
    const outputZip = await loadZip(outputBuffer);
    const afterXml = await readEntryText(outputZip, "xl/drawings/drawing1.xml");

    // Parse final positions
    const doc = parseXml(afterXml!);
    const root = doc.documentElement!;
    const anchors: Array<{ fromRow: number; fromRowOff: number; toRow: number; toRowOff: number }> = [];
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
          const intv = (e: any) => { const n = parseInt(textContent(e).trim(), 10); return isNaN(n) ? -1 : n; };
          anchors.push({
            fromRow: intv(firstChildElement(from, "row")),
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

    console.log("TEST 3 ANCHORS:", anchors.map((a) => `from=${a.fromRow} to=${a.toRow}`).join(", "));

    // Each screenshot should be moved the minimum distance
    // Screenshot A: from row 7 to row 7 (minimum movement)
    // Screenshot B: from row 21 to row 21 (after Screenshot A)
    // Screenshot C: from row 35 to row 35 (after Screenshot B)
    for (let i = 0; i < anchors.length; i++) {
      const imageFromRow = anchors[i].fromRow;
      console.log(`TEST 3: Screenshot ${i} moved from row ${7 + i * 14} to row ${imageFromRow}`);
      
      // Each screenshot should be close to its original position
      // Allow some tolerance but not excessive movement
      expect(imageFromRow).toBeGreaterThanOrEqual(7 + i * 14); // At least at original position
      expect(imageFromRow).toBeLessThanOrEqual(7 + i * 14 + 5); // Not far away
    }

    // Verify: All images at column A
    const cols = (afterXml!.match(/<xdr:from>[\s\S]*?<xdr:col>(\d+)<\/xdr:col>/g) || []).map((m) => parseInt(m.match(/<xdr:col>(\d+)/)![1], 10));
    for (const c of cols) expect(c).toBe(0);

    // Verify: No image-image overlap
    const ROW_H = 15 * 12700;
    const emuTop = (row0: number, off: number) => row0 * ROW_H + off;
    const rects = anchors.map((a) => ({
      y1: emuTop(a.fromRow, a.fromRowOff),
      y2: a.toRow >= 0 ? emuTop(a.toRow, a.toRowOff) : emuTop(a.fromRow, a.fromRowOff) + ROW_H,
    }));

    let imgOverlaps = 0;
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        if (rects[i].y1 < rects[j].y2 && rects[j].y1 < rects[i].y2) {
          imgOverlaps++;
          console.log(`  OVERLAP img#${i} vs img#${j}`);
        }
      }
    }
    expect(imgOverlaps).toBe(0);

    // Verify: No image-content overlap
    const sheetDoc = parseXml((await readEntryText(outputZip, "xl/worksheets/sheet1.xml"))!);
    const sheetData = firstChildElement(sheetDoc.documentElement!, "sheetData");
    const contentRowsSet = new Set<number>();
    for (const rowEl of childElements(sheetData!, "row")) {
      const r = parseInt(getAttr(rowEl, "r") ?? "", 10);
      if (childElements(rowEl, "c").length > 0) contentRowsSet.add(r);
    }
    let contentOverlaps = 0;
    for (let i = 0; i < rects.length; i++) {
      for (const cr of contentRowsSet) {
        if (rects[i].y1 < cr * ROW_H && rects[i].y2 > (cr - 1) * ROW_H) {
          contentOverlaps++;
          console.log(`  CONTENT OVERLAP img#${i} vs row ${cr}`);
        }
      }
    }
    expect(contentOverlaps).toBe(0);

    console.log("TEST 3 PASS: Multiple screenshots moved minimum distance, no overlaps");
  });
});
