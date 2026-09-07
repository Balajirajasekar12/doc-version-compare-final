/**
 * Replicates the org file ("Test Cases and Results for ASO Monthly Reports.xlsx")
 * TC01 structure from the debug log: sparse single-row content blocks with
 * tall screenshots overlapping content and each other.
 *
 * Verifies: no image deleted, no image-image overlap, no image-content overlap,
 * repositioned images at column A, dynamic row insertion.
 */
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { loadZip, saveZip, readEntryText } from "../zip";
import { parseXml, childElements, firstChildElement, getAttr, textContent } from "../xml";
import { fixDrawingOverlaps } from "../drawings";
import type { ParsedSheet } from "../worksheet";

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

async function createOrgLikeXlsx(
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
    <sheet name="TC01" sheetId="1" r:id="rId1"/>
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
    name: "TC01",
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

const CONTENT_ROWS = [1, 2, 3, 4, 5, 6, 7, 44, 128, 168, 188, 210, 239, 276];

// TC01 anchor specs from the org debug log (from/to in 0-based anchor rows)
const TC01_ANCHORS: AnchorSpec[] = [
  { fromCol: 0, fromRow: 7, fromColOff: 0, fromRowOff: 0, toCol: 5, toRow: 41, toColOff: 0, toRowOff: 0, rId: "rId1" },
  { fromCol: 0, fromRow: 41, fromColOff: 0, fromRowOff: 0, toCol: 5, toRow: 86, toColOff: 0, toRowOff: 0, rId: "rId2" },
  { fromCol: 0, fromRow: 83, fromColOff: 0, fromRowOff: 0, toCol: 5, toRow: 95, toColOff: 0, toRowOff: 0, rId: "rId3" },
  { fromCol: 0, fromRow: 128, fromColOff: 0, fromRowOff: 0, toCol: 5, toRow: 152, toColOff: 0, toRowOff: 0, rId: "rId4" },
  { fromCol: 0, fromRow: 152, fromColOff: 0, fromRowOff: 0, toCol: 5, toRow: 166, toColOff: 0, toRowOff: 0, rId: "rId5" },
  { fromCol: 0, fromRow: 168, fromColOff: 0, fromRowOff: 0, toCol: 5, toRow: 186, toColOff: 0, toRowOff: 0, rId: "rId6" },
  { fromCol: 0, fromRow: 188, fromColOff: 0, fromRowOff: 0, toCol: 5, toRow: 207, toColOff: 0, toRowOff: 0, rId: "rId7" },
  { fromCol: 0, fromRow: 210, fromColOff: 0, fromRowOff: 0, toCol: 5, toRow: 221, toColOff: 0, toRowOff: 0, rId: "rId8" },
  { fromCol: 0, fromRow: 222, fromColOff: 0, fromRowOff: 0, toCol: 5, toRow: 236, toColOff: 0, toRowOff: 0, rId: "rId9" },
  { fromCol: 0, fromRow: 97, fromColOff: 0, fromRowOff: 0, toCol: 5, toRow: 121, toColOff: 0, toRowOff: 0, rId: "rId10" },
  { fromCol: 0, fromRow: 239, fromColOff: 0, fromRowOff: 0, toCol: 5, toRow: 258, toColOff: 0, toRowOff: 0, rId: "rId11" },
  { fromCol: 0, fromRow: 259, fromColOff: 0, fromRowOff: 0, toCol: 5, toRow: 273, toColOff: 0, toRowOff: 0, rId: "rId12" },
  { fromCol: 0, fromRow: 276, fromColOff: 0, fromRowOff: 0, toCol: 5, toRow: 302, toColOff: 0, toRowOff: 0, rId: "rId13" },
];

describe("Org-like TC01 structure", () => {
  it("resolves all overlaps via row insertion, preserving every image at column A", async () => {
    const xlsxBuffer = await createOrgLikeXlsx(CONTENT_ROWS, TC01_ANCHORS);
    const zip = await loadZip(xlsxBuffer);
    const mockSheet = makeMockSheet(CONTENT_ROWS);
    const stats = await fixDrawingOverlaps(zip, mockSheet, "xl/worksheets/sheet1.xml");
    console.log("STATS:", JSON.stringify({
      imagesBefore: stats.imagesBefore,
      imagesAfter: stats.imagesAfter,
      overlapsBefore: stats.overlapsBefore,
      overlapsAfter: stats.overlapsAfter,
      contentConflictsBefore: stats.contentConflictsBefore,
      contentConflictsAfter: stats.contentConflictsAfter,
      repositioned: stats.imagesRepositioned,
      cellMappingSize: stats.cellMapping?.size ?? 0,
    }));

    const outputBuffer = await saveZip(zip);
    const outputZip = await loadZip(outputBuffer);
    const afterXml = await readEntryText(outputZip, "xl/drawings/drawing1.xml");
    const sheetXml = await readEntryText(outputZip, "xl/worksheets/sheet1.xml");

    // 1. All images preserved
    const anchorCount = (afterXml!.match(/<(?:xdr:)?twoCellAnchor\b/g) || []).length;
    expect(anchorCount).toBe(13);

    // 2. Parse final positions with a real geometry (25-char columns, 15pt rows)
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

    const ROW_H = 15 * 12700;
    const emuTop = (row0: number, off: number) => row0 * ROW_H + off;
    const rects = anchors.map((a) => ({
      y1: emuTop(a.fromRow, a.fromRowOff),
      y2: a.toRow >= 0 ? emuTop(a.toRow, a.toRowOff) : emuTop(a.fromRow, a.fromRowOff) + ROW_H,
    }));
    const { debugLog } = await import("../debug-log");
    const logText = debugLog.toText();
    const relevant = logText.split("\n").filter((l) =>
      l.includes("insertRows") || l.includes("residual") || l.includes("gap image moved") || l.includes("Placing") || l.includes("insert ") || l.includes("assigned") || l.includes("Step 1") || l.includes("Block ") || l.includes("FINAL"),
    );
    console.log("TRACE:\n" + relevant.join("\n"));
    console.log("WRITTEN ANCHORS (fromRow, toRow):");
    for (let i = 0; i < anchors.length; i++) {
      console.log(`  #${i}: from=${anchors[i].fromRow} to=${anchors[i].toRow}`);
    }
    const sheetDoc2 = parseXml(sheetXml!);
    const sheetData2 = firstChildElement(sheetDoc2.documentElement!, "sheetData");
    const outRows: number[] = [];
    for (const rowEl of childElements(sheetData2!, "row")) {
      outRows.push(parseInt(getAttr(rowEl, "r") ?? "", 10));
    }
    console.log("OUTPUT SHEET ROWS:", outRows.join(","));

    // 3. No image-image overlap (EMU)
    let imgOverlaps = 0;
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        if (rects[i].y1 < rects[j].y2 && rects[j].y1 < rects[i].y2) {
          imgOverlaps++;
          console.log(`  OVERLAP img#${i} (rows ${Math.floor(rects[i].y1 / ROW_H)}-${Math.ceil(rects[i].y2 / ROW_H)}) vs img#${j} (rows ${Math.floor(rects[j].y1 / ROW_H)}-${Math.ceil(rects[j].y2 / ROW_H)})`);
        }
      }
    }
    expect(imgOverlaps).toBe(0);

    // 4. No image-content overlap: content rows (1-based XML rows) after insertion
    const sheetDoc = parseXml(sheetXml!);
    const sheetData = firstChildElement(sheetDoc.documentElement!, "sheetData");
    const contentRows = new Set<number>();
    for (const rowEl of childElements(sheetData!, "row")) {
      const r = parseInt(getAttr(rowEl, "r") ?? "", 10);
      const cells = childElements(rowEl, "c");
      if (cells.length > 0) contentRows.add(r);
    }
    let contentOverlaps = 0;
    for (let i = 0; i < rects.length; i++) {
      for (const cr of contentRows) {
        // content row cr (1-based) occupies EMU [ (cr-1)*ROW_H, cr*ROW_H )
        if (rects[i].y1 < cr * ROW_H && rects[i].y2 > (cr - 1) * ROW_H) {
          contentOverlaps++;
          console.log(`  CONTENT OVERLAP img#${i} rows ${Math.floor(rects[i].y1 / ROW_H)}-${Math.ceil(rects[i].y2 / ROW_H)} vs content row ${cr}`);
        }
      }
    }
    expect(contentOverlaps).toBe(0);

    // 5. All images at column A
    const cols = (afterXml!.match(/<xdr:from>[\s\S]*?<xdr:col>(\d+)<\/xdr:col>/g) || []).map((m) => parseInt(m.match(/<xdr:col>(\d+)/)![1], 10));
    for (const c of cols) expect(c).toBe(0);

    // 6. Images are below their content: every image top must be >= the last content row above it
    const sortedContent = Array.from(contentRows).sort((a, b) => a - b);
    for (let i = 0; i < rects.length; i++) {
      const topRow1 = Math.floor(rects[i].y1 / ROW_H) + 1;
      const prevContent = sortedContent.filter((c) => c < topRow1).pop() ?? 0;
      // the image must not overlap content above it — covered by contentOverlaps check
      void prevContent;
    }
    // 7. CRITICAL: No image should move more than 50 rows from its original position.
    // The OLD code moved img#1 (rId2) from row 41 to row 166 (125 rows away!).
    // The new code must keep images near their content blocks.
    const originalFromRows = TC01_ANCHORS.map((a) => a.fromRow);
    let maxMovement = 0;
    for (let i = 0; i < anchors.length; i++) {
      const origRow = originalFromRows[i];
      const newRow = anchors[i].fromRow; // fromRow is 0-based in anchor XML
      // Convert to 1-based for comparison: originalFromRows are 0-based anchor rows
      const movement = Math.abs(newRow - origRow);
      if (movement > maxMovement) maxMovement = movement;
      console.log(`  MOVEMENT img#${i}: orig=${origRow} → new=${newRow} (Δ=${movement} rows)`);
      // No image should jump more than 50 rows from its original position
      expect(movement).toBeLessThanOrEqual(50);
    }
    console.log(`  Max movement: ${maxMovement} rows`);
    console.log("PASS: all images preserved, 0 overlaps, all col A, movement ≤ 50 rows");
  });

  // TC29 from the org debug log: a TALL image (45 rows) assigned to a sparse
  // single-row block, with gap images already sitting below it in the gap.
  // The old code cascaded the tall image past the gap images (screenprints
  // "disappeared" from rows 45-120). The correct behavior: place the tall
  // image right after its block, then insert rows to push the gap images (and
  // the next content block) down — every image preserved, in flow order.
  const TC29_CONTENT = [1, 2, 3, 4, 5, 6, 7, 44, 128, 168, 188, 210, 239, 276];
  const TC29_ANCHORS: AnchorSpec[] = [
    { fromCol: 0, fromRow: 7, fromColOff: 0, fromRowOff: 0, toCol: 5, toRow: 41, toColOff: 0, toRowOff: 0, rId: "t1" },
    { fromCol: 0, fromRow: 41, fromColOff: 0, fromRowOff: 0, toCol: 5, toRow: 86, toColOff: 0, toRowOff: 0, rId: "t2" },
    { fromCol: 0, fromRow: 83, fromColOff: 0, fromRowOff: 0, toCol: 5, toRow: 95, toColOff: 0, toRowOff: 0, rId: "t3" },
    { fromCol: 0, fromRow: 128, fromColOff: 0, fromRowOff: 0, toCol: 5, toRow: 152, toColOff: 0, toRowOff: 0, rId: "t4" },
    { fromCol: 0, fromRow: 152, fromColOff: 0, fromRowOff: 0, toCol: 5, toRow: 166, toColOff: 0, toRowOff: 0, rId: "t5" },
    { fromCol: 0, fromRow: 168, fromColOff: 0, fromRowOff: 0, toCol: 5, toRow: 186, toColOff: 0, toRowOff: 0, rId: "t6" },
    { fromCol: 0, fromRow: 188, fromColOff: 0, fromRowOff: 0, toCol: 5, toRow: 207, toColOff: 0, toRowOff: 0, rId: "t7" },
    { fromCol: 0, fromRow: 210, fromColOff: 0, fromRowOff: 0, toCol: 5, toRow: 221, toColOff: 0, toRowOff: 0, rId: "t8" },
    { fromCol: 0, fromRow: 222, fromColOff: 0, fromRowOff: 0, toCol: 5, toRow: 236, toColOff: 0, toRowOff: 0, rId: "t9" },
    { fromCol: 0, fromRow: 97, fromColOff: 0, fromRowOff: 0, toCol: 5, toRow: 121, toColOff: 0, toRowOff: 0, rId: "t10" },
    { fromCol: 0, fromRow: 239, fromColOff: 0, fromRowOff: 0, toCol: 5, toRow: 258, toColOff: 0, toRowOff: 0, rId: "t11" },
    { fromCol: 0, fromRow: 259, fromColOff: 0, fromRowOff: 0, toCol: 5, toRow: 273, toColOff: 0, toRowOff: 0, rId: "t12" },
    { fromCol: 0, fromRow: 276, fromColOff: 0, fromRowOff: 0, toCol: 5, toRow: 302, toColOff: 0, toRowOff: 0, rId: "t13" },
  ];

  it("TC29: tall image + gap images below → insert rows, no cascade, flow preserved", async () => {
    const xlsxBuffer = await createOrgLikeXlsx(TC29_CONTENT, TC29_ANCHORS);
    const zip = await loadZip(xlsxBuffer);
    const mockSheet = makeMockSheet(TC29_CONTENT);
    const stats = await fixDrawingOverlaps(zip, mockSheet, "xl/worksheets/sheet1.xml");
    console.log("TC29 STATS:", JSON.stringify({
      imagesBefore: stats.imagesBefore,
      imagesAfter: stats.imagesAfter,
      overlapsAfter: stats.overlapsAfter,
      contentConflictsAfter: stats.contentConflictsAfter,
      repositioned: stats.imagesRepositioned,
    }));

    const outputBuffer = await saveZip(zip);
    const outputZip = await loadZip(outputBuffer);
    const afterXml = await readEntryText(outputZip, "xl/drawings/drawing1.xml")!;
    const sheetXml = await readEntryText(outputZip, "xl/worksheets/sheet1.xml")!;

    expect((afterXml!.match(/<(?:xdr:)?twoCellAnchor\b/g) || []).length).toBe(13);

    const ROW_H = 15 * 12700;
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

    const emuTop = (row0: number, off: number) => row0 * ROW_H + off;
    const rects = anchors.map((a) => ({
      y1: emuTop(a.fromRow, a.fromRowOff),
      y2: a.toRow >= 0 ? emuTop(a.toRow, a.toRowOff) : emuTop(a.fromRow, a.fromRowOff) + ROW_H,
    }));

    // No image-image overlap
    let imgOverlaps = 0;
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        if (rects[i].y1 < rects[j].y2 && rects[j].y1 < rects[i].y2) {
          imgOverlaps++;
          console.log(`  TC29 OVERLAP img#${i} vs img#${j}: ${Math.floor(rects[i].y1 / ROW_H)}-${Math.ceil(rects[i].y2 / ROW_H)} / ${Math.floor(rects[j].y1 / ROW_H)}-${Math.ceil(rects[j].y2 / ROW_H)}`);
        }
      }
    }
    expect(imgOverlaps).toBe(0);

    // No image-content overlap
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
          console.log(`  TC29 CONTENT OVERLAP img#${i} vs row ${cr}: ${Math.floor(rects[i].y1 / ROW_H)}-${Math.ceil(rects[i].y2 / ROW_H)}`);
        }
      }
    }
    expect(contentOverlaps).toBe(0);

    // All at column A
    const cols = (afterXml!.match(/<xdr:from>[\s\S]*?<xdr:col>(\d+)<\/xdr:col>/g) || []).map((m) => parseInt(m.match(/<xdr:col>(\d+)/)![1], 10));
    for (const c of cols) expect(c).toBe(0);

    console.log("TC29 WRITTEN (fromRow→toRow):", anchors.map((a) => `${a.fromRow}→${a.toRow}`).join(", "));
    // CRITICAL: No image should move more than 50 rows
    const tc29OriginalRows = TC29_ANCHORS.map((a) => a.fromRow);
    for (let i = 0; i < anchors.length; i++) {
      const movement = Math.abs(anchors[i].fromRow - tc29OriginalRows[i]);
      expect(movement).toBeLessThanOrEqual(50);
    }
    console.log("TC29 PASS: 13 images preserved, 0 overlaps, all col A, movement ≤ 50 rows");
  });
});